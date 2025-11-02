import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./styles/globals.css', () => ({}), { virtual: true });

describe('renderer entrypoint', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.innerHTML = '';
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('react-dom/client');
    vi.doUnmock('./App');
    vi.restoreAllMocks();
  });

  it('mounts App into the root element and enables dark mode', async () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);

    const renderMock = vi.fn();
    const createRootMock = vi.fn(() => ({ render: renderMock }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const appComponent = vi.fn(() => <div data-testid="app">App</div>);

    vi.doMock('react-dom/client', () => ({ createRoot: createRootMock }));
    vi.doMock('./App', () => ({ default: appComponent }));

    await import('./renderer');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(createRootMock).toHaveBeenCalledWith(container);
    expect(renderMock).toHaveBeenCalledTimes(1);

    const renderedElement = renderMock.mock.calls[0][0] as React.ReactElement;
    expect(renderedElement.type).toBe(React.StrictMode);
    const strictChildren = renderedElement.props.children;
    const childElement = Array.isArray(strictChildren) ? strictChildren[0] : strictChildren;
    expect(childElement.type).toBe(appComponent);

    logSpy.mockRestore();
  });

  it('throws a descriptive error when the root element is missing', async () => {
    const createRootMock = vi.fn(() => ({ render: vi.fn() }));
    vi.doMock('react-dom/client', () => ({ createRoot: createRootMock }));
    vi.doMock('./App', () => ({ default: () => <div /> }));

    await expect(import('./renderer')).rejects.toThrow('Failed to find the root element');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(createRootMock).not.toHaveBeenCalled();
  });
});
