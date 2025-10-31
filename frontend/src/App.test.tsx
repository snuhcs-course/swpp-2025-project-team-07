import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { recorderSpy } = vi.hoisted(() => ({
  recorderSpy: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="recorder-provider">{children}</div>
  )),
}));

vi.mock('./components/AppContainer', () => ({
  AppContainer: () => <div data-testid="app-container">container</div>,
}));

vi.mock('./recording/provider', () => ({
  RecorderProvider: recorderSpy,
}));

import App from './App';

describe('App', () => {
  it('wraps AppContainer with RecorderProvider and applies dark theme', () => {
    render(<App />);

    expect(recorderSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('app-container')).toBeInTheDocument();
    const wrapper = screen.getByTestId('recorder-provider');
    expect(wrapper).toContainElement(screen.getByTestId('app-container'));
    expect(screen.getByTestId('app-container').parentElement).toHaveClass('size-full', 'dark');
  });
});
