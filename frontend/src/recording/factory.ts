import type { BaseDesktopRecorder } from './base';
import { createNativeRecorder } from './native';

export type RecorderKind = 'native' | 'owa'; // extend later

export function desktop_recorder_factory(kind: RecorderKind): BaseDesktopRecorder {
  switch (kind) {
    case 'native':
    default:
      return createNativeRecorder();
  }
}