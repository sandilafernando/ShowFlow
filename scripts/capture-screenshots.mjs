/**
 * Captures documentation screenshots from the real built application.
 *
 * This is a maintainer utility, not part of the test suite. It launches Electron
 * against a temporary user-data directory, completes onboarding, seeds clearly
 * fictional demo data, and captures the dashboard, Control Room and ScreenPilot.
 *
 * Run with: npm run screenshots
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import sharp from 'sharp';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT = path.join(ROOT, 'docs', 'images');

let app = null;
let failed = true;

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'showflow-shots-'));
  const holdingSlide = path.join(userDataPath, 'demo-holding-slide.png');

  try {
    await sharp(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
        <rect width="1920" height="1080" fill="#07090b"/>
        <rect x="0" y="0" width="1920" height="6" fill="#2dd4e6"/>
        <g stroke="#1a222b" stroke-width="1">
          <path d="M120 120H1800M120 960H1800M120 120V960M1800 120V960"/>
        </g>
        <text x="150" y="430" fill="#8b97a6" font-family="Segoe UI, sans-serif" font-size="26" letter-spacing="8">EDUCATIONAL MEDIA UNIT</text>
        <text x="146" y="560" fill="#eef2f6" font-family="Segoe UI, sans-serif" font-size="92" font-weight="600" letter-spacing="-2">Annual Prize Giving</text>
        <text x="150" y="630" fill="#2dd4e6" font-family="Segoe UI, sans-serif" font-size="28" letter-spacing="3">MARIS STELLA COLLEGE · 2026</text>
        <rect x="150" y="760" width="90" height="3" fill="#2dd4e6"/>
        <text x="150" y="820" fill="#697483" font-family="Segoe UI, sans-serif" font-size="24">Please take your seats. The ceremony begins shortly.</text>
      </svg>`),
    )
      .png()
      .toFile(holdingSlide);

    app = await electron.launch({
      args: ['.'],
      cwd: ROOT,
      env: {
        ...process.env,
        SHOWFLOW_E2E: '1',
        SHOWFLOW_USER_DATA: userDataPath,
      },
      timeout: 90_000,
    });
    const page = await app.firstWindow({ timeout: 90_000 });
    page.setDefaultTimeout(30_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: /Begin setup/i }).waitFor();

    const ids = await page.evaluate(async () => {
      const call = async (method, ...args) => {
        const response = await method(...args);
        if (!response?.ok) throw new Error(response?.error?.message || 'ShowFlow API call failed');
        return response.data;
      };

      await call(window.showflow.setup.complete, {
        operatorName: 'Demo Show Caller',
        defaultVenue: 'Main Auditorium',
      });

      const event = await call(window.showflow.events.create, {
        title: 'Annual Prize Giving',
        description:
          'A demonstration running order for the Educational Media Unit. All names and cues are fictional.',
        venue: 'Main Auditorium',
        eventDate: '2026-12-12',
        startTime: '17:30',
        notes: 'House opens at 17:00. Call the stage manager on channel 2 before the first cue.',
        technicalNotes:
          'Main projector is fed by the ScreenPilot receiver. Confirm focus and audio before doors.',
      });

      const cues = [
        {
          title: 'Doors open holding slide',
          type: 'image',
          durationSeconds: 900,
          notes: 'Hold the school mark and welcome slide until the hall is seated.',
          fallback: 'Use the printed welcome board at stage left.',
        },
        {
          title: 'Welcome film',
          type: 'video',
          durationSeconds: 150,
          notes: 'Roll the 2026 welcome film. Audio from the playback operator.',
          fallback: 'Cut to the principal; skip the film and continue with the welcome address.',
        },
        {
          title: 'Principal enters',
          type: 'stage',
          durationSeconds: 90,
          notes: 'Stage manager cues the entrance from stage right.',
          fallback: 'Hold the opening slide and repeat the welcome announcement.',
        },
        {
          title: 'Award presentations',
          type: 'presentation',
          durationSeconds: 1200,
          notes: 'Advance slides only on the presenter’s cue.',
          fallback: 'Use the printed award list and the fixed camera wide shot.',
        },
        {
          title: 'Closing thanks',
          type: 'lighting',
          durationSeconds: 120,
          notes: 'Bring up the full stage wash for the closing photograph.',
          fallback: 'Use the house lights at 70 percent.',
        },
      ];

      const created = [];
      for (const cue of cues) {
        created.push(await call(window.showflow.cues.create, { eventId: event.id, cue }));
      }

      await call(window.showflow.displays.save, {
        name: 'Main stage projector',
        purpose: 'live',
        width: 1920,
        height: 1080,
        layout: 'full',
        notes: 'Centre projector above the stage.',
        enabled: true,
      });
      await call(window.showflow.displays.save, {
        name: 'Confidence monitor',
        purpose: 'preview',
        width: 1920,
        height: 1080,
        layout: 'lower_third',
        notes: 'Show caller position, stage left.',
        enabled: true,
      });

      return { eventId: event.id, firstCueId: created[0].id };
    });

    // The only way to add a real media record is through the native file picker.
    // Replace it in the throwaway main process so the documentation screenshot
    // can show a linked image instead of an empty preview surface.
    await app.evaluate(async ({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, holdingSlide);

    await page.evaluate(async ({ eventId, firstCueId }) => {
      const call = async (method, ...args) => {
        const response = await method(...args);
        if (!response?.ok) throw new Error(response?.error?.message || 'ShowFlow API call failed');
        return response.data;
      };

      const imported = await call(window.showflow.media.addFiles, {});
      if (imported.canceled) throw new Error('The demo media file could not be indexed.');
      const library = await call(window.showflow.media.list, {});
      const asset = library.items.find((item) => item.name === 'demo-holding-slide.png');
      if (!asset) throw new Error('The demo media record was not created.');
      const event = await call(window.showflow.events.get, eventId);
      const cue = event.cues.find((item) => item.id === firstCueId);

      await call(window.showflow.cues.update, {
        id: firstCueId,
        cue: {
          title: cue.title,
          type: cue.type,
          notes: cue.notes,
          fallback: cue.fallback,
          operatorId: cue.operatorId || undefined,
          durationSeconds: cue.durationSeconds,
          assetId: asset.id,
          resolumeAction: 'none',
        },
      });

      await call(window.showflow.events.runtime, {
        eventId,
        status: 'rehearsal',
        armedCueId: firstCueId,
        liveCueId: firstCueId,
      });
    }, ids);

    await page.reload();
    await page.getByRole('complementary', { name: 'Primary navigation' }).waitFor();
    await page.getByText('Annual Prize Giving').first().waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTPUT, 'dashboard.png') });

    await page.evaluate((eventId) => {
      window.location.hash = `#/control/${eventId}`;
    }, ids.eventId);
    await page.getByText('Opening the control room').waitFor({ state: 'detached' }).catch(() => {});
    await page.getByText('Annual Prize Giving').first().waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTPUT, 'control-room.png') });

    await page.evaluate(async () => {
      const response = await window.showflow.displays.startServer();
      if (!response?.ok) throw new Error(JSON.stringify(response?.error || 'Receiver server could not start'));
    });
    await page.evaluate(() => {
      window.location.hash = '#/screens';
    });
    await page.getByText('Receiver service online').waitFor();
    await page.getByText('Main stage projector', { exact: true }).waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTPUT, 'screenpilot.png') });

    await page.getByText('Receivers', { exact: true }).evaluate((element) => {
      element.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUTPUT, 'screenpilot-receivers.png') });

    await page.evaluate(async () => {
      await window.showflow.displays.stopServer();
    });

    console.log(`Captured documentation screenshots in ${path.relative(ROOT, OUTPUT)}.`);
    failed = false;
  } finally {
    if (app) {
      try {
        await app.close();
      } catch {
        /* temporary profile */
      }
    }
    if (failed) {
      try {
        console.error(await fs.readFile(path.join(userDataPath, 'logs', 'showflow.log'), 'utf8'));
      } catch {
        /* no log */
      }
    }
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

await main();
