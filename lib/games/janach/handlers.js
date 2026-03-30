// Socket event handlers for Ja Nach. Same dispatch shape as CAH:
// ({ io, socket, room, payload, cb, broadcast }).
//
// Two protocols flow through here:
//
//   1. Game-state events (host:startGame, drawer:pickWord, player:guess,
//      host:nextRound, host:resetLobby) — mutate state then `broadcast`.
//
//   2. Live drawing events (drawer:stroke, drawer:clear) — these MUST NOT
//      go through `broadcast` (which sends the whole room view). They are
//      relayed directly via io.to(room.code).except(drawer) to keep the
//      wire small and the canvas responsive.

const logic = require("./logic");

// ---------- Per-socket rate limiting ----------
// The hot-path events (live strokes, guesses, replay pulls) are the only ones
// a client can fire in a tight loop, so they're the only DoS / egress-
// amplification vectors worth bounding. Each gets a token bucket keyed by
// event name, stored on socket.data so the state is garbage-collected with the
// socket — no global map to leak across rooms. Buckets refill continuously at
// `ratePerSec` up to `burst`, so a legit bursty client (e.g. a flurry of
// stroke flushes) passes while a sustained flood is throttled.
//
// Limits are sized well above realistic human/UI rates:
//   drawer:stroke        — UI flushes ≈16/s (60ms batch); 40/s leaves headroom
//   player:guess         — a fast typist sends a few/s; 4/s burst 8
//   janach:requestReplay — fired on (re)connect; replays the whole buffer, so
//                          this is the egress-amplification guard — 3/s burst 5
const RATE_LIMITS = {
  "drawer:stroke": { ratePerSec: 40, burst: 80 },
  "player:guess": { ratePerSec: 4, burst: 8 },
  "janach:requestReplay": { ratePerSec: 3, burst: 5 },
};

function allowAction(socket, event) {
  const cfg = RATE_LIMITS[event];
  if (!cfg) return true;
  const now = Date.now();
  const store = (socket.data._rl ||= {});
  let b = store[event];
  if (!b) {
    b = store[event] = { tokens: cfg.burst, ts: now };
  } else {
    const refill = ((now - b.ts) / 1000) * cfg.ratePerSec;
    b.tokens = Math.min(cfg.burst, b.tokens + refill);
    b.ts = now;
  }
  if (b.tokens < 1) {
    // #6 observability: count drops per socket and log on a throttled cadence.
    // A socket repeatedly tripping a limit is a buggy or malicious client —
    // worth a server-log breadcrumb without spamming on every dropped frame.
    const drops = (socket.data._rlDrops = (socket.data._rlDrops || 0) + 1);
    if (drops === 1 || drops % 100 === 0) {
      console.warn(
        `[janach] rate-limited ${event} from ${socket.id} (drops=${drops})`
      );
    }
    return false;
  }
  b.tokens -= 1;
  return true;
}

// ---------- Timer management ----------
// Stored on room._timers (an array of NodeJS Timeout handles). Always
// cleared on phase exit so timers from a dead round don't fire into a new
// one.

function clearTimers(room) {
  if (!room._timers) return;
  for (const t of room._timers) clearTimeout(t);
  room._timers = [];
}

// Auto-pick option 0 if the drawer dawdles past the choosing deadline.
// Without this, the drawer can stall the whole game indefinitely.
function scheduleChooseTimer(io, room, broadcast) {
  clearTimers(room);
  const endsAt = room.chooseEndsAt;
  if (!endsAt) return;
  const delay = Math.max(0, endsAt - Date.now());
  const t = setTimeout(() => {
    if (room.phase !== "choosing" || !room.wordOptions?.length) return;
    const drawerId = logic.drawerPlayerId(room);
    if (!drawerId) return;
    const result = logic.pickWord(room, drawerId, 0);
    if (result.error) return;
    scheduleRoundTimers(io, room, broadcast);
    broadcast(io, room);
  }, delay);
  room._timers.push(t);
}

function scheduleRoundTimers(io, room, broadcast) {
  clearTimers(room);
  const endsAt = room.roundEndsAt;
  if (!endsAt) return;
  // Schedule hint reveals at each HINT_AT_SECONDS threshold (remaining time)
  for (const remaining of logic.HINT_AT_SECONDS) {
    const fireAt = endsAt - remaining * 1000;
    const delay = fireAt - Date.now();
    if (delay <= 0) continue;
    const t = setTimeout(() => {
      // Guard: room may have moved on (e.g. all guessed correctly).
      if (room.phase !== "drawing") return;
      const idx = logic.revealNextLetter(room);
      if (idx >= 0) broadcast(io, room);
    }, delay);
    room._timers.push(t);
  }
  // Schedule round end on timeout.
  const endDelay = endsAt - Date.now();
  const endT = setTimeout(() => {
    if (room.phase !== "drawing") return;
    logic.endRound(room, "timeout");
    clearTimers(room);
    broadcast(io, room);
  }, Math.max(0, endDelay));
  room._timers.push(endT);
}

