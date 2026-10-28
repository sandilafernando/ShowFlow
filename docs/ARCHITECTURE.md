# ShowFlow architecture

## Objectives

ShowFlow is a single-user, offline-first desktop application for cue calling and
software-based screen delivery. The architecture is shaped by four constraints:

1. **No accidental execution.** Nothing production-related runs on launch,
   navigation, restart, or recovery.
2. **Honest state.** The app distinguishes what it requested, what another piece
   of software acknowledged, and what it cannot observe.
3. **Local ownership.** Show data lives in one local SQLite file; there is no
   account, cloud dependency, telemetry, or auto-update channel.
4. **Small attack surface.** The renderer is sandboxed and the main process is
   the only component with filesystem, database, and network authority.

## Technology

| Layer | Technology |
| --- | --- |
| Shell | Electron 45, ESM main process, sandboxed CommonJS preload |
| Renderer | React 19, React Router 7 (HashRouter), Vite 6, Tailwind 3, Framer Motion 12, Lucide |
| Database | SQLite compiled to WebAssembly via sql.js 1.15 |
| LAN delivery | Node `http` + `ws` WebSocket server |
| Integration | `node:dgram` UDP with a small OSC encoder |
| Packaging | electron-builder 26, NSIS and portable Windows x64 targets |
| Tests | Vitest 5, Playwright Electron driver (`playwright-core`) |

sql.js was selected over a native SQLite binding to avoid native ABI rebuilds
and to make the packaged Windows application self-contained. The database is
held in memory and exported atomically after each transaction.

## Process and trust boundaries

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Electron main process                                               │
│                                                                     │
│  shared/contracts ── IPC handlers ── validation ── repositories     │
│         │                  │              │                         │
│         │                  │              ├── showflow.db (sql.js)  │
│         │                  │              ├── MediaVault metadata   │
│         │                  │              └── activity / backups    │
│         │                  ├── ReceiverServer (manual start)       │
│         │                  ├── IntegrationService (live gate)      │
│         │                  └── Media protocol (indexed assets)     │
│         │                                                           │
│  BrowserWindow: contextIsolation, sandbox, no Node integration      │
│         │                                                           │
│  preload.cjs: frozen, explicit API only                             │
└─────────┬───────────────────────────────────────────────────────────┘
          │ validated invoke() / status events
┌─────────▼───────────────────────────────────────────────────────────┐
│ React renderer                                                      │
│  HashRouter screens, local state, optimistic UI, toast/error states │
└─────────────────────────────────────────────────────────────────────┘
          │ optional LAN HTTP/WS                    │ optional UDP OSC
┌─────────▼──────────────────┐          ┌──────────▼──────────────────┐
│ Receiver browser           │          │ Resolume                    │
│ (per-display pairing code) │          │ (one-way, live events only) │
└────────────────────────────┘          └─────────────────────────────┘
```

### Renderer

- Has no Node.js, `require`, filesystem, or raw `ipcRenderer` access.
- Calls a frozen `window.showflow` API defined in `electron/preload.cjs`.
- Receives status events through explicit subscription functions that return
  unsubscribe callbacks.
- Uses `HashRouter` so `file://` loading works in packaged builds.
- Never receives an arbitrary path for direct `file://` loading. Media previews
  use `showflow-media://asset/<id>`.

### Main process

Owns:

- Window creation, security preferences, navigation restrictions, and CSP
- Database lifecycle, migrations, repositories, and recovery
- Native dialogs for media, plans, run sheets, backups, and metadata
- The LAN receiver server and its pairing checks
- The integration adapters and live-send gate
- Activity logging and application shutdown

### Preload

`electron/preload.cjs` is deliberately CommonJS because a sandboxed preload
cannot load local ES modules. Channel names are duplicated there; a contract test
compares them with `shared/ipc.cjs`, which is the canonical allowlist.

## IPC contract

Every request returns an envelope:

```js
{ ok: true, data: ... }
// or
{ ok: false, error: { code, message, details? } }
```

- Inputs are plain objects; each handler validates IDs, strings, enums, numbers,
  and sizes before calling services.
- Handlers verify the sender is the main ShowFlow window.
- Errors are mapped to stable codes such as `VALIDATION_ERROR`, `NOT_FOUND`,
  `CONFLICT`, `INTEGRATION_DISABLED`, or `NOT_LIVE`.
- There is no generic "invoke any channel" API.
- Status pushes (`event:screen-status`, `event:server-status`,
  `event:integration-status`) are one-way main-to-renderer events.

### Main IPC groups

