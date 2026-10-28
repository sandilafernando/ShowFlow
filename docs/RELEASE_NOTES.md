# ShowFlow 1.0.0

Windows 10/11 x64 · Educational Media Unit, Maris Stella College

**Release date:** 2026-10-29

ShowFlow is an offline-first production control desk for cue calling, LAN screen
delivery, media readiness, and crew planning. The operator remains the show
caller: ShowFlow never starts a cue on launch, never replays commands after a
restart, and never claims to have verified projector output.

## Highlights

- Event planning, running order, cue fallbacks, run-sheet and plan export
- Rehearsal and live Control Room with arm/GO, timers, complete/skip, and
  emergency blackout/interrupt
- ScreenPilot LAN receivers with per-display pairing, health, test patterns, and
  live/preview routing labels
- MediaVault indexing, missing-file detection, and relinking without touching
  original files
- CrewSync roster, assignments, and setup/shutdown checklists
- Local SQLite history, integrity checks, automatic/manual backups, and restore
  with a safety backup
- Mock integration plus two verified Resolume OSC operations: clip connect and
  layer opacity

## Honest execution state

ShowFlow distinguishes requested, acknowledged, completed, failed, and unknown.
A receiver acknowledgement means a browser received a message, not that a
projector displayed it. Resolume OSC is one-way; successful sends are reported as
unverified.

Rehearsal never transmits integration commands. Live sends require a live event,
an enabled integration, and a mapped cue. No command is retried or replayed.

## Installation

Use one of these artifacts:

- `ShowFlow-1.0.0-Windows-Setup.exe` — per-user installer; creates shortcuts;
  preserves user data on uninstall.
- `ShowFlow-1.0.0-Windows-Portable.exe` — portable executable.

Data is stored in `%APPDATA%\ShowFlow`. The portable build shares this folder
with an installed copy.

**These builds are unsigned.** Windows SmartScreen may warn. Verify the SHA-256
checksum from a trusted source before running anything:

```powershell
Get-FileHash .\ShowFlow-1.0.0-Windows-Setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## Known limitations

- No real Resolume installation or production hardware was tested. OSC behavior
  is verified by unit tests and documented addresses only.
- No code signing certificate is configured.
- No auto-update, cloud sync, telemetry, or crash reporting.
- Receiver delivery is browser-based over plain LAN HTTP/WebSocket and cannot
  control projector power, input, focus, or audio.
- Only the two documented Resolume operations are supported.
- Windows x64 only.

## Documentation

- [README](../README.md)
- [Operator guide](USER-GUIDE.md)
- [Architecture](ARCHITECTURE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Resolume integration](INTEGRATIONS.md)
- [Verification record](VERIFICATION.md)
- [Security policy](../SECURITY.md)
- [Changelog](../CHANGELOG.md)

## Licence

MIT · Copyright © 2026 Sandila Fernando.
