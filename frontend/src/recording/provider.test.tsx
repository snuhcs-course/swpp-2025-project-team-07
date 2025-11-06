import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { recorderMock, desktopFactoryMock } = vi.hoisted(() => {
  const recorder = {
    init: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  return {
    recorderMock: recorder,
    desktopFactoryMock: vi.fn(() => recorder),
  };
});

vi.mock('./factory', () => ({
  desktop_recorder_factory: desktopFactoryMock,
}));

import { RecorderProvider, useRecorder } from './provider';

const TestConsumer = () => {
  const recorder = useRecorder();
  return <div data-testid="recorder">{recorder === recorderMock ? 'ok' : 'bad'}</div>;
};

describe('RecorderProvider', () => {
  beforeEach(() => {
    desktopFactoryMock.mockClear();
    recorderMock.init.mockClear();
    recorderMock.start.mockClear();
    recorderMock.stop.mockClear();
  });

  it('creates recorder via factory and calls init', () => {
    render(
      <RecorderProvider impl="native">
        <div>content</div>
      </RecorderProvider>,
    );

    expect(desktopFactoryMock).toHaveBeenCalledWith('native');
    expect(recorderMock.init).toHaveBeenCalledTimes(1);
  });

  it('exposes recorder via context hook', () => {
    render(
      <RecorderProvider impl="native">
        <TestConsumer />
      </RecorderProvider>,
    );

    expect(screen.getByTestId('recorder')).toHaveTextContent('ok');
  });

  it('throws helpful error when used outside provider', () => {
    const BrokenConsumer = () => {
      useRecorder();
      return null;
    };

    expect(() => render(<BrokenConsumer />)).toThrow('RecorderProvider missing');
  });
});