| Group | Examples |
| --- | --- |
| App | info, open external URL, open data folder |
| Setup/settings | onboarding completion, settings read/update |
| Events/cues | CRUD, duplicate, archive, runtime state, run-sheet and plan export/import |
| Media | index files/folder, check, relink, update, export/import metadata, open/reveal |
| Crew | operators, assignments, checklists |
| Displays | display CRUD, pairing code, server start/stop/status, links, push, test, blackout |
| Integrations | config, status, test, send |
| Backup | create, restore, integrity, stats |
| Activity | list, manual production note |

## Data model

The database uses `PRAGMA user_version` for schema migrations. All schema work is
executed through `executeScript()` because sql.js `run()` prepares only the first
statement of a multi-statement script.

| Table | Purpose |
| --- | --- |
| `settings` | Key/value application settings |
| `operators` | Local crew roster |
| `events` | Event metadata, status, armed/live cue, archive flag |
| `cues` | Ordered running order, type, duration, notes, fallback, media link, Resolume mapping |
| `media_assets` | Indexed path, kind, size, technical metadata, tags, availability |
| `assignments` | Event-specific crew roles |
| `checklists` | Event setup/shutdown items |
| `displays` | Receiver display name, purpose, layout, resolution, pairing code, last seen |
| `activity` | Append-only local audit trail |

Foreign keys are enabled. Cue deletion cascades from events; operator and media
references use `ON DELETE SET NULL` so history remains readable.

### Persistence

`ShowFlowDatabase`:

1. Loads `showflow.db` into a sql.js `Database`.
2. Runs `PRAGMA integrity_check`.
3. Falls back to `showflow.db.bak` if the primary cannot be opened.
4. Preserves an unreadable primary as `showflow.db.corrupt-<timestamp>`.
5. Writes through `showflow.db.tmp-<pid>` and renames in place.
6. Copies the previous launch file to `showflow.db.bak`.

A fresh database is created if no valid file exists. No production command is
executed as part of migration or recovery.

## Session state machines

### Event status

```text
draft ──start rehearsal──▶ rehearsal ──end──▶ draft
  │                            │
  │                            └──crash/exit──▶ interrupted
  │
  └──start live (≥1 cue)──▶ live ──end──▶ completed
                              │
                              └──crash/exit──▶ interrupted
```

- Only `rehearsal` and `live` are active sessions.
- Live requires at least one cue. Cue editing is blocked while live.
- Archived and completed events cannot transmit integration actions.
- On startup, both `live` and `rehearsal` events are changed to `interrupted`,
  `live_cue_id` is cleared, and an activity entry records that no commands were
  replayed. The armed cue remains available for the operator to inspect.
- Starting a session sends nothing. Ending a session sends nothing and cannot
  turn off external equipment.

### Cue execution

Per cue, the in-session runtime tracks:

| State | Meaning |
| --- | --- |
| `idle` | No command recorded for this cue |
| `requested` | GO was invoked; the request was recorded locally |
| `acknowledged` | A receiver browser acknowledged delivery |
| `completed` | A simulated action or deliberate manual completion completed |
| `failed` | A local operation or transport failed |
| `unknown` | A one-way command was sent but cannot be verified |

Important distinctions:

- Receiver `acknowledged`/`completed` means browser delivery, not projector
  output.
- Resolume sends resolve to `unknown`; the adapter explicitly returns
  `acknowledged: false`.
- Mock and rehearsal actions are marked `simulated: true` and are labelled as
  simulations in both the UI and activity log.
- Execution detail is intentionally session-local. It is not reconstructed on
  restart. The event status and activity entries preserve an honest historical
  record without replaying or fabricating commands.

### GO sequence

1. The operator arms a cue. Arming only changes local state.
2. GO validates an active session and a cue belonging to the event.
3. The runtime records `requested` and marks the cue live.
4. The renderer attempts to push cue content to enabled receivers. Failure to
   push does not roll back the local cue state; it is reported separately.
5. In rehearsal, a simulated execution is recorded and no OSC is sent.
6. In live mode, a mapped cue may call the integration service. The service
   re-checks: event exists, is not archived, is `live`, integration is enabled,
   and the mapping is valid.
7. The result is logged with path, args, simulated/acknowledged flags, and
   status. No retry occurs.
8. The operator completes or skips the cue manually. Completion does not send
   any command to external systems.

## ScreenPilot delivery

```text
ScreenPilot UI
  │ manual start(port)
  ▼
HTTP server on 0.0.0.0:<port>
  ├── GET /health
  ├── GET /r/<displayId>?code=<pairingCode>  → receiver HTML
  └── WS /ws?displayId=...&code=...
          ├── welcome
          ├── heartbeat / pong
          ├── content (messageId, payload)
          ├── test (bars/grid/white/label/blackout)
          ├── blackout
          └── clear
```

- The receiver server is **not** started automatically.
- Pairing compares the display ID and six-digit code against the local database,
  requires the display to be enabled, and rate-limits failures per remote IP.
- WebSocket origins are checked when present; message payloads are capped at
  32 KiB.
