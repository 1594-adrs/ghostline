import { TestBed } from '@angular/core/testing';
import { PrompterStore } from '../prompter/prompter.store';
import {
  HeardBuffer,
  SPEECH_IPC,
  SpeechFollower,
  type SpeechEvent,
  type SpeechIpc,
} from './speech-follower';

const partial = (utterance: number, text: string): SpeechEvent => ({
  kind: 'partial',
  utterance,
  text,
});
const final = (utterance: number, text: string): SpeechEvent => ({
  kind: 'final',
  utterance,
  text,
});

describe('HeardBuffer', () => {
  it('replaces cumulative partials and commits finals once', () => {
    const b = new HeardBuffer();
    b.push(partial(0, 'hola'));
    b.push(partial(0, 'hola a'));
    b.push(partial(0, 'hola a todos'));
    b.push(partial(0, 'hola a todas'));
    expect(b.words()).toEqual(['hola', 'a', 'todas']);
    b.push(final(0, 'Hola a todas'));
    expect(b.words()).toEqual(['hola', 'a', 'todas']);
    b.push(final(0, 'hola a todas')); // duplicate final
    b.push(partial(0, 'hola a todas')); // late partial of a closed utterance
    b.push(partial(1, 'bienvenidos'));
    expect(b.words()).toEqual(['hola', 'a', 'todas', 'bienvenidos']);
  });

  it('keeps only the most recent words', () => {
    const b = new HeardBuffer(3);
    b.push(final(0, 'uno dos tres cuatro'));
    b.push(partial(1, 'cinco'));
    expect(b.words()).toEqual(['tres', 'cuatro', 'cinco']);
  });

  it('commits an open partial when a new utterance starts without its final', () => {
    const b = new HeardBuffer();
    b.push(partial(0, 'hola a'));
    b.push(partial(1, 'todos'));
    expect(b.words()).toEqual(['hola', 'a', 'todos']);
  });

  it('clear() forgets earlier words, including those already in the open partial', () => {
    const b = new HeardBuffer();
    b.push(final(0, 'uno dos'));
    b.push(partial(1, 'tres cuatro'));
    b.clear();
    expect(b.words()).toEqual([]);
    b.push(partial(1, 'tres cuatro cinco'));
    expect(b.words()).toEqual(['cinco']);
    b.push(final(1, 'tres cuatro cinco seis'));
    expect(b.words()).toEqual(['cinco', 'seis']);
  });
});

describe('SpeechFollower', () => {
  let handler: ((e: SpeechEvent) => void) | null;
  let ipc: SpeechIpc & { invoke: ReturnType<typeof vi.fn<SpeechIpc['invoke']>> };
  let unlisten: ReturnType<typeof vi.fn<() => void>>;
  let store: PrompterStore;
  let follower: SpeechFollower;

  beforeEach(() => {
    handler = null;
    unlisten = vi.fn<() => void>();
    ipc = {
      invoke: vi.fn<SpeechIpc['invoke']>(async () => undefined),
      listen: async (_event, h) => {
        handler = h;
        return unlisten;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: SPEECH_IPC, useValue: ipc }] });
    store = TestBed.inject(PrompterStore);
    follower = TestBed.inject(SpeechFollower);
    store.loadScript({
      path: 'x.txt',
      name: 'x.txt',
      format: 'txt',
      content: 'Hola a todos, bienvenidos al canal de cocina.',
    });
    store.setFollow('voice');
    store.playing.set(true);
  });

  it('start/stop invoke the backend and (un)subscribe', async () => {
    await follower.start();
    await follower.start(); // idempotent
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
    expect(ipc.invoke).toHaveBeenCalledWith('start_listening');
    expect(handler).not.toBeNull();
    await follower.stop();
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(ipc.invoke).toHaveBeenLastCalledWith('stop_listening');
  });

  it('a new session accepts utterance numbers starting again at 0', async () => {
    await follower.start();
    handler?.(final(0, 'hola a todos'));
    expect(store.cursor()).toBe(3);
    await follower.stop();
    await follower.start();
    handler?.(partial(0, 'hola a todos bienvenidos'));
    expect(store.cursor()).toBe(4);
  });

  it('stop() while the mic is opening leaves it closed and not listening', async () => {
    let open!: () => void;
    ipc.invoke.mockImplementationOnce(() => new Promise<void>((r) => (open = r)));
    const starting = follower.start();
    await vi.waitFor(() => expect(ipc.invoke).toHaveBeenCalledWith('start_listening'));
    await follower.stop();
    open();
    await starting;
    expect(follower.listening()).toBe(false);
    expect(ipc.invoke).toHaveBeenLastCalledWith('stop_listening');
  });

  it('follows cumulative and revised partials without double counting', async () => {
    await follower.start();
    const emit = (e: SpeechEvent) => handler?.(e);
    emit(partial(0, 'hola'));
    expect(store.cursor()).toBe(1);
    emit(partial(0, 'hola a'));
    emit(partial(0, 'hola a todos'));
    expect(store.cursor()).toBe(3);
    emit(partial(0, 'hola a todas'));
    emit(final(0, 'hola a todas'));
    expect(store.cursor()).toBe(3);
    emit(partial(1, 'bienvenidos al'));
    expect(store.cursor()).toBe(5);
    emit(final(1, 'bienvenidos al canal'));
    expect(store.cursor()).toBe(6);
    expect(follower.confidence()).toBeGreaterThan(0.5);
  });

  it('ignores speech when follow is auto or not playing', async () => {
    await follower.start();
    store.setFollow('auto');
    handler?.(partial(0, 'hola a todos'));
    expect(store.cursor()).toBe(0);
    store.setFollow('voice');
    store.playing.set(false);
    handler?.(partial(0, 'hola a todos bienvenidos'));
    expect(store.cursor()).toBe(0);
    expect(follower.confidence()).toBe(0);
  });

  it('a manual cursor move discards older heard words (no snap back)', async () => {
    await follower.start();
    const emit = (e: SpeechEvent) => handler?.(e);
    emit(final(0, 'hola a todos bienvenidos al'));
    expect(store.cursor()).toBe(5);
    store.setCursor(0); // hotkey back to the start
    emit(partial(1, 'eh'));
    expect(store.cursor()).toBe(0);
    emit(partial(1, 'eh hola a todos'));
    expect(store.cursor()).toBe(3);
  });
});
