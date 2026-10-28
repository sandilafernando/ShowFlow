# ShowFlow operator guide

This guide is for the show caller and duty technician. It assumes ShowFlow is
installed on the control computer and the display computers are on the same
trusted production network.

The same guidance is available in the application under **Help**, including the
current data-folder path.

## 1. Operating principles

ShowFlow tracks the plan. It does not run the show for you.

- Starting ShowFlow starts no cue, no session, no receiver server, and no OSC
  command.
- Rehearsal moves cues and can update screen content, but never transmits
  integration commands.
- Live mode unlocks deliberate integration sends. It does not execute anything
  until you arm a cue and press GO.
- A receiver acknowledgement means a browser received a message. It does not
  mean a projector is on, on the right input, focused, unmuted, or displaying the
  image.
- If the application closes during a live or rehearsal session, the event returns
  as **Interrupted** on the next launch. No command is replayed.
- A failed command is reported, not silently retried.

If software state and the room disagree, the room wins. Use the fallback
instruction in the cue and communicate with the crew.

## 2. First run

1. Read the operating limits and acknowledge them.
2. Enter the operator name and default venue.
3. Enter ShowFlow.

You can change the operator and venue later in **Settings → Workspace**.
Onboarding completion is stored locally.

## 3. Build an event

Open **Events → New event**.

Record:

- Title, date, start time, venue
- A short description
- Production notes and technical notes

Save the event. It starts in **Draft** status with an empty running order.

### Event statuses

| Status | Meaning |
| --- | --- |
| **Draft** | Prepared, no active session. Also the state after ending rehearsal. |
| **Rehearsal** | An isolated practice session. Screens may receive content; integration actions are simulated. |
| **Live** | Deliberate production session. Mapped OSC sends are permitted on GO. |
| **Completed** | The live session ended normally. |
| **Interrupted** | ShowFlow closed or lost the session while it was active. Nothing is replayed. |

You can duplicate an event to copy its structure for a future production.
Archive events you want to keep out of the working list. Archived events cannot
start sessions or transmit. End a live session before archiving or deleting it.

## 4. Build the running order

Open the event and add cues in performance order.

For each cue, record:

- **Title** — what the show caller says or recognizes.
- **Type** — video, audio, image, presentation, lighting, stage, countdown,
  manual, or custom.
- **Duration** — used for the live timer. Zero means no countdown is enforced.
- **Operator** — the person responsible for executing it.
- **Notes** — the instruction, cue line, or context.
- **Fallback** — what to do if the cue fails. Write this before the show.
- **Media asset** — an indexed MediaVault item, if the cue depends on a file.
- **Resolume mapping** — optional clip connect or layer opacity action.

Reorder cues with the running-order controls. Cue edits are locked while the
event is live; use rehearsal or end the live session first.

### Export and import

- **Run sheet** exports an HTML or text document with event details, crew, cues,
  media paths, missing-file warnings, and checklists. Print or share it for the
  crew.
- **Event plan** exports JSON containing the event, cues, assignments,
  checklists, and media index. It is a transfer format, not a media copy.
- **Import event plan** creates a new event. Missing operators and media are
  reported as warnings; existing media with the same path is reused.

## 5. Prepare media

Open **MediaVault**.

- **Add files** indexes individual supported files.
- **Add folder** scans a folder recursively, skipping hidden folders, symbolic
  links, `node_modules`, `.git`, and system directories. Supported types include
  common video, audio, image, presentation, and document extensions.
- **Check files** refreshes availability at every recorded path.
- **Relink** points a missing asset at a new file.
- **Relink folder** matches missing assets by exact filename. Ambiguous matches
  are reported and not guessed.
- **Edit metadata** changes tags, category, event, and notes.
- **Export metadata / Import metadata** transfers the library index only. Media
  files are never copied, moved, renamed, or deleted.
- **Open / Reveal** opens a file or its folder in Windows.

MediaVault is an index. Moving or renaming source files outside ShowFlow will
make them missing. A cue linked to a missing file can still be armed and GOed,
but the external playback may fail. Resolve missing-file warnings before doors.

## 6. Prepare the crew

Open **CrewSync**.

1. Add crew members with name, default role, and contact.
2. Select an event and assign roles: show caller, playback, display, audio, stage
   manager, lighting, technician, or a custom role.
3. Add role notes such as report time, position, or radio channel.
4. Add setup and shutdown checklist items and mark them complete as they are
   actually done.

CrewSync creates no accounts and sends no messages. Deleting a crew member leaves
event assignments in place but unassigned. Checklist completion is a local
record, not proof that a physical task was performed.

## 7. Prepare screens

Open **ScreenPilot**.

### Add a display

Record a name, routing purpose (**Live output** or **Preview**), resolution,
layout, and optional notes. Every display receives a six-digit pairing code.

Preview and live are routing labels. Both receive the same cue payload when you
deliberately push to them. Preview does not run the show independently.

### Start the receiver server

The receiver server is manual-start only.

1. Confirm the receiver port in **Settings → Network** (default `41730`).
2. Press **Start receiver server** in ScreenPilot.
3. Allow ShowFlow on **private networks** if Windows Firewall prompts. Do not
   allow public networks.
4. Open **Server addresses** and choose the local-network address that the
   display computer can reach.
5. Open the display's **Link** in a browser on the display device, or copy the
   full receiver link. The link includes the pairing code.
6. Press **Enter fullscreen** on the receiver page.

The receiver link is a credential. Anyone on the LAN with the link can view that
display's cue information. Do not share links outside the production network or
post them in public messages.

