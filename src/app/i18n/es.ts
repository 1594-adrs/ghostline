/** Source of truth for message keys: `en.ts` must implement the same `Dictionary`. */
export const ES = {
  'app.name': 'Ghostline',

  // overlay
  'overlay.empty.title': 'No hay ningún guion abierto',
  'overlay.empty.body':
    'Abre un archivo .md o .txt desde el icono de Ghostline en la bandeja del sistema o en Ajustes.',
  'overlay.end': 'Fin del guion',
  'overlay.pause': 'Pausa',
  'overlay.edit.drag': 'Arrastra para mover',
  'overlay.edit.done': 'Terminar con',
  'overlay.edit.hotkeys': 'Atajos de teclado',
  'hud.playing': 'Leyendo',
  'hud.paused': 'En pausa',
  'hud.finished': 'Terminado',
  'hud.auto': 'Auto',
  'hud.voice': 'Voz',
  'hud.micOff': 'Micrófono apagado',
  'hud.confidence': 'Confianza {pct} %',
  'hud.wpmUnit': 'ppm',

  // hotkey actions
  'hotkey.toggle-play': 'Reproducir o pausar',
  'hotkey.prev-block': 'Párrafo anterior',
  'hotkey.next-block': 'Párrafo siguiente',
  'hotkey.speed-down': 'Más lento',
  'hotkey.speed-up': 'Más rápido',
  'hotkey.prev-section': 'Sección anterior',
  'hotkey.next-section': 'Sección siguiente',
  'hotkey.toggle-visible': 'Mostrar u ocultar',
  'hotkey.toggle-edit': 'Mover y redimensionar',
  'hotkey.toggle-voice': 'Seguir la voz o automático',
  'hotkey.cycle-mode': 'Cambiar disposición',
  'hotkey.toggle-capture': 'Ocultar de capturas',

  // key names
  'key.Super': 'Win',
  'key.PageUp': 'RePág',
  'key.PageDown': 'AvPág',
  'key.Space': 'Espacio',
  'key.Delete': 'Supr',
  'key.Insert': 'Insert',
  'key.Home': 'Inicio',
  'key.End': 'Fin',
  'key.Enter': 'Intro',
  'key.Backspace': 'Retroceso',

  // settings — shell
  'settings.title': 'Ajustes',
  'settings.nav': 'Secciones de ajustes',
  'settings.error.dismiss': 'Descartar aviso',

  // script
  'script.title': 'Guion',
  'script.none': 'Ningún guion abierto',
  'script.open': 'Abrir guion…',
  'script.change': 'Cambiar guion…',
  'script.current': 'Guion actual',
  'script.reloads': 'Se recarga solo cuando guardas cambios en el archivo.',
  'script.syntax': 'Cómo lee Ghostline tu guion',
  'script.syntax.heading': 'empieza una sección; se muestra, no se lee',
  'script.syntax.note': 'nota para ti, atenuada; no se lee',
  'script.syntax.pause': 'pausa visible antes de seguir',
  'script.syntax.emphasis': 'énfasis',

  // display
  'display.title': 'Pantalla',
  'display.mode': 'Disposición',
  'display.mode.corner': 'Esquina',
  'display.mode.corner.hint': 'Compacto, arriba a la derecha',
  'display.mode.strip': 'Franja',
  'display.mode.strip.hint': 'Bajo la cámara, ojos al frente',
  'display.mode.full': 'Pantalla completa',
  'display.mode.full.hint': 'Para leer de lejos',
  'display.fontSize': 'Tamaño del texto',
  'display.opacity': 'Opacidad del fondo',
  'display.opacity.hint': 'Más baja deja ver lo que hay detrás; más alta mejora la lectura.',
  'display.speed': 'Velocidad automática',
  'display.speed.hint': 'Palabras por minuto cuando no sigues la voz.',
  'display.preview': 'Vista previa',
  'display.preview.sample': 'Buenos días a todos, gracias por venir.',
  'unit.px': '{n} px',
  'unit.pct': '{n} %',
  'unit.wpm': '{n} ppm',

  // voice
  'voice.title': 'Voz',
  'voice.model': 'Modelo de reconocimiento',
  'voice.model.installed': 'Instalado y listo',
  'voice.model.missing': 'Se descarga una sola vez y funciona sin conexión.',
  'voice.model.install': 'Descargar modelo',
  'voice.model.installing': 'Descargando…',
  'voice.model.progress': '{received} de {total} MB',
  'voice.model.progressUnknown': '{received} MB descargados',
  'voice.mic': 'Micrófono',
  'voice.mic.default': 'Predeterminado del sistema',
  'voice.mic.refresh': 'Actualizar la lista de micrófonos',
  'voice.note':
    'El reconocimiento solo entiende español por ahora. El audio se procesa en tu equipo y no sale de él.',

  // hotkeys
  'hotkeys.title': 'Atajos de teclado',
  'hotkeys.hint': 'Funcionan en todo Windows, aunque Ghostline no tenga el foco.',
  'hotkeys.reset': 'Restablecer atajos',
  'hotkeys.record': 'Cambiar el atajo de {action}. Actual: {combo}',
  'hotkeys.recording': 'Pulsa la combinación…',
  'hotkeys.recording.hint': 'Esc para cancelar',
  'hotkeys.needsModifier': 'Añade Ctrl, Alt, Shift o Win a la tecla.',
  'hotkeys.unsupported': 'Esa tecla no se puede usar como atajo global.',
  'hotkeys.altgr':
    'Ctrl+Alt con una letra, número o símbolo equivale a AltGr y bloquearía caracteres como € o @. Usa F1–F12, flechas o RePág/AvPág.',
  'hotkeys.duplicate': 'También está asignado a «{action}».',

  // privacy
  'privacy.title': 'Privacidad',
  'privacy.capture': 'Ocultar de capturas y videollamadas',
  'privacy.capture.hint':
    'Meet, Teams, OBS y las grabaciones de pantalla no muestran el teleprompter; tú sí lo ves.',
  'privacy.capture.limit':
    'Algunas capturas (tarjetas capturadoras, programas antiguos) pueden mostrarlo igualmente. Haz una prueba antes de presentar.',

  // language
  'language.title': 'Idioma',
  'language.label': 'Idioma de la interfaz',
} as const satisfies Record<string, string>;

export type Dictionary = Record<keyof typeof ES, string>;
