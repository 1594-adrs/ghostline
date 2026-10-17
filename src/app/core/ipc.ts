import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';
import type { IpcCommands, IpcEvents } from './contracts';

/** Typed `invoke`: command names, args and results come from `IpcCommands`. */
export function invoke<K extends keyof IpcCommands>(
  command: K,
  ...args: IpcCommands[K][0] extends Record<string, never> ? [] : [IpcCommands[K][0]]
): Promise<IpcCommands[K][1]> {
  return tauriInvoke<IpcCommands[K][1]>(command, args[0]);
}

/** Typed `listen`: returns the unlisten function. */
export function listen<K extends keyof IpcEvents>(
  event: K,
  handler: (payload: IpcEvents[K]) => void,
): Promise<UnlistenFn> {
  return tauriListen<IpcEvents[K]>(event, (e) => handler(e.payload));
}