- One connection per display ID; a reconnect replaces the older connection.
- The browser sends `content-ack` with the message ID. The server records it as
  "browser received", never as projector output.
- Test patterns and blackout are delivery tools. They cannot change projector
  input, power, or focus.
- Preview vs live is a routing label. Both can receive content when deliberately
  targeted.
- Receiver pages include a rehearsal banner, stale-message detection, reconnect
  backoff, and reduced-motion support.

The server uses HTTP and WebSocket without TLS. It is intended for a trusted
production LAN only.

## Resolume integration

```text
Cue mapping (action, layer, clip, opacity)
  │
  ▼
IntegrationService
  ├── event archived?        → blocked
  ├── event status !== live? → blocked, logged
  ├── integration disabled?  → blocked
  ├── mapping invalid?       → blocked
  └── enabled + live
        ├── mock adapter     → simulated success (no socket)
        └── Resolume adapter → OSC UDP datagram → status unknown
```

Verified addresses:

- `/composition/layers/{layer}/clips/{clip}/connect` (`int 1`)
- `/composition/layers/{layer}/video/opacity` (`float 0..1`)

The transport test resolves the host and binds a local UDP socket; it sends no
datagram. Resolume OSC is one-way, so ShowFlow cannot and does not claim
acknowledgement. See [INTEGRATIONS.md](INTEGRATIONS.md).

## Media access

MediaVault stores absolute paths; it is an index, not a file store.

- Adding a file or scanning a folder only records supported extensions.
- `checkAll` refreshes availability at recorded paths.
- Folder relinking matches exact filenames, refuses ambiguous matches, and never
  guesses.
- The renderer previews images through `showflow-media://asset/<id>`, which
  re-checks that the asset exists, is available, and has a supported extension.
- Opening and revealing files use main-process shell calls after validation.
- Export/import transfers metadata, never media content.

## Backups and restore

- Backup format: `showflow-backup`, schema version 1, with per-table row limits
  and a SHA-256 checksum over the table payload.
- Automatic backups are stored under `%APPDATA%\ShowFlow\backups`, run at most
  once per 20 hours, and retain `max(3, retention)` copies. Manual backups are
  never pruned.
- Restore validates the file, size, format, schema, checksum, table shapes, and
  row limits. It creates a forced safety backup before replacing data.
- Restore returns `reloadRequired: true`. The renderer shows a blocking dialog;
  it does not silently reload or start anything.

## Security controls

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  `webviewTag: false`, `webSecurity: true`.
- Preload exposes only explicit methods and a frozen object.
- IPC allowlist in `shared/ipc.cjs`; contract-tested against the preload.
- Main-process validation for every handler.
- Navigation allowlist, window-open denial, webview denial, permission denial.
- CSP and `nosniff` on packaged responses; restrictive CSP on receiver pages.
- Media protocol serves only indexed, available, supported files.
- Single-instance lock prevents concurrent database writers.
- No telemetry, auto-update, or remote content loading.

See [../SECURITY.md](../SECURITY.md) for the threat model and residual risks.

## Build and packaging

- Vite builds the renderer to `dist/` with `base: './'` for `file://` loading.
- electron-builder packages `dist/`, `electron/`, `shared/`, and `package.json`
  into `app.asar`.
- `sql-wasm.wasm` and the application PNG icon are external resources under
  `resources/`, because the WASM file cannot be loaded from inside the asar for
  the sql.js locateFile path used here.
- `scripts/generate-icons.mjs` derives PNG, ICO, and NSIS BMP artwork from
  `build/icon-source.svg`. Generated binaries are ignored by Git and rebuilt by
  the packaging scripts.
- NSIS is per-user, non-elevated, install-directory-selectable, and configured
  with `deleteAppDataOnUninstall: false`.
- Artifact names: `ShowFlow-<version>-Windows-Setup.exe` and
  `ShowFlow-<version>-Windows-Portable.exe`.
- `scripts/checksums.mjs` hashes the end-user executables into
  `release/SHA256SUMS.txt`.

## Testing strategy

| Layer | What it proves |
| --- | --- |
| Vitest unit | Cue engine transitions, validation, OSC encoding, Resolume mapping, database/repository behavior, backup/restore, IPC/preload contract |
| Electron E2E | Real main process + preload + built renderer: onboarding, event/cue creation, rehearsal GO, simulated state, persistence, security preferences, crash/restart recovery, no replayed commands |
| Packaged E2E | `app.asar`, external WASM/icon, preload, database creation, window title in the packaged executable |
| Manual installer check | Install, launch, uninstall, shortcuts removed, `%APPDATA%` data retained |
| Checksums | Release executable SHA-256 values written and verified |

Mock adapters are tested before the Resolume adapter. No real Resolume
application was available; real-device behavior remains unverified.
