# Verification record

- **Project:** ShowFlow 1.0.0
- **Verified:** 2026-10-29
- **Host:** Windows 11 x64 (build 10.0.26300)
- **Toolchain:** Node.js 24.22.1, npm 11.19.1, Electron 45.1.0, electron-builder 26.18.0
- **Workspace:** local Git repository, no remote configured, unsigned builds

This document records what was executed locally against the source tree and the
Windows x64 build artifacts. It is not evidence that GitHub Actions ran, that a
release was published, or that real production hardware was tested.

## Result summary

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Passed, 0 errors and 0 warnings |
| Unit and integration tests | `npm test` | Passed, 9 files / 83 tests |
| Renderer production build | `npm run build:renderer` | Passed |
| Source Electron E2E | `npm run test:e2e` | Passed, 15 steps |
| Windows packaging | `npm run dist` | Passed, NSIS installer and portable executable |
| Packaged-app E2E | `npm run test:e2e:packaged` | Passed |
| Checksums | `npm run checksums -- --verify` | Passed for both executables |
| Application icon extraction | Windows icon extraction + `sharp` comparison | Passed, both executables match the source icon |
| Silent install / launch / uninstall | NSIS installer with temporary paths | Passed, data retained |
| Dependency audit | `npm audit` | 0 vulnerabilities |

## Environment

```text
Windows 11 x64, version 10.0.26300
Node.js v24.22.1
npm 11.19.1
Electron 45.1.0
electron-builder 26.18.0
```

The build was produced on the maintainer's local machine. No CI runner, remote
repository, code-signing certificate, or release environment was available.

## Unit and integration tests

`npm test` runs Vitest 5.0.5 in Node against temporary sql.js databases and
temporary directories. It does not open the real ShowFlow database.

| Test file | Tests | Area |
| --- | ---: | --- |
| `tests/unit/database-repository.test.js` | 16 | Schema, migrations, events, cues, media, crew, displays |
| `tests/unit/cue-engine.test.js` | 15 | Cue ordering, execution transitions, next/previous, recovery rules |
| `tests/unit/validation.test.js` | 12 | IPC input and domain validation, including media and network fields |
| `tests/unit/preload-contract.test.js` | 9 | Preload/IPC allowlist, navigation, permissions, CSP, media protocol |
| `tests/unit/integration.test.js` | 7 | Live gate, rehearsal isolation, mock and OSC dispatch state |
| `tests/unit/backup.test.js` | 6 | Backup creation, retention, validation, restore safety |
| `tests/unit/osc.test.js` | 6 | OSC address/argument encoding and UDP socket behavior |
| `tests/unit/receiver.test.js` | 6 | Receiver HTTP, pairing, rate limiting, WebSocket, acknowledgements |
| `tests/unit/resolume.test.js` | 6 | Verified Resolume operations, target validation, unverified reporting |
| **Total** | **83** | |

Notable assertions in this suite:

- Only the two documented Resolume OSC operations are emitted, and their send
  state is reported as unverified.
- Rehearsal never transmits integration commands; live sends require a live
  event, an enabled integration, and a mapped cue.
- Receiver pairing codes are required, failed attempts are rate-limited, and the
  server reports a stopped state without advertising a port.
- The sandboxed preload exposes no channel outside the audited allowlist.
- Navigation, popups, webviews, permissions, and unsafe CSP directives are
  blocked or absent.
- Media is served only through the indexed `showflow-media://` protocol.
- Restore creates a safety backup before replacing the database.

## Source Electron E2E

`npm run test:e2e` builds the renderer and launches the real Electron main
process, sandboxed preload, and built renderer through `playwright-core`. It uses
a new temporary `SHOWFLOW_USER_DATA` directory with `SHOWFLOW_E2E=1`.

The 15 steps verified:

1. Launch and first-run setup screen.
2. Complete onboarding with an operator and venue.
3. Confirm shell rendering and persisted onboarding settings.
4. Verify the frozen preload bridge and runtime `BrowserWindow` security
   preferences: context isolation on, sandbox on, Node integration off, webview
   tag off, web security on, insecure content off.
5. Create an event through the Events screen.
6. Add a cue with a duration and a manual fallback.
7. Start an isolated rehearsal and confirm the no-transmission notice.
8. Press GO and confirm the cue is shown as `Simulated · No command`; the test
   asserts that the word `acknowledged` is absent.
9. Confirm the GO appears in History.
10. Visit every core screen: ScreenPilot, MediaVault, CrewSync, Events, Control
    Room, History, Settings, Help, and About.
11. Confirm the receiver server does not autostart, start it manually on a free
    port, request `/health` and receive HTTP 200 with `running: true`, then stop
    it and confirm `running: false` and `port: null`.
12. Confirm the active event and live cue persisted in the database.
13. Close ShowFlow during the active rehearsal.
14. Relaunch against the same user data. The event must be `interrupted`, no cue
    may remain live, History must record the interruption and state that no
    production commands were replayed, and the Control Room must not offer
    automatic resumption.
15. Assert that the renderer logged no runtime errors during the run.

The run passed and deleted its temporary user data on completion.

## Packaged application E2E

`npm run test:e2e:packaged` launches
`release/win-unpacked/ShowFlow.exe` against a fresh temporary user-data
directory. The run verified:

- `app.isPackaged` is `true`, the product name is `ShowFlow`, and the version is
  `1.0.0`.
