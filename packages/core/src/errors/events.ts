import type { St2160Error } from './st2160-error.js';

/** Non-fatal reports. Each module adds its events here and lists them in `St2160EventMap`. */
export interface ErrorEvent {
  readonly type: 'error';
  readonly error: St2160Error;
}

export interface St2160EventMap {
  error: ErrorEvent;
}

export type St2160EventType = keyof St2160EventMap;
export type St2160Event = St2160EventMap[St2160EventType];
export type St2160EventListener<T extends St2160EventType> = (event: St2160EventMap[T]) => void;
