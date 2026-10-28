# Troubleshooting ShowFlow

Start with the in-app **Help → Troubleshooting** section, **About → Copy
diagnostics**, and the local log:

```text
%APPDATA%\ShowFlow\logs\showflow.log
```

The **About** screen and **Settings → Data & backups** can open the data folder.
Redact pairing codes, receiver links, media paths, and event content before
sharing diagnostics publicly.

## The application will not start

### Installed build

1. Confirm Windows 10/11 x64.
2. Try launching again from the Start Menu. A second copy is refused by the
   single-instance lock; check for an existing ShowFlow window in Task Manager.
3. If Windows SmartScreen warns, the build is unsigned. Only bypass the warning
   for a build you obtained from a trusted source and whose SHA-256 matches the
   accompanying `SHA256SUMS.txt`.
4. Check `%APPDATA%\ShowFlow\logs\showflow.log` for the startup error.
5. Check free disk space and that `%APPDATA%\ShowFlow` is writable.

### Source build

| Message | Fix |
| --- | --- |
| "The ShowFlow interface build is missing" | Run `npm run build:renderer` before `npm start`. |
| Electron/Node version errors | Use Node.js 24 LTS and run `npm ci`. |
| sql.js WASM not found | Run `npm ci`; verify `node_modules/sql.js/dist/sql-wasm.wasm` exists. |
| Renderer blank in development | Confirm Vite is running on port 5173 and `wait-on` succeeded. |
| E2E cannot launch | Run `npm run test:e2e`; avoid another ShowFlow instance using the same test data. |

## Database and startup recovery

ShowFlow stores `showflow.db` in `%APPDATA%\ShowFlow`.

- `showflow.db.bak` is a copy of the previous launch.
- `showflow.db.corrupt-<timestamp>` is an unreadable primary preserved before
  recovery.
- `showflow.db.tmp-<pid>` is a temporary save file. A leftover file usually means
  an interrupted write; it is not used as the primary database.

If the primary cannot be opened:

1. ShowFlow tries the `.bak` copy.
2. If that fails, it creates a fresh database and preserves the unreadable file
   with the `.corrupt-` name.
3. It does not replay or execute production commands.

To recover data, stop ShowFlow and use a recent backup from
`%APPDATA%\ShowFlow\backups`, or ask someone qualified to inspect the preserved
`.corrupt-` file. Do not delete the corrupt copy before making another copy of
it.

### Restore does not complete

Restore validates the file before changing anything and creates a forced safety
backup. If validation fails, the current database is untouched. If restore
succeeds, the app shows a blocking **reload required** dialog. Reloading does not
start a session or send commands.

Common restore errors:

| Error | Cause |
| --- | --- |
| "not a ShowFlow backup" | Wrong JSON file or wrong `format` field |
| "unsupported schema version" | Backup from a newer build |
| "checksum does not match" | File modified or damaged |
| "too large" | Backup exceeds the 60 MB safety limit |
| "table is missing or invalid" | Truncated or hand-edited backup |

## Receiver server will not start

Open **ScreenPilot** and read the error.

- **Port already in use** — choose another port in **Settings → Network** (valid
  range 1024–65535), save, and start the server again.
- **Permission denied / bind failure** — another security product may block the
  port, or the port is reserved. Try a different high port.
- **Server stopped unexpectedly** — check the log. The server is manual-start
  only; it does not restart automatically after an app relaunch.
- **Settings changed while running** — if the port changed, ShowFlow tries to
  restart the receiver. If that fails, settings are still saved; start it again
  manually.

The server binds all IPv4 interfaces on the chosen port. This is required for LAN
receivers.

## Receiver link does not open

1. Confirm the receiver server is running and note the port.
2. On the display device, open the **Local network** link from **Server
   addresses**, not the control computer's `127.0.0.1` link.
3. Confirm both computers are on the same LAN/subnet.
4. Allow ShowFlow on **private networks** in Windows Firewall. Do not allow
   public networks.
5. Check that a VPN, VLAN, access point isolation, or guest-network policy is not
   separating the devices.
6. Confirm the full link includes `/r/<display-id>?code=<code>`. A truncated link
   fails pairing.
7. If pairing was regenerated, copy the new link. The old code no longer works.
8. After 12 failed pairing attempts from one IP in five minutes, the server
   returns "too many attempts." Wait for the window to expire or regenerate the
   code.

The receiver uses plain HTTP, not HTTPS. If the browser forces HTTPS or an
extension rewrites the URL, disable that behavior for the production LAN.

## Receiver shows "disconnected" or "stale"

- **Disconnected** — the WebSocket closed. Confirm ShowFlow is running, the
  receiver server is started, and the network is up. The receiver reconnects with
  backoff.
- **Stale** — no message has arrived for 32 seconds while the socket remains
  open. Check Wi-Fi, sleep settings, and the control computer.
- **Last seen is old** — the display connected previously but is not currently
  connected. Last seen is not proof of projector availability.
- **A second window replaced the first** — only one connection per display ID is
  kept. Close duplicate receiver tabs.
- **Fullscreen button does nothing** — browser fullscreen requires a user
  gesture and may be blocked by policy. Use the browser's own fullscreen command.