// ---------- Game-state handlers ----------

function startGame({ io, room, cb, broadcast }) {
  const result = logic.startGame(room);
  if (result.error) return cb?.({ error: result.error });
  scheduleChooseTimer(io, room, broadcast);
  cb?.({ ok: true });
  broadcast(io, room);
}

function pickWord({ io, socket, room, payload, cb, broadcast }) {
  const idx = Number(payload?.optionIndex);
  const result = logic.pickWord(room, socket.id, idx);
  if (result.error) return cb?.({ error: result.error });
  scheduleRoundTimers(io, room, broadcast);
  cb?.({ ok: true });
  broadcast(io, room);
}

function playerGuess({ io, socket, room, payload, cb, broadcast }) {
  if (!allowAction(socket, "player:guess"))
    return cb?.({ error: "একটু ধীরে গেস করুন" });
  const text = String(payload?.text || "");
  const result = logic.submitGuess(room, socket.id, text);
  if (result.error) return cb?.({ error: result.error });
  if (result.match) {
    cb?.({ ok: true, correct: true, points: result.points, close: result.close });
    if (result.allCorrect) {
      logic.endRound(room, "complete");
      clearTimers(room);
    }
    broadcast(io, room);
  } else {
    // Wrong guess — push the updated guessLog to everyone via the normal
    // state channel so the chat feed updates live. (We stay server-
    // authoritative here: clients render guessLog from their last view rather
    // than accumulating a side-channel event the views would have to dedupe.)
    cb?.({ ok: true, correct: false });
    broadcast(io, room);
  }
}

function nextRound({ io, room, cb, broadcast }) {
  const result = logic.nextRound(room);
  if (result.error) return cb?.({ error: result.error });
  if (room.phase === "choosing") scheduleChooseTimer(io, room, broadcast);
  else clearTimers(room);
  cb?.({ ok: true });
  broadcast(io, room);
}

function resetLobby({ io, room, cb, broadcast }) {
  clearTimers(room);
  logic.resetToLobby(room);
  cb?.({ ok: true });
  broadcast(io, room);
}

// ---------- Drawing relay handlers ----------

function drawerStroke({ io, socket, room, payload }) {
  if (logic.drawerPlayerId(room) !== socket.id) return;
  // Hot path, no ack — silently drop excess frames rather than error back.
  if (!allowAction(socket, "drawer:stroke")) return;
  // appendStroke validates/clamps every field and returns the clean stroke,
  // so we relay that — never the raw client payload.
  const stroke = logic.appendStroke(room, payload);
  if (!stroke) return;
  // Relay to everyone in the room except the drawer (drawer renders own
  // strokes locally for zero-latency feedback).
  io.to(room.code).except(socket.id).emit("janach:stroke", stroke);
}

function drawerClear({ io, socket, room }) {
  if (logic.drawerPlayerId(room) !== socket.id) return;
  if (!logic.clearStrokes(room)) return;
  io.to(room.code).except(socket.id).emit("janach:clear");
}

// Client-driven stroke replay. Any viewer (host display or a guesser) whose
// canvas mounts or reconnects mid-round emits `janach:requestReplay` to pull
// the current stroke buffer and rebuild the picture. Being client-driven, the
// requester's listener is guaranteed attached before the request goes out —
// which sidesteps the listener-readiness race in the server-pushed
// onHostRejoin path. Works for the drawer too (their local canvas is blank
// after a reload). Only meaningful during the drawing phase.
function requestReplay({ io, socket, room }) {
  // Replaying the whole stroke buffer is the heaviest single response we send,
  // so throttle it to blunt an egress-amplification flood.
  if (!allowAction(socket, "janach:requestReplay")) return;
  if (room.phase !== "drawing" || !room.strokes?.length) return;
  io.to(socket.id).emit("janach:replay", { strokes: room.strokes });
}

// ---------- Lifecycle hook ----------
// Called by shared/rooms.js when the room is being torn down so we can
// stop any lingering setTimeout handles.
function dispose(room) {
  clearTimers(room);
}

// Called by shared/socket-server.js when the host reconnects. We replay
// the current round's strokes so the Host display catches up to where the drawing
// already is — the regular room:state broadcast doesn't include strokes
// (they'd bloat every state push), so we send them one-shot here.
function onHostRejoin({ io, room, hostSocketId }) {
  if (room.phase !== "drawing" || !room.strokes?.length) return;
  io.to(hostSocketId).emit("janach:replay", { strokes: room.strokes });
}

module.exports = {
  "host:startGame": startGame,
  "host:nextRound": nextRound,
  "host:resetLobby": resetLobby,
  "drawer:pickWord": pickWord,
  "drawer:stroke": drawerStroke,
  "drawer:clear": drawerClear,
  "janach:requestReplay": requestReplay,
  "player:guess": playerGuess,
  // exported for index.js to wire as game.dispose / onHostRejoin
  __dispose: dispose,
  __onHostRejoin: onHostRejoin,
  __clearTimers: clearTimers,
  __scheduleRoundTimers: scheduleRoundTimers,
};