If a link is exposed, regenerate the pairing code. The old connection is
disconnected.

### Delivery checks

- **Connected** means a paired browser has an open WebSocket.
- **Last seen** is historical; it does not prove current availability.
- **Delivered 2 of 3** means two browsers accepted a message, not that two
  projectors displayed it.
- **Test patterns** (bars, grid, white, label) verify browser delivery and help
  check geometry and input.
- **Blackout** requests black in participating receiver browsers. It does not
  turn off a projector or guarantee a dark room.
- **Push preview / live / all** sends the active session's current cue state.
  Pushing requires an event in rehearsal or live.

Verify every projector physically: power, input, blanking, focus, aspect ratio,
audio, and confidence monitor.

### Stop the server

Stop the receiver server when screens are no longer needed. Stopping disconnects
open receivers. It does not shut down the projector or display computer.

## 8. Rehearse

Open **Control Room** and choose the event.

1. Press **Start rehearsal**.
2. Select a cue to arm it (or use the previous/next controls).
3. Press **GO** (`Ctrl+Enter`) when the cue moment arrives.
4. Review simulated execution state. Rehearsal actions are explicitly labelled
   as simulated; nothing is transmitted to Resolume.
5. Press **Complete** or **Skip** as appropriate.
6. Use **Reset rehearsal marks** to reset the cue states and timer.
7. Press **End rehearsal** when finished. The event returns to draft and the
   marks are cleared.

Starting rehearsal sends nothing. GO in rehearsal does not send OSC, even if the
cue has a mapping.

## 9. Go live

Before starting live:

- Walk the room and confirm every projector and audio path.
- Confirm the running order and fallbacks.
- Confirm displays are paired and showing the correct content.
- Confirm the configured integration mode. Mock mode is the safe default.
- Decide who has authority to call the show.

Then:

1. Press **Start live session** and confirm.
2. Arm the first cue.
3. Press **GO** at the cue.
4. Watch the cue timer and the execution state.
5. Press **Complete** or **Skip** after the moment.
6. Repeat for each cue.

Live mode enables mapped OSC sends only when an integration is enabled and the
cue is invoked. Every send is reported as unverified because Resolume does not
acknowledge it. A screen push result reports browser delivery only.

Ending the live session marks the event completed and stops tracking a live cue.
It does not switch off projectors, media players, lighting desks, or Resolume.
The last receiver content remains until you black it out or change it.

## 10. Emergency actions

The Control Room emergency panel contains:

- **Blackout screens** — sends black to connected receivers. Verify the room.
- **Mark session interrupted** — stops the session record, clears the live cue,
  and logs the interruption. It sends no playback or integration command.
- **End session** — closes the session normally, with the same equipment caveat.

If a cue fails:

1. Follow the cue's fallback instruction.
2. Communicate the problem to the crew.
3. Use blackout or a manual fallback if the output is wrong.
4. Do not rely on ShowFlow to reconstruct a previous state. It has no automatic
   rollback.

ShowFlow cannot stop a media player, change a projector input, restore a lighting
state, or guarantee that the audience saw anything.

## 11. Settings

### Workspace

Operator name and default venue. The default venue is prefilled for new events.

### Network

Receiver port, validated from 1024 to 65535. Changing it while the server is
running attempts a restart. If restart fails, settings are saved and a warning is
returned; check the port and start the server again in ScreenPilot.

### Integrations

- Mode: **Mock** or **Resolume Arena OSC**.
- Enabled/disabled state. Disabled blocks every send, even in live.
- Host and OSC port (Resolume default `7000`).
- Test transport. This sends no datagram and cannot prove Resolume is listening.
- Capability reference.

Mock mode is the default. Use it for rehearsals and training. Read
[INTEGRATIONS.md](INTEGRATIONS.md) before enabling real OSC.

### Data & backups

- Database integrity check.
- Manual backup creation.
- Restore from a backup file. Restore creates a safety backup, replaces data, and
  requires an interface reload.
- Automatic backup toggle and retention (3–30, default 8).
- Recent automatic backups and storage statistics.
- Open the local data folder.

Restoring does not start a show or replay commands. After reload, verify the
event and session state before going live.

## 12. History

**History** records events, cue actions, media checks, display connections,
integration tests/sends, crew changes, backups, and system notes. Filter by event
or category. You can add a manual production note.

The log is local. It records what ShowFlow requested and what software reported;
it cannot independently verify the room.

## 13. Keyboard and conventions

| Input | Action |
| --- | --- |
| `Ctrl+Enter` | GO the armed cue while a session is active |
| `Esc` | Close the current dialog without applying it |
| `Tab` | Move focus; dialogs trap focus until closed |

Terms:

- **Standby** — no active session; nothing is executing.
- **Armed** — the cue GO will invoke. Arming executes nothing.
- **Live** — a session where deliberate sends are permitted. It does not mean a
  cue is running.
- **Interrupted** — a session that did not end normally. Nothing is replayed.

## 14. After the show

1. End the live session deliberately.
2. Send blackout or a safe holding state if the venue needs it.
3. Stop the receiver server.
4. Confirm the event is completed and review History.
5. Create a manual backup if the production record matters.
6. Shut down external equipment separately.
7. Keep a copy of important backups on separate storage.

Uninstalling ShowFlow does not delete `%APPDATA%\ShowFlow`. Remove that folder
only when you are certain its events, media index, backups, and logs are no
longer needed.

## 15. If something goes wrong

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) or the in-app **Help → Troubleshooting**
section. When reporting an issue, use **About → Copy diagnostics** and redact
pairing codes, receiver links, media paths, and event content before sharing.