- **Sleep/screensaver** — disable sleep on the display computer during a show.

## Receiver says content was delivered but the projector is black

ShowFlow cannot see the projector. Check, in order:

1. Projector power and physical shutter/blanking.
2. Correct input source and cable.
3. The display computer is awake and the browser is on the receiver page.
4. Browser fullscreen and zoom.
5. Receiver blackout state. Send **Clear** by re-pushing content or use the
   receiver's controls; a receiver blackout does not clear itself.
6. Windows display mode (extend/duplicate), resolution, and refresh rate.
7. HDCP, adapter, or cable issues.
8. Resolume/playback output if the cue depends on external media.

"Delivered" means a browser accepted a message. It is not a projector
acknowledgement.

## Test patterns and blackout

- Test patterns are sent from ScreenPilot to selected receivers. They do not
  change the running order.
- Blackout covers participating receiver browsers with black. It does not switch
  off a projector or guarantee a dark room.
- A test that works in the browser but not on the projector points to display
  routing, cabling, input, or projector settings.

## Media is marked missing

Common causes:

- The file was moved, renamed, or deleted.
- A removable drive or network share is disconnected.
- A drive letter changed.
- The file is on a different Windows account/profile with different permissions.

Fix:

1. Reconnect the drive/share.
2. Use **Check files**.
3. If the file moved, use **Relink** for one asset or **Relink folder** to match
   exact filenames in a folder.
4. Resolve ambiguous matches manually; ShowFlow deliberately does not guess.
5. Rehearse the cue after relinking.

MediaVault never copies, moves, renames, or deletes source files. A backup
contains metadata, not media. Keep separate copies of source media.

## Media will not preview or open

- Only supported extensions are indexed and served.
- Images preview through the restricted media protocol. If the file is missing
  or unavailable, the preview fails by design.
- **Open** uses the Windows default application. If no application is associated,
  Windows will prompt or fail.
- Network paths and permissions must be available to the Windows account running
  ShowFlow.
- Codec playback is the responsibility of the external player; ShowFlow does not
  transcode.

## Resolume test passes but nothing happens

This is expected if you only ran **Test transport**. The test sends no OSC
datagram.

Check:

1. Resolume OSC input is enabled and listening on the configured port.
2. Host and port are correct.
3. The event is **LIVE**, not rehearsal.
4. The integration is **Enabled**, not just configured.
5. The cue has a valid Resolume action and layer/clip.
6. Layer and clip numbering starts at 1.
7. Resolume's composition contains that layer/clip.
8. Windows Firewall/security software allows outbound UDP.
9. Resolume's own OSC mapping/preferences do not override the target.

A send result of "Sent — unverified" means only that the local UDP stack accepted
the datagram. Confirm the visual result. See [INTEGRATIONS.md](INTEGRATIONS.md).

## Event is stuck or the app closed during a show

On the next launch, any event that was `live` or `rehearsal` is marked
**Interrupted** and its live cue is cleared. This is intentional:

- No command is replayed.
- No cue is restarted.
- No screen content is re-sent automatically.

Review the event, the last activity entries, and the physical room. Arm cues again
only after deciding the correct state. If external equipment is still running,
operate it manually.

## Live session controls are disabled

- Add at least one cue before starting live.
- End a live session before editing cues, archiving, or deleting the event.
- Archived events cannot start rehearsal or live sessions.
- If another session is already active, choose it from the Control Room active
  list or end it first.

## Backups

- Automatic backups run at most once every 20 hours when enabled.
- Retention is 3–30 copies (default 8). Manual backups are never pruned.
- Backup files are in `%APPDATA%\ShowFlow\backups`.
- Backups do not include original media or logs.
- Keep a copy on separate storage. Uninstall preserves data but does not protect
  against disk failure, profile damage, or accidental deletion.

## Uninstall and reinstall

The uninstaller removes the application and shortcuts. It intentionally leaves
`%APPDATA%\ShowFlow` so events, media metadata, backups, and logs survive.

To start completely fresh:

1. Uninstall ShowFlow.
2. Make a backup copy of `%APPDATA%\ShowFlow` if you might need it.
3. Delete `%APPDATA%\ShowFlow`.
4. Reinstall and complete onboarding.

The portable build also uses `%APPDATA%\ShowFlow`, so it shares data with an
installed copy. Do not run both at once; the single-instance lock will refuse the
second process.

## Collecting diagnostics

From **About**, use **Copy diagnostics**. It includes version, platform, paths,
and local status. Review and redact:

- Pairing codes
- Full receiver links
- Media paths and filenames
- Event titles and notes
- Hostnames/IP addresses if sensitive

Also note the approximate time of the problem and the exact action. Do not send
the database or backups unless specifically asked and you have removed sensitive
production data.

## Developer checks

```powershell
npm run lint
npm test
npm run test:e2e
npm run test:e2e:packaged
npm run checksums -- --verify
```

E2E tests use a temporary user-data directory. If a test leaves an Electron
process running, close it in Task Manager and rerun. Test artifacts are written to
`tests/e2e/artifacts/`.
