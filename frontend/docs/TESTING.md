# Testing Guide

This document provides a comprehensive guide for testing the Clone Electron application.

## Table of Contents
- [Overview](#overview)
- [Testing Stack](#testing-stack)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Coverage Requirements](#coverage-requirements)
- [CI/CD Integration](#cicd-integration)

## Overview

The project uses a hybrid testing approach to achieve comprehensive test coverage:

- **Unit & Integration Tests**: Vitest + React Testing Library
- **End-to-End Tests**: Playwright for Electron
- **API Mocking**: MSW (Mock Service Worker)
- **Coverage Target**: 90%+

## Testing Stack

### Unit & Integration Testing
- **Vitest 4.x**: Fast, modern test runner powered by Vite
- **@testing-library/react**: Component testing utilities
- **@testing-library/user-event**: User interaction simulation
- **@testing-library/jest-dom**: Enhanced DOM assertions
- **happy-dom**: Lightweight DOM implementation
- **@vitest/coverage-v8**: V8-based code coverage

### E2E Testing
- **Playwright 1.56+**: Browser automation and Electron testing
- **@playwright/test**: Test framework for Playwright

### API Mocking
- **MSW 2.x**: API request interception for testing

## Running Tests

### Unit & Integration Tests

```bash
# Run tests in watch mode (development)
npm run test

# Run tests once (CI)
npm run test:unit

# Run tests in watch mode with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### E2E Tests

```bash
# Build the app first (required for E2E)
npm run build

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI mode
npm run test:e2e:ui

# Debug E2E tests
npm run test:e2e:debug
```

### All Tests

```bash
# Run all tests (unit + E2E)
npm run test:all
```

## Writing Tests

### Unit Test Example (Component)

Create test files alongside components with `.test.tsx` extension:

```typescript
// src/components/MyComponent.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('should handle user interactions', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();

    render(<MyComponent onClick={mockCallback} />);

    await user.click(screen.getByRole('button'));
    expect(mockCallback).toHaveBeenCalled();
  });
});
```

### Unit Test Example (Service)

```typescript
// src/services/myService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { myFunction } from './myService';

describe('myService', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should perform expected operation', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### Integration Test Example (with API Mocking)

```typescript
// src/components/DataFetcher.test.tsx
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { DataFetcher } from './DataFetcher';

const server = setupServer(
  http.get('http://localhost:8000/api/data', () => {
    return HttpResponse.json({ data: 'mocked data' });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('DataFetcher', () => {
  it('should fetch and display data', async () => {
    render(<DataFetcher />);

    await waitFor(() => {
      expect(screen.getByText('mocked data')).toBeInTheDocument();
    });
  });
});
```

### E2E Test Example

```typescript
// e2e/auth-flow.e2e.ts
import { test, expect } from '@playwright/test';
import { launchElectronApp, closeElectronApp } from './helpers/electron';

test.describe('Authentication Flow', () => {
  test('should allow user to login successfully', async () => {
    const { app, page } = await launchElectronApp();

    try {
      // Fill login form
      await page.fill('[name="email"]', 'test@example.com');
      await page.fill('[name="password"]', 'password123');

      // Click login button
      await page.click('button[type="submit"]');

      // Verify successful login
      await expect(page.locator('.chat-interface')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
```

## Coverage Requirements

The project enforces **90% code coverage** across:
- Lines
- Functions
- Branches
- Statements

### Checking Coverage

```bash
npm run test:coverage
```

This generates:
- Terminal output: Quick coverage summary
- HTML report: `coverage/index.html` (open in browser)
- LCOV report: `coverage/lcov.info` (for CI tools)

### Coverage Exclusions

The following are excluded from coverage requirements:
- Type definition files (`*.d.ts`)
- Test files (`*.test.tsx`, `*.spec.ts`)
- Main process (`src/main.ts`) - tested with Playwright E2E
- Preload scripts (`src/preload.ts`) - tested with Playwright E2E
- Test utilities (`src/test/**`)
- Type definitions (`src/types/**`)
- External UI components (`src/components/ui/**`)

## Test Organization

```
frontend/
├── src/
│   ├── components/
│   │   ├── ChatInput.tsx
│   │   └── ChatInput.test.tsx          # Component tests
│   ├── services/
│   │   ├── auth.ts
│   │   └── auth.test.ts                # Service tests
│   └── test/
│       └── setup.ts                    # Global test setup
├── e2e/
│   ├── helpers/
│   │   └── electron.ts                 # E2E test helpers
│   ├── auth-flow.e2e.ts                # E2E tests
│   └── example.e2e.ts
├── vitest.config.ts                    # Vitest configuration
├── playwright.config.ts                # Playwright configuration
└── coverage/                           # Coverage reports
```

## Mocking

### Electron APIs

Electron APIs are automatically mocked in `src/test/setup.ts`:

```typescript
// Already available in tests
window.llmAPI.chat()
window.modelAPI.checkDownloaded()
window.embeddingAPI.embedQuery()
```

### External APIs

Use MSW for HTTP request mocking:

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.post('/api/auth/login', () => {
    return HttpResponse.json({ access: 'token', user: { id: 1 } });
  })
);
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests with coverage
        run: npm run test:coverage

      - name: Build app
        run: npm run build

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Best Practices

1. **Test Behavior, Not Implementation**
   - Focus on what the component does, not how it does it
   - Test from the user's perspective

2. **Keep Tests Simple**
   - One assertion per test when possible
   - Clear test names that describe the behavior

3. **Use Meaningful Test Data**
   - Avoid magic numbers and strings
   - Use realistic data

4. **Mock External Dependencies**
   - Mock API calls with MSW
   - Mock Electron APIs in test setup
   - Avoid testing third-party libraries

5. **Run Tests Before Committing**
   - Use `npm run test:coverage` locally
   - Ensure all tests pass
   - Meet coverage thresholds

6. **Write Tests First (TDD)**
   - Consider writing tests before implementation
   - Helps clarify requirements

## Troubleshooting

### Tests Failing in CI but Passing Locally
- Ensure all dependencies are installed
- Check for timezone/locale differences
- Verify environment variables

### Coverage Below Threshold
- Run `npm run test:coverage` to see which files need tests
- Focus on critical paths first
- Consider edge cases

### E2E Tests Timing Out
- Increase timeout in `playwright.config.ts`
- Use `waitFor` for asynchronous operations
- Check if the app is building correctly

## Resources

- [Vitest Documentation](https://vitest.dev)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev)
- [MSW Documentation](https://mswjs.io)
