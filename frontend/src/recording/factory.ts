import type { BaseDesktopRecorder } from './base';
import { NativeDesktopRecorder } from './native';
import { RecallDesktopRecorder } from './recall';
import { OWADesktopRecorder } from './owa';

export type RecorderKind = 'native' | 'recall' | 'owa';

export function desktop_recorder_factory(kind: RecorderKind = 'native'): BaseDesktopRecorder {
  switch (kind) {
    case 'recall': return new RecallDesktopRecorder();
    case 'owa':    return new OWADesktopRecorder();
    case 'native':
    default:       return new NativeDesktopRecorder();
  }
}