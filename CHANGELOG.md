# Changelog

All notable changes to ShowFlow are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [1.0.0] - 2026-10-29

Initial Windows desktop release for the Educational Media Unit, Maris Stella
College.

### Added

- Offline-first Electron application with React/Vite, Tailwind, and Framer
  Motion, built around a near-black, restrained cyan visual system.
- Onboarding, dashboard, event workspace, running order, cue editor, plan
  import/export, HTML/text run-sheet export, and event duplication/archiving.
- Live Control Room with explicit rehearsal and live sessions, arm/GO, next
  cue, complete/skip, cue timers, activity trail, screen push, and
  blackout/interrupt fallback actions.
- Honest execution states: requested, acknowledged, completed, failed, and
  unknown. Simulated rehearsal actions are labelled as simulated.
- ScreenPilot with a manually started LAN receiver server, per-display pairing
  codes, receiver links, live/preview labels, connection health, test patterns,
  blackout, and browser-delivered cue content.
- MediaVault file and folder indexing, metadata, thumbnails, missing-file
  detection, single-file and folder relinking, metadata export/import, and safe
  media opening.
- CrewSync roster, event assignments, setup/shutdown checklists, and notes.
- History with filtering and production notes, plus local activity logging.
- Settings for operator/venue, receiver port, Resolume OSC configuration,
  automatic backups, database health, diagnostics, and data-folder access.
- SQLite persistence through sql.js with atomic saves, previous-launch `.bak`
  recovery, corrupt-file preservation, integrity checks, and interrupted-session
  recovery.
- Automatic backups with millisecond-precise filenames, configurable retention,
  manual backup, and restore with a mandatory safety backup and interface reload.
- Mock Resolume integration and a verified two-operation Resolume OSC adapter
  (clip connect, layer opacity) that never claims acknowledgement.
- Original ShowFlow SVG source, PNG/ICO application icons, and NSIS installer
  artwork generated from the source mark.
- Sandboxed preload, strict IPC allowlist, content security policy, navigation
  and permission restrictions, restricted media protocol, and single-instance
  lock.
- Vitest unit/integration suite, Playwright Electron smoke test, packaged-app
  smoke test, installer/uninstall data-retention verification, and SHA-256
  release checksum script.
- NSIS installer and portable Windows x64 builds via electron-builder.
- README, architecture, operator, integration, troubleshooting, release, and
  verification documentation; MIT license; contribution and security policies.
- GitHub Actions CI and a tag-triggered draft-release workflow. The release
  workflow is configured but has not been run because this workspace has no
  remote repository.

### Known limitations

- No real Resolume installation or production hardware was available for
  testing. OSC behavior is verified by unit tests, loopback encoding tests, and
  documented paths only.
- Windows builds are unsigned; no code-signing certificate is configured.
- No automatic updates, cloud sync, installer telemetry, or crash reporting.
- No macOS or Linux packages.
- Receiver links are bearer credentials carried over plain LAN HTTP/WebSocket;
  there is no TLS mode.
- The GitHub workflows and draft release process have not executed on GitHub
  from this workspace.
