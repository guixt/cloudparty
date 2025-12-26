# Avatar Specification

High-level, render-agnostic description of avatar state, lifecycle, and component boundaries for Cloudparty 2.0.

## AvatarSpec Data Model

- **identity**
  - `id` (string, stable and unique per session or account)
  - `displayName` (string, user-facing label; server-authoritative for moderation)
- **presence**
  - `position` (vec3 meters, world space)
  - `orientation` (quaternion or yaw/pitch/roll, world space)
  - `focus` (optional target identifier or interaction handle)
- **emotes**
  - Map of gesture/emotion keys to state objects `{ name, startedAt, durationMs?, intensity?, loop? }`
  - Concurrent emotes allowed; consumers decide conflict resolution.
- **proximity**
  - `personalSpaceRadius` (meters; min clamped by server policy)
- **permissions** (room-level capabilities)
  - Flags such as `canMove`, `canEmote`, `canInteract`, `canSpeak`, `canModerate`, `canSpawnItems`

### Canonical payload example

```json
{
  "identity": { "id": "u_123", "displayName": "Alex" },
  "presence": {
    "position": [1.2, 0.0, -3.5],
    "orientation": { "x": 0, "y": 0.7, "z": 0, "w": 0.71 },
    "focus": "object:chair_7"
  },
  "emotes": {
    "upperBody": { "name": "wave", "startedAt": 1710000000, "durationMs": 2000 },
    "face": { "name": "smile", "startedAt": 1710000000, "loop": true, "intensity": 0.6 }
  },
  "proximity": { "personalSpaceRadius": 1.5 },
  "permissions": {
    "canMove": true,
    "canEmote": true,
    "canInteract": true,
    "canSpeak": true,
    "canModerate": false,
    "canSpawnItems": false
  }
}
```

## State Transitions and Events

All transitions validate permissions and server rules, then emit events for downstream systems (network sync, moderation, analytics, interaction logic).

- **Spawn**
  - Preconditions: `permissions.canMove` or explicit spawn override.
  - Effects: initialize presence to spawn point; clear emotes; set default proximity.
  - Event: `avatar.spawned { avatarId, position, orientation, permissions, proximity }`

- **Move**
  - Preconditions: `canMove`; movement constraints (navmesh, bounds).
  - Effects: update `presence.position` and `presence.orientation`.
  - Event: `avatar.moved { avatarId, position, orientation, velocity?, seq }`

- **Emote**
  - Preconditions: `canEmote`; emote allowed in room.
  - Effects: set/replace entry in `emotes` map (with channel key), schedule expiry by `durationMs` if finite.
  - Event: `avatar.emote { avatarId, channel, name, startedAt, durationMs?, intensity?, loop? }`
  - Expiry Event: `avatar.emote.ended { avatarId, channel, name }` (on duration elapse or explicit cancel)

- **Focus change**
  - Preconditions: target is interactable/visible; optional `canInteract`.
  - Effects: update `presence.focus` to target handle or `null`.
  - Event: `avatar.focusChanged { avatarId, focus }`

- **Proximity change**
  - Preconditions: within server min/max.
  - Effects: update `proximity.personalSpaceRadius`.
  - Event: `avatar.proximityChanged { avatarId, personalSpaceRadius }`

- **Permission update**
  - Effects: replace `permissions` flags for the current room.
  - Event: `avatar.permissionsChanged { avatarId, permissions }`

Consumers should treat events as idempotent, ordered by `seq` or timestamp, and resilient to partial updates.

## Component Interfaces (render-agnostic)

- **Emotive**
  - `applyEmote(channel, emoteState)` — validate permission, attach to `emotes`, emit `avatar.emote`.
  - `cancelEmote(channel)` — remove channel state, emit `avatar.emote.ended`.
  - `getActiveEmotes()` — returns current `emotes` map for sync or UI.

- **Interactable**
  - `onFocusChange(avatarId, focusHandle)` — react to `avatar.focusChanged` for highlighting, tooltips, or affordances.
  - `onProximity(avatarId, distance)` — invoked when entering/exiting `personalSpaceRadius` for contextual prompts.
  - `requestInteraction(avatarId, action)` — checks `permissions.canInteract` before running interaction logic.

- **Networked**
  - `serializeAvatarState(avatarSpec)` — produce payload for transport; omit rendering data.
  - `applyRemoteUpdate(delta)` — reconcile movement/emote/focus deltas with authority rules.
  - `subscribe(listener)` — receive the events above for fan-out to clients, analytics, or moderation systems.

These interfaces keep rendering concerns separate while ensuring avatars remain authoritative, network-friendly, and interoperable across systems.
