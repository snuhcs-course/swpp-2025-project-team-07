import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

/**
 * Helper function to launch the Electron application for testing
 */
export async function launchElectronApp(): Promise<{
  app: ElectronApplication;
  page: Page;
}> {
  // Launch Electron app
  const app = await electron.launch({
    args: [path.join(__dirname, '../../.vite/build/main.js')],
    // Enable debug logs (optional)
    // env: { ...process.env, DEBUG: 'pw:api' },
  });

  // Wait for the first window to open
  const page = await app.firstWindow();

  // Wait for app to be ready
  await page.waitForLoadState('domcontentloaded');

  return { app, page };
}

/**
 * Helper function to close the Electron application
 */
export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close();
}
