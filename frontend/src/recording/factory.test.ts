import { describe, it, expect, vi } from 'vitest';

const { createNativeRecorderMock } = vi.hoisted(() => ({
  createNativeRecorderMock: vi.fn(() => ({ kind: 'native' })),
}));

vi.mock('./native', () => ({
  createNativeRecorder: createNativeRecorderMock,
}));

import { desktop_recorder_factory } from './factory';

describe('desktop_recorder_factory', () => {
  beforeEach(() => {
    createNativeRecorderMock.mockClear();
  });

  it('returns native recorder when kind is native', () => {
    const recorder = desktop_recorder_factory('native');
    expect(recorder).toEqual({ kind: 'native' });
    expect(createNativeRecorderMock).toHaveBeenCalledTimes(1);
  });
});
