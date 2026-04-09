// Socket event handlers for the Race game. Dispatch shape matches Janach/CAH:
// ({ io, socket, room, payload, cb, broadcast }).
//
// Server pushes `room:state` only on events (submit/fall/recover/finish/
// timeout). Clients smoothly animate between anchors via rAF extrapolation —
// no server tick.
//
// Timer management:
//   - Race-end timer (single) at room.endsAt → fires endRace("timeout").
//   - Per-player fall-recovery timer (FALL_MS) → flips fallen → running.
//   - Per-player banana-landing timer (BANANA_LAND_MS) → fires the slip on
//     the victim, then schedules their fall-recovery.
// All three kinds are pushed into room._timers (for blanket dispose). Fall
// timers are ALSO indexed by playerId in room._fallTimers, and banana
// timers in room._bananaTimers, for targeted cancellation (e.g. a banana
// arriving on someone who's already fallen → we replace the recovery
// timer). Stale-fire guards in each cb make individual cancel mostly
// optional, but explicit cleanup is cheap.

const logic = require("./logic");

function clearAllTimers(room) {
  if (room._timers) {
    for (const t of room._timers) clearTimeout(t);
  }
  room._timers = [];
  room._fallTimers = {};
  room._bananaTimers = {};
}

function clearFallTimer(room, playerId) {
  const t = room._fallTimers?.[playerId];
  if (!t) return;
  clearTimeout(t);
  delete room._fallTimers[playerId];
  if (Array.isArray(room._timers)) {
    room._timers = room._timers.filter((x) => x !== t);
  }
}

function clearBananaTimer(room, playerId) {
  const t = room._bananaTimers?.[playerId];
  if (!t) return;
  clearTimeout(t);
  delete room._bananaTimers[playerId];
  if (Array.isArray(room._timers)) {
    room._timers = room._timers.filter((x) => x !== t);
  }
}

function scheduleRaceEnd(io, room, broadcast) {
  if (!room.endsAt) return;
  const delay = Math.max(0, room.endsAt - Date.now());
  const t = setTimeout(() => {
    if (room.phase !== "racing") return;
    logic.endRace(room, "timeout");
    clearAllTimers(room);
    broadcast(io, room);
  }, delay);
  room._timers.push(t);
}

function scheduleFallRecovery(io, room, playerId, broadcast) {
  const ps = room.playerState[playerId];
  if (!ps || ps.state !== "fallen" || !ps.fallUntil) return;
  // If a previous recovery is pending (e.g. a banana extended fallUntil),
  // cancel it before scheduling the new one — otherwise it would fire
  // early and end the slip prematurely.
  clearFallTimer(room, playerId);
  const delay = Math.max(0, ps.fallUntil - Date.now());
  const t = setTimeout(() => {
    // Stale-fire guard: race may have ended, player may have left.
    if (room.phase !== "racing" || !room.playerState[playerId]) return;
    const recovered = logic.recoverFromFall(room, playerId);
    delete room._fallTimers[playerId];
    if (Array.isArray(room._timers)) {
      room._timers = room._timers.filter((x) => x !== t);
    }
    if (recovered) broadcast(io, room);
  }, delay);
  room._fallTimers[playerId] = t;
  room._timers.push(t);
}

function scheduleBananaLanding(io, room, victimId, broadcast) {
  const ps = room.playerState[victimId];
  if (!ps || !ps.incomingBananaAt) return;
  // A second peel on the same victim replaces the pending landing — the
  // 1s clock resets. Keeps state simple (one peel per lane at a time).
  clearBananaTimer(room, victimId);
  const delay = Math.max(0, ps.incomingBananaAt - Date.now());
  const t = setTimeout(() => {
    // Stale-fire guard: race may have ended, victim may have left.
    if (room.phase !== "racing" || !room.playerState[victimId]) return;
    const result = logic.applyBananaSlip(room, victimId);
    delete room._bananaTimers[victimId];
    if (Array.isArray(room._timers)) {
      room._timers = room._timers.filter((x) => x !== t);
    }
    // If the slip actually landed (victim wasn't finished/idle), schedule
    // their recovery. scheduleFallRecovery clears any stale fall timer
    // first, so this works whether they were running or already fallen.
    if (result) scheduleFallRecovery(io, room, victimId, broadcast);
    broadcast(io, room);
  }, delay);
  room._bananaTimers[victimId] = t;
  room._timers.push(t);
}

// ---------- Event handlers ----------

function startRace({ io, room, cb, broadcast }) {
  const result = logic.startRace(room);
  if (result.error) return cb?.({ error: result.error });
  scheduleRaceEnd(io, room, broadcast);
  cb?.({ ok: true });
  broadcast(io, room);
}

function playerSubmit({ io, socket, room, payload, cb, broadcast }) {
  const text = payload?.text;
  const result = logic.submitGuess(room, socket.id, text);
  if (result.error) return cb?.({ error: result.error });
  if (result.correct) {
    cb?.({
      ok: true,
      correct: true,
      finished: !!result.finished,
      points: result.points,
      position: result.position ?? null,
    });
    if (result.finished && logic.shouldEndRace(room)) {
      // "all_finished" when literally everyone crossed (small games),
      // "podium" when the top 3 filled but stragglers are still mid-track.
      const reason = logic.everyoneFinished(room) ? "all_finished" : "podium";
      logic.endRace(room, reason);
      clearAllTimers(room);
    }
    broadcast(io, room);
  } else {
    cb?.({ ok: true, correct: false });
    scheduleFallRecovery(io, room, socket.id, broadcast);
    broadcast(io, room);
  }
}

function playerThrowBanana({ io, socket, room, payload, cb, broadcast }) {
  const text = payload?.text;
  const result = logic.throwBanana(room, socket.id, text);
  if (result.error) return cb?.({ error: result.error });
  if (result.fell) {
    // Wrong text — the thrower fell, exactly like a wrong Submit.
    cb?.({ ok: true, correct: false });
    scheduleFallRecovery(io, room, socket.id, broadcast);
    broadcast(io, room);
    return;
  }
  scheduleBananaLanding(io, room, result.targetId, broadcast);
  cb?.({ ok: true, correct: true, targetId: result.targetId });
  broadcast(io, room);
}

function resetLobby({ io, room, cb, broadcast }) {
  clearAllTimers(room);
  logic.resetToLobby(room);
  cb?.({ ok: true });
  broadcast(io, room);
}

// ---------- Lifecycle hooks ----------

function dispose(room) {
  clearAllTimers(room);
}

// Host rejoin: no replay needed. The regular `room:state` broadcast that
// shared/socket-server.js sends right after the rejoin carries every lane's
// progress + progressAt, so the rejoined Host display starts extrapolating from a
// fresh anchor within one tick.
function onHostRejoin(/* { io, room, hostSocketId } */) {}

module.exports = {
  "host:startRace": startRace,
  "host:resetLobby": resetLobby,
  "player:submit": playerSubmit,
  "player:throwBanana": playerThrowBanana,
  __dispose: dispose,
  __onHostRejoin: onHostRejoin,
  __clearAllTimers: clearAllTimers,
  __clearFallTimer: clearFallTimer,
  __clearBananaTimer: clearBananaTimer,
};
