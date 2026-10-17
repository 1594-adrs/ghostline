//! Microphone capture (cpal) -> dedicated recognizer thread (Vosk). The audio callback only downmixes and `try_send`s.

use crate::{
    ipc::{BackendError, EVENT_BACKEND_ERROR, EVENT_SPEECH, Language, SpeechEvent, SpeechKind},
    model,
};
use cpal::{
    Device, FromSample, SampleFormat, SizedSample, Stream, StreamConfig,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, SyncSender},
    },
    thread::JoinHandle,
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use vosk::{DecodingState, Model, Recognizer};

/// Turns Vosk output into contract events: a `partial` whenever the text changes, a `final` (utterance += 1) when Vosk finalizes.
pub struct Transcriber {
    rec: Recognizer,
    utterance: u64,
    last_partial: String,
}

impl Transcriber {
    /// `rate` is the rate of the PCM fed to `push`. shortcut: Vosk takes it as-is (see the ignored 48 kHz test), no resampling.
    pub fn new(model: &Model, rate: f32) -> Result<Self, String> {
        let mut rec = Recognizer::new(model, rate).ok_or("Cannot create the speech recognizer.")?;
        rec.set_partial_words(false);
        Ok(Self {
            rec,
            utterance: 0,
            last_partial: String::new(),
        })
    }

    pub fn push(&mut self, pcm: &[i16]) -> Option<SpeechEvent> {
        match self.rec.accept_waveform(pcm) {
            Ok(DecodingState::Finalized) => {
                let text = self
                    .rec
                    .result()
                    .single()
                    .map(|r| r.text.to_string())
                    .unwrap_or_default();
                self.close(text)
            }
            Ok(DecodingState::Running) => {
                let text = self.rec.partial_result().partial.to_string();
                if text.is_empty() || text == self.last_partial {
                    return None;
                }
                self.last_partial = text.clone();
                Some(SpeechEvent {
                    kind: SpeechKind::Partial,
                    utterance: self.utterance,
                    text,
                })
            }
            _ => None,
        }
    }

    /// Flushes whatever is pending (call when the stream ends).
    pub fn finish(&mut self) -> Option<SpeechEvent> {
        let text = self
            .rec
            .final_result()
            .single()
            .map(|r| r.text.to_string())
            .unwrap_or_default();
        self.close(text)
    }

    fn close(&mut self, text: String) -> Option<SpeechEvent> {
        self.last_partial.clear();
        if text.is_empty() {
            return None;
        }
        let ev = SpeechEvent {
            kind: SpeechKind::Final,
            utterance: self.utterance,
            text,
        };
        self.utterance += 1;
        Some(ev)
    }
}

pub fn list_devices() -> Vec<String> {
    cpal::default_host()
        .input_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

pub fn load_model(data_dir: &Path, lang: Language) -> Result<Model, String> {
    if !model::installed(data_dir) {
        return Err(t(
            lang,
            "Instala primero el modelo de voz desde Ajustes.",
            "Install the voice model from Settings first.",
        )
        .into());
    }
    Model::new(model::model_dir(data_dir).to_string_lossy().into_owned())
        .ok_or_else(|| "Cannot load the voice model; reinstall it from Settings.".to_string())
}

fn t(lang: Language, es: &'static str, en: &'static str) -> &'static str {
    if lang == Language::Es { es } else { en }
}

fn mic_error(lang: Language, detail: impl std::fmt::Display) -> String {
    let hint = t(
        lang,
        "No se pudo usar el micrófono. Revisa Configuración de Windows > Privacidad > Micrófono y permite el acceso a apps de escritorio, o elige otro micrófono.",
        "Cannot use the microphone. Check Windows Settings > Privacy > Microphone and allow desktop apps, or pick another microphone.",
    );
    format!("{hint} ({detail})")
}

fn build_stream<T>(
    dev: &Device,
    cfg: &StreamConfig,
    tx: SyncSender<Vec<i16>>,
    on_err: impl FnMut(cpal::StreamError) + Send + 'static,
) -> Result<Stream, cpal::BuildStreamError>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = cfg.channels as usize;
    dev.build_input_stream(
        cfg,
        move |data: &[T], _| {
            let mono = data
                .chunks_exact(channels)
                .map(|frame| {
                    let avg =
                        frame.iter().map(|s| s.to_sample::<f32>()).sum::<f32>() / channels as f32;
                    (avg * 32767.0).clamp(-32768.0, 32767.0) as i16
                })
                .collect();
            let _ = tx.try_send(mono); // never block the audio thread; a full queue drops audio
        },
        on_err,
        None,
    )
}

