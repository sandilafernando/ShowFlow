/**
 * Packaged-build smoke test.
 *
 * Launches the packaged Windows executable (release/win-unpacked/ShowFlow.exe)
 * against a temporary userData directory. This proves the production asar,
 * external sql.js WASM resource, renderer assets and sandboxed preload all work
 * outside the development tree.
 *
 * Run after `npm run dist`: npm run test:e2e:packaged
 * Override the executable with SHOWFLOW_PACKAGED_EXE.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const EXE = process.env.SHOWFLOW_PACKAGED_EXE
  ? path.resolve(process.env.SHOWFLOW_PACKAGED_EXE)
  : path.join(ROOT, 'release', 'win-unpacked', 'ShowFlow.exe');

let app = null;
const consoleErrors = [];

function log(message) {
  console.log(`[packaged-e2e] ${message}`);
}

async function main() {
  await fs.access(EXE);
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'showflow-packaged-'));
  log(`Executable: ${EXE}`);
  log(`Temporary userData: ${userDataPath}`);

  try {
    app = await electron.launch({
      executablePath: EXE,
      env: {
        ...process.env,
        SHOWFLOW_E2E: '1',
        SHOWFLOW_USER_DATA: userDataPath,
      },
      timeout: 120_000,
    });
    const page = await app.firstWindow({ timeout: 120_000 });
    page.setDefaultTimeout(30_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
    });

    log('Verify packaged application metadata');
    const info = await app.evaluate(async ({ app: electronApp }) => ({
      isPackaged: electronApp.isPackaged,
      name: electronApp.getName(),
      version: electronApp.getVersion(),
      appPath: electronApp.getAppPath(),
      resourcesPath: process.resourcesPath,
      userDataPath: electronApp.getPath('userData'),
    }));
    assert.equal(info.isPackaged, true, 'app.isPackaged must be true');
    assert.equal(info.name, 'ShowFlow');
    assert.equal(info.version, '1.0.0');
    assert.equal(path.resolve(info.userDataPath), path.resolve(userDataPath));
    assert.match(info.appPath, /resources[\\/]app\.asar$/, 'application should run from app.asar');
    await fs.access(path.join(info.resourcesPath, 'sql-wasm.wasm'));
    await fs.access(path.join(info.resourcesPath, 'icon.png'));

    log('Verify sandboxed preload and runtime security preferences');
    const security = await app.evaluate(async ({ BrowserWindow }) => {
      const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        contextIsolation: prefs.contextIsolation,
        sandbox: prefs.sandbox,
        nodeIntegration: prefs.nodeIntegration,
        webviewTag: prefs.webviewTag,
        webSecurity: prefs.webSecurity,
        url: BrowserWindow.getAllWindows()[0].webContents.getURL(),
      };
    });
    assert.equal(security.contextIsolation, true);
    assert.equal(security.sandbox, true);
    assert.equal(security.nodeIntegration, false);
    assert.equal(security.webviewTag, false);
    assert.equal(security.webSecurity, true);
    assert.match(security.url, /^file:\/\/.*app\.asar[\\/]dist[\\/]index\.html/);

    const bridge = await page.evaluate(() => ({
      hasShowflow: Boolean(window.showflow?.events?.list),
      frozen: Object.isFrozen(window.showflow),
      hasProcess: typeof process !== 'undefined',
      hasRequire: typeof require !== 'undefined',
    }));
    assert.equal(bridge.hasShowflow, true);
    assert.equal(bridge.frozen, true);
    assert.equal(bridge.hasProcess, false);
    assert.equal(bridge.hasRequire, false);

    log('Verify first-run onboarding and database creation');
    await page.getByRole('button', { name: /Begin setup/i }).waitFor({ timeout: 60_000 });
    await page.getByRole('button', { name: /Begin setup/i }).click();
    await page
      .locator('.input-label', { hasText: 'Operator name' })
      .locator('input')
      .fill('Packaged Smoke Operator');
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByText('I understand these operating limits').click();
    await page.getByRole('button', { name: /Enter ShowFlow/i }).click();
    await page.getByRole('complementary', { name: 'Primary navigation' }).waitFor();

    const settings = await page.evaluate(async () => {
      const response = await window.showflow.settings.get();
      return response.ok ? response.data : null;
    });
    assert.equal(settings?.operatorName, 'Packaged Smoke Operator');
    assert.equal(settings?.onboardingComplete, true);

    await fs.access(path.join(userDataPath, 'showflow.db'));
    assert.deepEqual(consoleErrors, [], 'packaged renderer should not log runtime errors');

    log('Verify packaged window is titled ShowFlow');
    assert.equal(await page.title(), 'ShowFlow');

    console.log('\n[packaged-e2e] PASS — asar, external WASM, preload, DB and renderer work in the packaged app.');
  } catch (error) {
    console.error('\n[packaged-e2e] FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      try {
        await app.close();
      } catch (error) {
        console.error('[packaged-e2e] Could not close packaged app cleanly:', error.message);
      }
    }
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

await main();
