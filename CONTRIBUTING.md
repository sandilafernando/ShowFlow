# Contributing to ShowFlow

ShowFlow is a local-first Windows production tool for the Educational Media
Unit at Maris Stella College. Contributions are welcome once a public
repository and review process have been configured by the maintainer.

## Before you start

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the in-app **Help**
  screen. The execution-state rules are product requirements, not suggestions.
- Do not add telemetry, cloud accounts, automatic show execution, automatic
  command replay, or a renderer-side filesystem API.
- Do not claim that ShowFlow verified projector output, Resolume reception, or
  any other condition it cannot observe. Browser receipts are browser receipts.
- Keep the application fully usable offline. Network access is limited to the
  intentionally started LAN receiver and explicit OSC sends.

## Development setup

Prerequisites:

- Windows 10 or Windows 11, x64
- Node.js 24 LTS (Node.js 22.12 or newer should also work)
- npm 11 or newer

```powershell
npm ci
npm run icons
npm run dev
```

`npm run dev` starts Vite and Electron together. The renderer can also be built
without launching the app:

```powershell
npm run build:renderer
npm start
```

## Repository layout

```text
electron/          Electron main process, database, services, integrations, IPC
shared/            Pure contract modules used by both processes
src/               React renderer (Vite, Tailwind, Framer Motion)
tests/unit/        Vitest unit and integration tests (Node)
tests/e2e/         Playwright-driven Electron smoke tests
scripts/           Icon generation, checksums and documentation screenshots
docs/              Architecture, operator, integration, release and QA documents
build/             Generated icon and installer artwork (not committed except SVG source)
release/           Generated Windows packages (ignored by Git)
```

## Code expectations

- JavaScript/JSX, ES modules. Electron main is ESM; the sandboxed preload is
  CommonJS (`electron/preload.cjs`) by design.
- Follow the existing naming, formatting, and component patterns. Tailwind
  utility classes for layout, existing CSS tokens for color and type.
- Every renderer capability must go through the preload bridge and the
  canonical allowlist in `shared/ipc.cjs`. Update both sides and add a contract
  test where relevant.
- Validate every IPC input in the main process. Never trust renderer-provided
  paths, IDs, types, or sizes.
- Keep media access inside the indexed-asset protocol. Do not expose arbitrary
  paths to the renderer.
- Preserve the visual language: near-black surfaces, restrained cyan accent,
  Lucide icons, deliberate typography, reduced-motion support. Avoid generic
  dashboard cards, decorative gradients, and animation for its own sake.
- No production command may run on startup, on navigation, or after a crash.

## Tests and verification

Run the same gates locally before opening a pull request:

```powershell
npm run lint
npm test
npm run test:e2e
npm run dist
npm run test:e2e:packaged
npm run checksums
npm run checksums -- --verify
```

- Unit tests use temporary sql.js databases and must not touch real user data.
- E2E tests launch Electron against a temporary `SHOWFLOW_USER_DATA` directory.
- A packaged test requires `release/win-unpacked/ShowFlow.exe` from `npm run dist`.
- If you add a release artifact, update the checksum script and the release
  workflow together.
- Report actual results. A passing local test does not prove a passing GitHub
  Actions run, and a mock integration does not prove real hardware behavior.

## Commit and pull request guidance

- Keep commits focused. Use an imperative summary such as
  `Harden receiver pairing rate limits` or `Add cue fallback to run sheet`.
- Describe user-visible behavior, security implications, and the exact tests
  run in the pull request.
- Include screenshots for visual changes and mention reduced-motion behavior.
- Call out anything not verified, especially real projector, audio, network, or
  Resolume behavior.

## Security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contribution is licensed under the MIT
License in [LICENSE](LICENSE).