fn open_mic(
    app: &AppHandle,
    device: Option<&str>,
    lang: Language,
    stop: &Arc<AtomicBool>,
) -> Result<(Stream, Receiver<Vec<i16>>, u32), String> {
    let host = cpal::default_host();
    let dev = match device {
        Some(name) => host
            .input_devices()
            .map_err(|e| mic_error(lang, e))?
            .find(|d| d.name().is_ok_and(|n| n == name)),
        None => host.default_input_device(),
    }
    .ok_or_else(|| {
        mic_error(
            lang,
            t(lang, "micrófono no encontrado", "microphone not found"),
        )
    })?;
    let supported = dev.default_input_config().map_err(|e| mic_error(lang, e))?;
    let (cfg, rate): (StreamConfig, u32) = (supported.config(), supported.sample_rate().0);
    let (tx, rx) = mpsc::sync_channel(64);
    let (app, stop) = (app.clone(), stop.clone());
    let on_err = move |e: cpal::StreamError| {
        stop.store(true, Ordering::SeqCst);
        let _ = app.emit(
            EVENT_BACKEND_ERROR,
            BackendError {
                message: mic_error(lang, e),
            },
        );
    };
    let stream = match supported.sample_format() {
        SampleFormat::F32 => build_stream::<f32>(&dev, &cfg, tx, on_err),
        SampleFormat::I16 => build_stream::<i16>(&dev, &cfg, tx, on_err),
        SampleFormat::U16 => build_stream::<u16>(&dev, &cfg, tx, on_err),
        SampleFormat::I32 => build_stream::<i32>(&dev, &cfg, tx, on_err),
        other => return Err(mic_error(lang, format!("formato {other:?}"))),
    }
    .map_err(|e| mic_error(lang, e))?;
    stream.play().map_err(|e| mic_error(lang, e))?;
    Ok((stream, rx, rate))
}

pub struct Session {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

impl Session {
    pub fn is_running(&self) -> bool {
        !self.thread.is_finished()
    }

    pub fn stop(self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = self.thread.join();
    }
}

/// Starts the capture + recognizer thread and waits until the microphone is actually open (or failed).
pub fn start(
    app: &AppHandle,
    model: Arc<Model>,
    device: Option<String>,
    lang: Language,
) -> Result<Session, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let (app2, stop2) = (app.clone(), stop.clone());
    let thread = std::thread::Builder::new()
        .name("speech".into())
        .spawn(move || {
            // The cpal Stream is !Send on some platforms, so it is created and dropped on this thread.
            let (stream, rx, rate) = match open_mic(&app2, device.as_deref(), lang, &stop2) {
                Ok(x) => x,
                Err(e) => return drop(ready_tx.send(Err(e))),
            };
            let mut transcriber = match Transcriber::new(&model, rate as f32) {
                Ok(t) => t,
                Err(e) => return drop(ready_tx.send(Err(e))),
            };
            let _ = ready_tx.send(Ok(()));
            let emit = |ev: Option<SpeechEvent>| {
                if let Some(ev) = ev {
                    let _ = app2.emit(EVENT_SPEECH, ev);
                }
            };
            while !stop2.load(Ordering::SeqCst) {
                match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(pcm) => emit(transcriber.push(&pcm)),
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            drop(stream);
            emit(transcriber.finish());
        })
        .map_err(|e| e.to_string())?;
    match ready_rx.recv_timeout(Duration::from_secs(15)) {
        Ok(Ok(())) => Ok(Session { stop, thread }),
        Ok(Err(e)) => Err(e),
        Err(_) => {
            stop.store(true, Ordering::SeqCst);
            Err(mic_error(lang, "timeout"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recognize(samples: &[i16], rate: f32) -> String {
        let path = std::env::var("GHOSTLINE_TEST_MODEL")
            .expect("set GHOSTLINE_TEST_MODEL to an extracted vosk-model-small-es-0.42 directory");
        let model = Model::new(path).expect("model");
        let mut t = Transcriber::new(&model, rate).unwrap();
        let mut text = Vec::new();
        for chunk in samples.chunks((rate / 10.0) as usize) {
            if let Some(ev) = t
                .push(chunk)
                .filter(|e| matches!(e.kind, SpeechKind::Final))
            {
                text.push(ev.text);
            }
        }
        text.extend(t.finish().map(|e| e.text));
        text.join(" ")
    }

    fn wav_16k() -> Vec<i16> {
        let mut r = hound::WavReader::open(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/es-test.wav"
        ))
        .unwrap();
        assert_eq!((r.spec().sample_rate, r.spec().channels), (16000, 1));
        r.samples::<i16>().map(Result::unwrap).collect()
    }

    #[test]
    #[ignore = "needs the Vosk model: set GHOSTLINE_TEST_MODEL"]
    fn recognizes_spanish_at_16k() {
        let text = recognize(&wav_16k(), 16000.0);
        assert!(text.contains("bienvenidos"), "got: {text}");
    }

    #[test]
    #[ignore = "needs the Vosk model: set GHOSTLINE_TEST_MODEL"]
    fn recognizes_spanish_fed_at_48k() {
        let up: Vec<i16> = wav_16k().iter().flat_map(|&s| [s; 3]).collect(); // crude 3x upsample, enough to test the rate handling
        let text = recognize(&up, 48000.0);
        assert!(text.contains("bienvenidos"), "got: {text}");
    }
}
