/**
 * ShowFlow Electron smoke test.
 *
 * This drives the real packaged application code (Electron main + sandboxed
 * preload + built renderer) against a temporary userData directory. It is not
 * a unit test: it verifies first-run setup, event/cue creation, rehearsal GO,
 * receiver-server start/health/stop, history, persistence, restart recovery and
 * the actual runtime security preferences of the BrowserWindow.
 *
 * Run with: npm run test:e2e
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ARTIFACTS = path.join(HERE, 'artifacts');

const OPERATOR = 'E2E Operator';
const VENUE = 'Test Auditorium';
const EVENT_TITLE = 'E2E Prize Giving';
const CUE_TITLE = 'Opening slate';

let app = null;
let page = null;
let stepNumber = 0;
const consoleErrors = [];

function step(message) {
  stepNumber += 1;
  console.log(`\n[e2e ${String(stepNumber).padStart(2, '0')}] ${message}`);
}

function attachDiagnostics(application) {
  application.on('window', (window) => {
    window.on('pageerror', (error) => {
      consoleErrors.push(String(error?.message || error));
      console.error('[e2e] Renderer page error:', error);
    });
    window.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        consoleErrors.push(text);
        console.error('[e2e] Renderer console error:', text);
      }
    });
  });
}

async function launchApp(userDataPath) {
  const application = await electron.launch({
    args: ['.'],
    cwd: ROOT,
    env: {
      ...process.env,
      SHOWFLOW_E2E: '1',
      SHOWFLOW_USER_DATA: userDataPath,
    },
    timeout: 90_000,
  });
  attachDiagnostics(application);
  const window = await application.firstWindow({ timeout: 90_000 });
  window.setDefaultTimeout(20_000);
  await window.emulateMedia({ reducedMotion: 'reduce' });
  return { application, window };
}

async function screenshot(name) {
  if (!page) return;
  try {
    await fs.mkdir(ARTIFACTS, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });
  } catch (error) {
    console.error('[e2e] Could not capture screenshot:', error.message);
  }
}

async function readStoredEvents(window) {
  return window.evaluate(async () => {
    const response = await window.showflow.events.list({ limit: 50 });
    if (!response?.ok) throw new Error(response?.error?.message || 'events.list failed');
    return response.data;
  });
}

function navLink(window, label) {
  return window
    .getByRole('complementary', { name: 'Primary navigation' })
    .getByRole('link', { name: label, exact: true });
}

async function getFreePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function assertScreen(window, navLabel, heading) {
  await navLink(window, navLabel).click();
  const headingLocator = window.getByRole('heading', { name: heading, exact: true });
  await headingLocator.waitFor();
  assert.equal((await headingLocator.textContent())?.trim(), heading, `${navLabel} should render its heading`);
}

async function main() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'showflow-e2e-'));
  console.log(`[e2e] Temporary userData: ${userDataPath}`);

  try {
    step('Launch Electron and wait for first-run setup');
    ({ application: app, window: page } = await launchApp(userDataPath));

    await page.getByRole('button', { name: /Begin setup/i }).waitFor({ timeout: 60_000 });
    assert.match(await page.locator('.onboarding-brand').innerText(), /ShowFlow/);

    step('Complete onboarding with an operator and venue');
    await page.getByRole('button', { name: /Begin setup/i }).click();
    const operatorField = page.locator('.input-label', { hasText: 'Operator name' }).locator('input');
    const venueField = page.locator('.input-label', { hasText: 'Default venue' }).locator('input');
    await operatorField.fill(OPERATOR);
    await venueField.fill(VENUE);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByText('I understand these operating limits').click();
    const enterButton = page.getByRole('button', { name: /Enter ShowFlow/i });
    await enterButton.waitFor();
    assert.equal(await enterButton.isEnabled(), true, 'setup acknowledgement should enable the finish button');
    await enterButton.click();

    step('Confirm the workspace shell and onboarding persistence');
    await navLink(page, 'Events').waitFor();
    const settings = await page.evaluate(async () => {
      const response = await window.showflow.settings.get();
      return response.ok ? response.data : null;
    });
    assert.ok(settings, 'settings.get should return data');
    assert.equal(settings.operatorName, OPERATOR);
    assert.equal(settings.defaultVenue, VENUE);
    assert.equal(settings.onboardingComplete, true);

    const bridge = await page.evaluate(() => ({
      keys: Object.keys(window.showflow || {}),
      frozen: Object.isFrozen(window.showflow),
      hasProcess: typeof process !== 'undefined',
      hasRequire: typeof require !== 'undefined',
      hasElectron: typeof window.electron !== 'undefined',
    }));
    assert.equal(bridge.frozen, true, 'preload API should be frozen');
    assert.equal(bridge.hasProcess, false, 'Node process must not be exposed to the renderer');
    assert.equal(bridge.hasRequire, false, 'Node require must not be exposed to the renderer');
    assert.equal(bridge.hasElectron, false, 'Direct Electron APIs must not be exposed to the renderer');
    for (const namespace of ['events', 'cues', 'media', 'displays', 'integrations', 'backup']) {
      assert.ok(bridge.keys.includes(namespace), `preload API should expose ${namespace}`);
    }

    step('Verify runtime BrowserWindow isolation and navigation rules');
    const security = await app.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const prefs = windows[0].webContents.getLastWebPreferences();
      return {
        windowCount: windows.length,
        contextIsolation: prefs.contextIsolation,
        sandbox: prefs.sandbox,
        nodeIntegration: prefs.nodeIntegration,
        webviewTag: prefs.webviewTag,
        webSecurity: prefs.webSecurity,
        allowRunningInsecureContent: prefs.allowRunningInsecureContent,
        url: windows[0].webContents.getURL(),
      };
    });
    assert.equal(security.windowCount, 1);
    assert.equal(security.contextIsolation, true);
    assert.equal(security.sandbox, true);
    assert.equal(security.nodeIntegration, false);
    assert.equal(security.webviewTag, false);
    assert.equal(security.webSecurity, true);
    assert.equal(security.allowRunningInsecureContent, false);
    assert.match(security.url, /dist\/index\.html/i, 'renderer should load from the built local entry');

    step('Create an event through the Events screen');
    await navLink(page, 'Events').click();
    await page.getByRole('heading', { name: 'Events', exact: true }).waitFor();
    await page.getByRole('button', { name: /New event/i }).click();
    const eventDialog = page.getByRole('dialog', { name: 'New event' });
    await eventDialog.waitFor();
    await eventDialog.locator('.input-label', { hasText: 'Event title' }).locator('input').fill(EVENT_TITLE);
    await eventDialog.locator('.input-label', { hasText: 'Date' }).locator('input').fill('2026-11-14');
    const venueInput = eventDialog.locator('.input-label', { hasText: 'Venue' }).locator('input');
    assert.equal(await venueInput.inputValue(), VENUE, 'event form should prefill the default venue');
    await eventDialog.getByRole('button', { name: /^Create event$/i }).click();
    await page.getByRole('heading', { name: EVENT_TITLE, exact: true }).waitFor();

    step('Add a cue with a duration and a manual fallback');
    await page.getByRole('tab', { name: /Running order/i }).click();
    await page.getByRole('button', { name: 'Add cue', exact: true }).click();
    const cueDialog = page.getByRole('dialog', { name: 'Add cue' });
    await cueDialog.waitFor();
    await cueDialog.getByPlaceholder('e.g. Opening film — house lights down').fill(CUE_TITLE);
    await cueDialog.locator('.input-label', { hasText: 'Duration' }).locator('input').fill('5');
    await cueDialog.getByPlaceholder('e.g. Hold slide, announce from stage.').fill('Hold the title slide and announce from stage.');
    await cueDialog.getByRole('button', { name: 'Add cue', exact: true }).click();
    await page.getByText(CUE_TITLE, { exact: true }).first().waitFor();

    step('Open the Control Room and start an isolated rehearsal');
    await page.getByRole('button', { name: /^Control Room$/i }).click();
    await page.getByText('Ready the room, then choose a mode').waitFor();
    await page.getByRole('button', { name: /Start rehearsal/i }).click();
    await page.getByText('Rehearsal in progress').waitFor();
    assert.match(await page.locator('.session-mode-bar').innerText(), /no integration transmission/i);

    step('Press GO and verify the simulated execution state');
    const goButton = page.getByRole('button', { name: /^GO\b/ });
    await goButton.waitFor();
    await goButton.click();
    await page.getByText('Rehearsal cue live').waitFor();
    await page.getByText('Execution state').waitFor();
    const cueHero = page.locator('.cue-hero');
    const cueHeroText = await cueHero.innerText();
    assert.match(cueHeroText, new RegExp(CUE_TITLE));
    assert.match(cueHeroText, /Simulated · No command/i);
    assert.match(cueHeroText, /Manual cue — no integration mapping/i);
    assert.doesNotMatch(cueHeroText, /acknowledged/i, 'a local GO must never be described as acknowledged');

    step('Verify the GO was recorded in History');
    await navLink(page, 'History').click();
    await page.getByRole('heading', { name: 'History', exact: true }).waitFor();
    await page.getByText(/GO cue 1: Opening slate/i).first().waitFor({ timeout: 15_000 });

    step('Visit every core screen and confirm it renders');
    await assertScreen(page, 'ScreenPilot', 'ScreenPilot');
    await assertScreen(page, 'MediaVault', 'MediaVault');
    await assertScreen(page, 'CrewSync', 'CrewSync');
    await assertScreen(page, 'Events', 'Events');
    await assertScreen(page, 'Control Room', 'Control Room');
    await assertScreen(page, 'History', 'History');
    await assertScreen(page, 'Settings', 'Settings');
    await assertScreen(page, 'Help', 'Help');
    await assertScreen(page, 'About', 'ShowFlow');

    step('Start the receiver server deliberately and verify its health endpoint');
    const receiverPort = await getFreePort();
    const receiverStatus = await page.evaluate(async (port) => {
      const settingsResponse = await window.showflow.settings.update({ receiverPort: port });
      if (!settingsResponse?.ok) throw new Error(settingsResponse?.error?.message || 'settings.update failed');
      const before = await window.showflow.displays.serverStatus();
      const started = await window.showflow.displays.startServer();
      return {
        runningBefore: before?.data?.running,
        started: started?.ok ? started.data : null,
        error: started?.ok ? null : started?.error,
      };
    }, receiverPort);
    assert.equal(receiverStatus.runningBefore, false, 'the receiver server must not autostart');
    assert.ok(receiverStatus.started, `receiver server should start: ${JSON.stringify(receiverStatus.error)}`);
    assert.equal(receiverStatus.started.running, true);
    assert.equal(receiverStatus.started.port, receiverPort);
    const healthResponse = await fetch(`http://127.0.0.1:${receiverPort}/health`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(health.running, true);
    const stopped = await page.evaluate(async () => {
      const response = await window.showflow.displays.stopServer();
      return response?.ok ? response.data : null;
    });
    assert.equal(stopped?.running, false, 'the receiver server should stop on request');
    assert.equal(stopped?.port, null, 'a stopped receiver server should not advertise a port');

    step('Verify the active event is still persisted in the database');
    const beforeRestart = await readStoredEvents(page);
    const eventSummary = beforeRestart.find((item) => item.title === EVENT_TITLE);
    assert.ok(eventSummary, 'created event should be present');
    const event = await page.evaluate(async (eventId) => {
      const response = await window.showflow.events.get(eventId);
      if (!response?.ok) throw new Error(response?.error?.message || 'events.get failed');
      return response.data;
    }, eventSummary.id);
    assert.equal(event.cues.length, 1);
    assert.equal(event.cues[0].title, CUE_TITLE);
    assert.equal(event.status, 'rehearsal');
    assert.equal(event.liveCueId, event.cues[0].id, 'GO should persist the live cue in rehearsal');

    step('Close ShowFlow during an active rehearsal');
    await screenshot('before-restart');
    await app.close();
    app = null;
    page = null;

    await fs.access(path.join(userDataPath, 'showflow.db'));

    step('Relaunch against the same userData and verify restart recovery');
    ({ application: app, window: page } = await launchApp(userDataPath));
    await navLink(page, 'Events').waitFor({ timeout: 60_000 });

    const afterRestart = await readStoredEvents(page);
    const recovered = afterRestart.find((item) => item.id === event.id);
    assert.ok(recovered, 'event should survive a restart');
    assert.equal(recovered.status, 'interrupted', 'an active rehearsal must be marked interrupted after restart');
    assert.equal(recovered.liveCueId, null, 'no cue may remain live after restart');

    const history = await page.evaluate(async (eventId) => {
      const response = await window.showflow.activity.list({ eventId, limit: 100 });
      if (!response?.ok) throw new Error(response?.error?.message || 'activity.list failed');
      return response.data.items;
    }, event.id);
    assert.ok(
      history.some((entry) => /marked interrupted/i.test(entry.message)),
      'restart recovery should be recorded in history',
    );
    assert.ok(
      history.some((entry) => /No production commands (?:were replayed|have been replayed)/i.test(entry.detail || '') || /no production commands were replayed/i.test(entry.message)),
      'restart recovery should state that no commands were replayed',
    );

    await page.evaluate((eventId) => {
      window.location.hash = `#/control/${eventId}`;
    }, event.id);
    await page.getByText('Ready to reopen this event').waitFor();
    const bodyText = await page.locator('.control-page').innerText();
    assert.match(bodyText, /interrupted/i);
    assert.match(bodyText, /No cue is live|Standby/i);

    step('Verify the renderer reported no runtime errors');
    assert.deepEqual(consoleErrors, [], 'the renderer should not log runtime errors');

    console.log('\n[e2e] PASS — onboarding, event/cue creation, rehearsal GO, history,');
    console.log('      receiver health, screen navigation, preload isolation, persistence and restart recovery.');
  } catch (error) {
    console.error('\n[e2e] FAIL');
    console.error(error);
    await screenshot('failure');
    process.exitCode = 1;
  } finally {
    if (app) {
      try {
        await app.close();
      } catch (error) {
        console.error('[e2e] Could not close Electron cleanly:', error.message);
      }
    }
    try {
      await fs.rm(userDataPath, { recursive: true, force: true });
    } catch (error) {
      console.error('[e2e] Could not remove temporary userData:', error.message);
    }
  }
}

await main();
