# Release process

ShowFlow produces two Windows x64 artifacts:

```text
release/ShowFlow-<version>-Windows-Setup.exe
release/ShowFlow-<version>-Windows-Portable.exe
release/SHA256SUMS.txt
```

The installer is per-user NSIS (`asInvoker`), permits choosing an install
directory, creates Start Menu and desktop shortcuts, and does not delete
`%APPDATA%\ShowFlow` on uninstall. The portable build uses the same user-data
folder.

## Prerequisites

- Windows 10/11 x64
- Node.js 24 LTS
- npm 11+
- Clean `npm ci` installation
- No ShowFlow instance running during packaging or installer testing
- No code-signing certificate is configured for this project

## Build locally

```powershell
npm ci
npm run icons
npm run lint
npm test
npm run test:e2e
npm run dist
npm run test:e2e:packaged
npm run checksums
npm run checksums -- --verify
```

`npm run dist` regenerates icons and the renderer before invoking
electron-builder. Output goes to `release/`, which is ignored by Git.

Artifact names come from `electron-builder.yml`. Do not add a root-level
`publisherName`; electron-builder 26 rejects it. Signing is intentionally not
configured.

## Verify a build before distribution

1. Confirm `release/SHA256SUMS.txt` contains both executables and verification
   passes.
2. Launch the unpacked executable and complete onboarding.
3. Confirm the version in **About**.
4. Confirm a database appears under `%APPDATA%\ShowFlow`.
5. Install the NSIS build into a temporary directory.
6. Launch the installed app and confirm the window icon, title, and core screens.
7. Uninstall and confirm the application directory and shortcuts are removed.
8. Confirm `%APPDATA%\ShowFlow\showflow.db` remains.
9. Inspect the executable icon in Explorer and the installer artwork.
10. If you have signing hardware, sign and re-check the hashes afterward. Do not
    reuse a checksum file after modifying a binary.

The local verification record is in [VERIFICATION.md](VERIFICATION.md).

## GitHub Actions

Two workflows are included. They have **not** run in this workspace because no
remote is configured.

### `.github/workflows/ci.yml`

Runs on pushes to `main`, pull requests, and manual dispatch:

- `npm ci`, generated icons, lint, unit tests
- renderer build
- source Electron E2E
- on non-PR runs: full `npm run dist`, packaged E2E, checksums, artifact upload

The E2E job uploads `tests/e2e/artifacts/` on failure for diagnosis.

### `.github/workflows/release.yml`

Runs on tags matching `v*`:

- Performs the full verification and packaging sequence
- Runs the packaged executable smoke test
- Writes and verifies `release/SHA256SUMS.txt`
- Uploads the installer, portable executable, blockmaps, and checksum file as a
  **draft** GitHub release using `GITHUB_TOKEN`
- Does not publish the draft automatically
- Does not sign binaries
- Does not upload `win-unpacked`

To use it, configure a remote, push a tag, wait for the draft, inspect the
artifacts and checksums, then publish manually if appropriate. Never claim a
workflow succeeded until it has actually run.

## Versioning

1. Update `version` in `package.json`.
2. Update `CHANGELOG.md`.
3. Update `docs/RELEASE_NOTES.md`.
4. Rebuild and verify.
5. Commit.
6. Tag `v<version>` and push the tag.
7. Review the draft release. Replace the release notes if needed.
8. Attach the correct `SHA256SUMS.txt` and publish only after verification.

`package.json` has empty `homepage` and `repository` fields on purpose. Do not
invent a repository URL. Set them when a real remote exists.

## Signing

Code signing is not configured. The release workflow sets
`CSC_IDENTITY_AUTO_DISCOVERY=false` so electron-builder does not hunt for a local
certificate. Builds are unsigned and may trigger SmartScreen.

If signing is added later:

- Store the certificate and password in repository secrets, never in the repo.
- Sign the installer and portable executable before generating checksums.
- Sign the unpacked executable if you distribute it.
- Verify the signature on a clean Windows machine.
- Update the security and release documentation.
- Publish checksums generated from the signed binaries only.

## Checksum format

`SHA256SUMS.txt` uses the conventional two-space format:

```text
<64 lowercase hex characters>  ShowFlow-1.0.0-Windows-Setup.exe
<64 lowercase hex characters>  ShowFlow-1.0.0-Windows-Portable.exe
```

Verify on Windows:

```powershell
Get-FileHash .\ShowFlow-1.0.0-Windows-Setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

Or with the repository script after placing the artifacts in `release/`:

```powershell
npm run checksums -- --verify
```

## Rollback

A release cannot be un-published safely if users may already have downloaded it.
Prefer publishing a new patch version with a clear changelog entry. If an
artifact is malicious or broken, remove it from distribution, publish an
advisory, and retain the checksums for incident analysis.

## Not configured

- Repository remote or public download URL
- GitHub release publication
- Code signing or notarization
- Auto-update feed
- Crash reporting or telemetry
- macOS/Linux builds
