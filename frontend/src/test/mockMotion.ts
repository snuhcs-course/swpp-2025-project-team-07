import React from 'react';
import { vi } from 'vitest';

vi.mock('motion/react', () => {
  const MotionComponent = React.forwardRef<any, any>((props, ref) => {
    const { children, ...rest } = props || {};
    return React.createElement('div', { ref, ...rest }, children);
  });

  const motionProxy = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === '__esModule') return true;
      if (prop === 'default') return MotionComponent;
      return MotionComponent;
    },
  });

  return { motion: motionProxy, AnimatePresence: MotionComponent };
});
