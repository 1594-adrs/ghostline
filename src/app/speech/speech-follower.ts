import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { align } from '../align/align';
import type { IpcEvents } from '../core/contracts';
import { invoke, listen } from '../core/ipc';
import { normalizeSpeech } from '../core/normalize';
import { PrompterStore } from '../prompter/prompter.store';

export type SpeechEvent = IpcEvents['speech'];

/** Recent words handed to `align`: enough for re-read (3) and far-jump (4) evidence plus context. */
export const HEARD_WINDOW = 10;

/**
 * Turns Vosk events into a sliding list of recent normalized words, oldest first.
 * Finals are committed; the open utterance's partial (cumulative, may be revised) is kept apart and replaced
 * on every update, so revisions never double count. Events for an already-closed utterance are ignored.
 */
export class HeardBuffer {
  private committed: string[] = [];
  private partial: string[] = [];
  private open: number | null = null;
  private lastClosed = -1;
  /** Words of the open utterance said before `clear()`; they must not come back with the next partial. */
  private skip = 0;

  constructor(private readonly max = HEARD_WINDOW) {}

  push({ kind, utterance, text }: SpeechEvent): void {
    if (utterance <= this.lastClosed) return;
    if (this.open !== null && this.open !== utterance) this.close(this.partial); // final was lost
    this.open = utterance;
    const words = normalizeSpeech(text);
    if (kind === 'partial') {
      this.partial = words;
    } else {
      this.close(words);
      this.lastClosed = utterance;
    }
  }

  words(): string[] {
    return [...this.committed, ...this.partial.slice(this.skip)].slice(-this.max);
  }

  /** Forget what was heard (the cursor was moved by something else). The open utterance keeps going. */
  clear(): void {
    this.committed = [];
    this.skip = this.partial.length;
  }

  private close(words: string[]): void {
    this.committed = [...this.committed, ...words.slice(this.skip)].slice(-this.max);
    this.partial = [];
    this.open = null;
    this.skip = 0;
  }
}

/** The slice of the Tauri bridge the follower needs; swap it in tests. */
export interface SpeechIpc {
  invoke(command: 'start_listening' | 'stop_listening'): Promise<void>;
  listen(event: 'speech', handler: (payload: SpeechEvent) => void): Promise<() => void>;
}

export const SPEECH_IPC = new InjectionToken<SpeechIpc>('SPEECH_IPC', {
  providedIn: 'root',
  factory: (): SpeechIpc =>
    isTauri()
      ? { invoke: (command) => invoke(command), listen: (event, handler) => listen(event, handler) }
      : { invoke: async () => undefined, listen: async () => () => undefined }, // browser preview: no mic
});

/** Moves the prompter cursor from speech while `follow === 'voice'` and playing. */
@Injectable({ providedIn: 'root' })
export class SpeechFollower {
  private readonly store = inject(PrompterStore);
  private readonly ipc = inject(SPEECH_IPC);
  private buffer = new HeardBuffer();
  private unlisten: Promise<() => void> | null = null;
  /** Cursor after our last update; any other value means a hotkey, auto-scroll or reload moved it. */
  private expected: number | null = null;

  /** Alignment confidence of the last update, 0..1, for the HUD. */
  readonly confidence = signal(0);
  /** The mic is actually capturing (start succeeded, not stopped yet). */
  readonly listening = signal(false);

  async start(): Promise<void> {
    if (this.unlisten) return;
    // Rust numbers utterances from 0 in every session; a buffer from the last session would drop them.
    this.buffer = new HeardBuffer();
    this.expected = null;
    const pending = this.ipc.listen('speech', (e) => this.onSpeech(e));
    this.unlisten = pending;
    try {
      await pending;
      if (this.unlisten !== pending) return; // stop() ran while subscribing
      await this.ipc.invoke('start_listening');
      // A stop() issued while the mic was opening wins; its stop_listening may have reached Rust first.
      if (this.unlisten === pending) this.listening.set(true);
      else await this.ipc.invoke('stop_listening');
    } catch (e) {
      if (this.unlisten === pending) this.unlisten = null;
      (await pending.catch(() => null))?.();
      throw e;
    }
  }

  async stop(): Promise<void> {
    const unlisten = this.unlisten;
    if (!unlisten) return;
    this.unlisten = null;
    this.listening.set(false);
    (await unlisten)();
    this.confidence.set(0);
    await this.ipc.invoke('stop_listening');
  }

  onSpeech(event: SpeechEvent): void {
    const { store } = this;
    if (this.expected !== null && store.cursor() !== this.expected) this.buffer.clear();
    this.buffer.push(event);
    if (store.follow() === 'voice' && store.playing()) {
      const { cursor, confidence } = align({
        words: store.script().words,
        cursor: store.cursor(),
        heard: this.buffer.words(),
      });
      if (cursor !== store.cursor()) store.setCursor(cursor);
      this.confidence.set(confidence);
    } else {
      this.confidence.set(0);
    }
    this.expected = store.cursor();
  }
}
