# Security policy

ShowFlow is an offline-first desktop application. It stores production data
locally and opens network listeners only when the operator explicitly starts
them.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| Earlier | No public releases exist yet |

## Reporting a vulnerability

Do not include pairing codes, receiver links, media paths, event content, or
other sensitive production data in a public issue.

A public repository and private security-advisory channel are not yet configured
for this workspace. Before publishing or distributing builds, the maintainer
must establish a private reporting route (for example, GitHub private
vulnerability reporting on the eventual repository). Until then, report the
issue directly and privately to the project maintainer. No security email
address is invented here.

Please include:

- ShowFlow version and Windows version
- A description of the issue and its impact
- Reproduction steps or a minimal proof of concept
- Whether the issue requires local access, a malicious file, or network access
- Any suggested mitigation

You should receive an acknowledgement when the report is received. No response
or fix timeline is promised.

## Security model

### Process isolation

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- `webviewTag: false`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- The renderer has no Node.js, filesystem, or raw IPC access. It receives only
  the frozen API exposed by `electron/preload.cjs`.
- IPC channels are an explicit allowlist in `shared/ipc.cjs`; the preload and
  main process are contract-tested for drift.
- Every IPC handler validates its input in the main process. Sender and window
  checks prevent unexpected frames from invoking handlers.
- New windows, arbitrary navigation, and webview attachment are blocked.
- All permission requests and permission checks are denied.
- DevTools are disabled in packaged builds unless explicitly running the E2E
  test mode.
- A single-instance lock prevents two processes from writing the same database.

### Content security policy

Packaged builds apply:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: showflow-media:;
media-src 'self' blob: showflow-media:;
font-src 'self' data:;
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'none';
frame-ancestors 'none'
```

`X-Content-Type-Options: nosniff` is also set. The media protocol only serves
indexed assets that are currently marked available, have a supported extension,
and still exist at their recorded path. It does not accept arbitrary renderer
paths.

### Local data

- Data lives under Electron `app.getPath('userData')`, normally
  `%APPDATA%\ShowFlow`.
- The SQLite database is stored as a single local file using sql.js, with an
  atomic temp-file/rename save and a previous-launch `.bak` copy.
- Data is not encrypted at rest. Use Windows account controls, BitLocker, and
  appropriate physical security for the control computer.
- Logs may contain local file paths and operational details. Review logs before
  sharing them.
- No telemetry, analytics, crash upload, or cloud sync is included.
- Uninstall intentionally leaves the user-data folder in place. Removing it is
  a separate, explicit operator action.

### LAN receiver

- The receiver server is manual-start only and binds `0.0.0.0` on the configured
  port (default `41730`).
- Access requires a per-display 6-digit pairing code embedded in a receiver
  link. The link is a bearer credential; anyone with it can view that display's
  cue information while connected.
- Invalid pairings are rate-limited (12 failures per IP in a 5-minute window,
  then HTTP 429 / WebSocket 429).
- WebSocket upgrades verify the request origin when an Origin header is present,
  cap message size at 32 KiB, and use heartbeat liveness checks.
- Receiver pages are served over plain HTTP and WebSocket, not TLS. Use a
  trusted production LAN, not a public or guest network. Do not port-forward the
  receiver port to the internet.
- "Acknowledged" means the receiver browser accepted a message. It never proves
  projector output, focus, input selection, or audio state.
- Regenerating a pairing code disconnects that display.

### Resolume OSC

- OSC is unauthenticated, one-way UDP. ShowFlow only supports two documented
  addresses: clip connect and layer opacity.
- The integration is disabled by default. Mock mode is the default and opens no
  network connection.
- Sends are blocked unless the event is `live` and the integration is enabled.
  Rehearsal never transmits.
- ShowFlow reports a successful send as unverified, never acknowledged.
- The transport test resolves the target and binds a local UDP socket; it sends
  no datagram. It cannot prove Resolume is listening.
- Do not expose the Resolume OSC port to untrusted networks.

### Packaging and distribution

- Windows builds are x64 NSIS installer and portable executables.
- Code signing is not configured. Builds are unsigned and Windows SmartScreen
  may warn. Verify `SHA256SUMS.txt` against a trusted source before running a
  build.
- There is no automatic update mechanism. Updates are manual.
- Release workflows create a draft release and artifacts; they do not publish a
  release automatically and do not sign binaries.

## Out of scope

- A compromised Windows account or physical access to the control computer
- A malicious user on the production LAN who obtains a receiver link
- Projector, amplifier, media player, lighting desk, or Resolume configuration
- Loss of original media files outside ShowFlow's index
- Denial of service through a compromised local network interface