- The application executes from `resources\app.asar`.
- `sql-wasm.wasm` and `icon.png` are present in `resources`, outside the asar.
- The renderer loads from the packaged `dist/index.html`.
- Context isolation, sandboxing, and the frozen preload bridge remain active in
  the packaged build; Node globals are absent.
- First-run onboarding completes, settings persist, and `showflow.db` is created
  in the temporary user-data directory.
- The window title is `ShowFlow`, and the renderer logs no console errors.

## Build artifacts

Produced by `npm run dist` with electron-builder 26.18.0:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `ShowFlow-1.0.0-Windows-Setup.exe` | 136,819,573 | `d660a971eb46677380223438f8e151cea468e358890e555bc259a4ef95eb859b` |
| `ShowFlow-1.0.0-Windows-Portable.exe` | 119,030,385 | `05637904893a4726143661b502f95be0ff541fcb1a3de782878e06064f6377b9` |

`release/SHA256SUMS.txt` contains both hashes and was verified with
`npm run checksums -- --verify`. The unpacked application executable is
249,798,656 bytes. The `release/` directory is excluded from Git.

Vite 6.4.5 reported its standard advisory that the main renderer chunk exceeds
500 kB (695.15 kB, 199.50 kB gzipped). The production build completed
successfully; this is a future performance note, not a failed gate.

## Icon verification

The original mark is `build/icon-source.svg`. `npm run icons` generates the
512×512 `build/icon.png`, the multi-size `build/icon.ico`, and the NSIS header
and sidebar bitmaps.

The final icons were extracted from both the installed executable and the NSIS
installer with `System.Drawing.Icon.ExtractAssociatedIcon`, saved as 32×32 PNGs,
and compared with `build/icon.png` resized to 32×32 with `sharp`. Both extracted
icons matched the source with a mean absolute per-channel difference of 0.769 on
a 0–255 scale (reported as 0.77). The installer artwork was also opened and
inspected visually.

This confirms that the packaged executable and installer carry the ShowFlow
mark, not the default Electron icon.

## Installer and uninstall data retention

The NSIS installer was exercised with temporary paths so the maintainer's real
profile was not touched:

```text
Install directory:  C:\Users\Public\ShowFlowVerifyInstall
Temporary userData: C:\Users\Public\ShowFlowVerifyData
```

Procedure and result:

1. Ran the installer silently with `/S` and a custom `/D=` directory. The
   application installed successfully.
2. Launched the installed executable with `SHOWFLOW_USER_DATA` pointing at the
   temporary data directory and completed onboarding. `showflow.db` was created
   there.
3. Ran the uninstaller silently. The installation directory and the created
   desktop shortcut were removed.
4. Confirmed that `showflow.db` in the temporary user-data directory remained.
5. Removed the temporary verification directories by hand.

The real `%APPDATA%\ShowFlow` directory was not created during this test and was
not modified. This confirms the uninstaller's `deleteAppDataOnUninstall: false`
behavior without risking actual production data.

## Security evidence

Runtime checks in the source and packaged E2E runs confirmed:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  `webviewTag: false`, `webSecurity: true`, and insecure content disabled.
- The preload API is frozen; `process`, `require`, and direct Electron APIs are
  absent from the renderer.
- Only audited invoke channels and three status event channels are exposed.
- Navigation, popups, webviews, permission requests, and permission checks are
  denied.
- The CSP restricts scripts, connections, frames, objects, and forms.
- Media is served only from indexed assets through `showflow-media://`.

The receiver server was verified in unit and E2E tests for manual start, health,
pairing, rate limiting, WebSocket delivery, blackout/test messages, and clean
shutdown. It was not exposed to an untrusted network during testing.

## Not verified

The following remain unverified and must not be inferred from this record:

- **Real Resolume software or hardware.** OSC addresses and encoding are unit
  tested and documented; no Resolume instance was available. OSC is one-way, so
  ShowFlow cannot confirm clip changes or opacity.
- **Real projectors, audio, lighting, video switchers, or media players.** The
  application cannot observe those devices, and no physical show was run.
- **Multiple simultaneous receiver browsers under production load.** Receiver
  HTTP/WebSocket behavior was tested with automated clients, not a full display
  wall.
- **Code signing or SmartScreen reputation.** The binaries are unsigned.
- **GitHub Actions or release publication.** The workflows are committed but
  have not executed; no remote is configured and no release was published.
- **macOS or Linux packaging.** Only Windows x64 was built.
- **Installer upgrade and rollback paths.** A clean install and uninstall were
  tested, not an in-place upgrade or downgrade.
- **Formal accessibility audit, screen-reader testing, or long-duration soak
  testing.** These were not performed.

## Reproduce the local gates

From a clean checkout on Windows x64:

```powershell
npm ci
npm run lint
npm test
npm run test:e2e
npm run dist
npm run test:e2e:packaged
npm run checksums
npm run checksums -- --verify
npm audit
```

`npm run dist` regenerates the icons and renderer, then replaces the artifacts in
`release/`. Re-run the checksum commands after any rebuild. Documentation
screenshots can be regenerated with `npm run screenshots`; they use temporary
demo data and are not part of the test gate.

## Evidence

- Documentation screenshots: `docs/images/dashboard.png`,
  `docs/images/control-room.png`, `docs/images/screenpilot.png`, and
  `docs/images/screenpilot-receivers.png`. They were captured from the built app
  with fictional demo data and inspected after the final layout fixes.
- E2E diagnostic artifacts are written to `tests/e2e/artifacts/`, which is
  ignored by Git.
- Release binaries and `SHA256SUMS.txt` are in `release/`, also ignored by Git.
