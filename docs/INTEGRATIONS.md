# Resolume OSC integration

ShowFlow deliberately implements a very small Resolume integration. It supports
two operations, both taken from Resolume's published OSC documentation. Everything
else is operated manually.

Reference: <https://resolume.com/support/en/osc>

## Supported operations

| ShowFlow action | OSC address | Argument | Resolume feedback |
| --- | --- | --- | --- |
| Connect clip | `/composition/layers/{layer}/clips/{clip}/connect` | integer `1` | None |
| Set layer opacity | `/composition/layers/{layer}/video/opacity` | float `0..1` | None |

Limits:

- Layer: whole number `1–999`
- Clip: whole number `1–9999`
- Opacity: `0.0–1.0` (UI shows the equivalent percentage)
- Host: IP address or hostname, no scheme or path
- OSC port: `1–65535`; Resolume's documented default is `7000`
- Broadcast and unspecified targets (`0.0.0.0`, `255.255.255.255`) are rejected

## Configure Resolume

1. In Resolume, enable OSC input and confirm the listening port. Resolume's
   default OSC port is `7000`.
2. Put the Resolume computer and the ShowFlow control computer on the same
   trusted production network.
3. In ShowFlow, open **Settings → Integrations**.
4. Set mode to **Resolume Arena OSC**.
5. Enter the Resolume host IP or hostname and the OSC port.
6. Set the integration to **Enabled**.
7. Use **Test transport** and read the result literally: it resolves the host and
   tests the local UDP socket. It sends no datagram, so a pass does not prove
   Resolume is listening.
8. Map the action on individual cues in the event editor.
9. Rehearse with mock mode or rehearsal. Confirm the real mapping during a
   controlled live test before relying on it in a show.

ShowFlow is disabled by default. Enabling it does not send anything until a
mapped cue is GOed in a live session.

## Execution semantics

Resolume OSC is one-way UDP. Resolume does not acknowledge clip triggers or
opacity changes to ShowFlow.

| Situation | ShowFlow report |
| --- | --- |
| Mock mode, action invoked | `completed`, `simulated: true`, no socket opened |
| Rehearsal, mapped cue GO | Simulated completion, no datagram sent |
| Live + enabled + valid mapping, datagram handed to the OS | `unknown`, `acknowledged: false`, UI "Sent — unverified" |
| Live but integration disabled | Blocked, `INTEGRATION_DISABLED` |
| Non-live event | Blocked, `NOT_LIVE` |
| Archived event | Blocked, `EVENT_ARCHIVED` |
| Invalid layer/clip/opacity | Blocked, mapping error |
| UDP/socket failure | `failed`, error detail, no retry |
| Event status is live but integration is mock | Simulated success, clearly labelled |

A successful send means the local network stack accepted the datagram. It does
not mean Resolume received it, selected the intended clip, or changed the
projector output.

## Safety gates

A real send requires all of the following:

1. The event exists and is not archived.
2. The event status is `live`.
3. The integration is enabled.
4. The cue belongs to that event.
5. The cue has a valid Resolume action and parameters.

Rehearsal, draft, completed, interrupted, and archived events never transmit.
There is no automatic retry, scheduled send, startup send, or post-crash replay.
A failed send is logged and reported. The operator must decide what to do next.

## What is not supported

ShowFlow intentionally does not implement:

- Arbitrary OSC addresses or a general OSC console
- Clip disconnect, clear, or transport control
- Composition loading or layer/master selection
- Tempo, BPM, audio, or effect parameters
- Resolume feedback, status, or clip-name discovery
- MIDI, Art-Net, vMix, or other integrations (vMix and MIDI are only listed as
  planned, not implemented)
- Automatic cue execution, scheduling, or failover
- Importing a Resolume composition to generate cue mappings
- Retrying failed datagrams
- TLS, authentication, or encrypted OSC

If a production depends on one of these, operate it manually and record it in the
cue notes/fallback.

## Network and security

- OSC over UDP is unauthenticated. Anyone who can reach the Resolume OSC port can
  send commands.
- Keep Resolume and ShowFlow on a trusted production VLAN or isolated LAN.
- Do not expose the OSC port to the internet or a guest network.
- Windows Firewall may prompt when ShowFlow binds a local UDP socket. Allow
  private networks only if required.
- Verify the target host. A typo can send commands to another device.
- The transport test does not send a datagram and does not verify Resolume's
  configuration.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| "Target could not be resolved" | Hostname/IP, DNS, network route, firewall |
| "Local UDP transport unavailable" | Windows firewall/security software blocking UDP bind |
| Send succeeds but nothing changes | Resolume OSC input enabled, port, layer/clip numbering, composition, visual output |
| "Integration disabled" | Settings → Integrations → Enabled |
| "Only transmitted from a LIVE event" | Event status; rehearsal deliberately blocks sends |
| "No Resolume action is mapped" | Cue mapping in the event editor |
| Opacity has no effect | Layer video opacity may be overridden by composition/master settings |
| Test passes but sends fail | Test is transport-only; inspect the target and Resolume state |

When reporting an integration problem, include the ShowFlow version, event
status, mode, target host/port (redact if sensitive), action, layer/clip, and the
exact error. Do not include pairing codes or production media paths.
