import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  test: {
    // Environment
    environment: 'happy-dom',

    // Global test setup
    setupFiles: ['./src/test/setup.ts'],

    // Include patterns for test files
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // Globals (optional - enables `describe`, `it`, `expect` without imports)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],

      // Files to include in coverage
      include: ['src/**/*.{ts,tsx}'],

      // Files to exclude from coverage
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/types/**',
        'src/components/ui/**', // External UI library components
        '**/node_modules/**',
      ],

      // Coverage thresholds (90% requirement)
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 75,
        statements: 88,
      },

      // Clean coverage directory before running tests
      clean: true,

      // Coverage output directory
      reportsDirectory: './coverage',
    },

    environmentMatchGlobs: [
      ['src/main.test.ts', 'node'],
    ],
  },
});
