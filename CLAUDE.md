# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**ভবের খেলাঘর** — a Bengali party-game hub played in a room together. One screen acts as the **Host display** and each player joins from their **phone**. Real-time gameplay over Socket.IO. UI strings and content are largely in Bengali (`lang="bn"`).

Currently ships three games:

| Internal id | Display name             | What it is                                               |
| ----------- | ------------------------ | -------------------------------------------------------- |
| `cah`       | পবিত্র কার্ড            | Cards Against Humanity, adapted to Bangladeshi humor     |
| `janach`    | আঁকো                    | Skribbl-style draw-and-guess (English-only guesses)      |
| `race`      | আঙুলের দৌড়            | 12-lane vertical typing race on Banglish prompts         |

## Commands

- `npm run dev` — start the dev server (`node server.js`, custom server, port 3000). Do NOT use `next dev`; it bypasses the Socket.IO server and the games don't work.
- `npm run build` — `next build`
- `npm run start` — production (`NODE_ENV=production node server.js`)
- `npm run lint` — `next lint`

No test framework is configured.

## Architecture

Next.js 14 (App Router) with a **custom Node server** (`server.js`) that wraps Next and attaches a Socket.IO server to the same HTTP server. All real-time game logic is server-authoritative; the Next pages are thin clients that emit/receive socket events.

### Hub vs games

The project is a **multi-game hub**, not a single game. Shared infrastructure (the rooms map, code generation, host/player connection lifecycle) lives in `lib/shared/`. Each game is a self-contained module under `lib/games/<id>/` registered in `lib/games/index.js`. Adding a new game does **not** require touching the shared infra — wire it into the registry and add per-game view components.

### Shared server infrastructure (`lib/shared/`)

- `rooms.js` — owns the in-memory `Map<code, Room>`. Generates room codes (4-char `nanoid` with ambiguous chars excluded — no `O`, `I`, `0`, `1`). Tracks player identity by `socket.id`. Provides `createRoom`, `joinRoom`, `removePlayerFromAllRooms`, `clearHostFromRooms`, and the critical `broadcast(io, room)` that sends `room:state` (public view) to the host and a personalized `player:state` to each player. **No game-specific code lives here** — `broadcast` delegates to the active game's `publicView` / `playerView`.
- `socket-server.js` — connection handler. Owns the small set of game-agnostic events (`host:create`, `host:rejoin`, `player:join`, `disconnect`) and dispatches everything else via `socket.onAny` to the active game's `handlers` map based on `room.gameType`. **No game-specific code lives here either.**

There is no database — rooms vanish on process restart.

### Per-game module shape (`lib/games/<id>/`)

Every game exports the same shape via its `index.js`:

```js
{
  id, displayName, minPlayers, maxPlayers,
  init,            // (room) — initialize game-specific state on a fresh room
  reset,           // (room) — back to lobby
  dispose,         // (room) — tear down timers, etc.
  onHostRejoin,    // ({ io, room, hostSocketId }) — optional replay
  publicView,      // (room) -> object — what the Host display sees
  playerView,      // (room, socketId) -> object — what one phone sees
  onPlayerJoin,    // (room, player)
  onPlayerLeave,   // (room, removedPlayer, removedIdx)
  handlers,        // { [eventName]: ({ io, socket, room, payload, cb, broadcast }) => void }
}
```

Internally each game splits the work across:

- `logic.js` — pure state-mutation functions (no socket, no broadcast). Mutates `room` in place.
- `handlers.js` — socket event handlers. Owns timer management via `room._timers`. Exports the handlers map plus underscore-prefixed lifecycle hooks (`__dispose`, `__onHostRejoin`, ...) that `index.js` pulls out so they don't get auto-dispatched as socket events.
- `views.js` — `publicView` / `playerView` builders. **The publicView MUST NOT leak anything secret** (drawer's word in Janach; player's current prompt in Race; player's hand in CAH).
- `index.js` — assembles the module-shape object above.

Cards / prompts / word banks live in `data/*.json` and are loaded once at startup.

### Client (two views, one socket)

- `app/page.tsx` — hub landing. Has a `GAMES` tile array; clicking a tile fires `socket.emit("host:create", { gameType }, cb)`. Players join via `player:join { code, name }` from the same page.
- `app/host/[code]/page.tsx` — Host view. Listens to `room:state`. Dispatches to a per-game `<GameHostView>` component based on `state.gameType`. Adding a game = add an import + a third dispatch branch.
- `app/play/[code]/page.tsx` — phone view. Listens to `player:state`. Dispatches similarly to a per-game `<GamePlayView>` component.
- `app/host/[code]/<Game>HostView.tsx` and `app/play/[code]/<Game>PlayView.tsx` — per-game view components. Host views share helpers from `app/host/[code]/hostUiShared.tsx` (`Avatar`, `RoomCornerChip`, `bn` for Bengali numerals).
- `hooks/useSocket.ts` — wraps `socket.io-client` as a singleton. The same socket persists across route changes.
- `lib/audio.ts` — WebAudio synth (`tick`, `ding`, `gong`, `fanfare`) — no audio files.

### Game flow & socket protocol

After every state change, the server calls `broadcast(io, room)`, which sends `room:state` (public view) to the host socket and a personalized `player:state` (with private data like a player's hand or current prompt) to each player socket. **Clients are stateless beyond their last received view — never derive game truth on the client.**

Phases vary per game:

- **CAH**: `lobby → submitting → judging → reveal → (back to submitting | gameOver)`
- **Janach**: `lobby → choosing → drawing → reveal → (next round | gameOver)`
- **Race**: `lobby → racing → finished` (single 120s sprint, no rounds)

Shared lifecycle events: `host:create`, `host:rejoin`, `player:join`. Per-game events live in each `handlers.js`. All accept Socket.IO ack callbacks shaped as `{ ok?, error?, ...}`.

Race uses **client-side rAF interpolation** instead of server ticks: the server only broadcasts on submit / fall / finish / timeout, and the Host display extrapolates `progress + baselineRate * (now - progressAt)` per frame for smooth motion. Janach uses a similar event-only model for guesses, with strokes relayed on a direct channel (`janach:stroke`, `janach:clear`) outside the normal `broadcast` flow.

### Conventions worth knowing

- **Player identity = `socket.id`.** Disconnect removes the player from the room; there's no rejoin-by-name. A reload mid-game loses the seat. (Stable identity is out of scope for all three games.)
- Room codes are 4-char from `nanoid` with a custom alphabet (no `O`, `I`, `0`, `1`). Always uppercased on lookup.
- Players cap at 12; join only allowed in `lobby` phase. Min players: CAH 3, Janach 3, Race 2.
- TS path alias `@/*` maps to repo root (see `tsconfig.json`).
- All user-facing strings are in Bengali (or Banglish, for Race prompts) — preserve that when editing UI, and keep server-side error strings in Bengali to match what the client renders verbatim.
- Race input is **strict, case-sensitive** equality (server trims only trailing whitespace). Mobile keyboard `autoCapitalize="off"` and `autoCorrect="off"` are non-negotiable on the play side.
