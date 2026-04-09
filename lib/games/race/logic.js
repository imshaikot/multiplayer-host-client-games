// Pure Race game-logic functions. No socket, no broadcast.
// State mutates in place on the room object, mirroring janach/logic.js style.
// Timer scheduling lives in handlers.js — logic.js just decides phase
// transitions and progress math.

const data = require("../../../data/race_prompts.json");
const {
  TRACK_LENGTH,
  RACE_SECONDS,
  BASELINE_RATE,
  FALL_MS,
  COUNTDOWN_MS,
  MIN_PLAYERS,
  MAX_PLAYERS,
} = require("./scoring");

// Banana-peel sabotage tunables. The thrower sacrifices their points: a
// correct submission that goes through the banana button advances nobody but
// rotates the thrower's prompt (same cost as a wrong answer in time, but
// without the fall). The peel takes BANANA_LAND_MS to land, then the victim
// slips for SLIP_BASE_MS + SLIP_PER_POINT_MS * (their currentPrompt.score) —
// punishing a leader more when they're mid-juicy-prompt.
const BANANA_LAND_MS = 1000;
const SLIP_BASE_MS = 1000;
const SLIP_PER_POINT_MS = 150;
const SLIP_FALLBACK_MS = 1500;
// How far ahead of the runner the peel visually drops (track units). The
// runner naturally walks into it during BANANA_LAND_MS — at BASELINE_RATE
// (≈0.83 u/s) they cover ~0.83 units in 1s, so 2 units lands the peel just
// a step ahead.
const BANANA_DROP_OFFSET = 2;
// Photo-finish window. Submits are processed one at a time server-side, so
// two players can never *truly* cross simultaneously — but anyone who
// crosses within this window of the previous finisher counts as a tie and
// shares their position (joint 1st, joint 2nd, …).
const FINISH_TIE_MS = 400;

const ALL_PROMPTS = data.prompts;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function refillPool(room) {
  if (room.promptPool.length < 4) {
    room.promptPool = shuffle(ALL_PROMPTS);
  }
}

// Pop one prompt, avoiding back-to-back duplicates for this player (one re-roll
// only — if the next one also matches, just accept it).
function drawPrompt(room, playerId) {
  refillPool(room);
  const ps = room.playerState[playerId];
  const lastText = ps?.currentPrompt?.text || null;
  let next = room.promptPool.shift();
  if (next && lastText && next.text === lastText && room.promptPool.length > 0) {
    const alt = room.promptPool.shift();
    // Put the duplicate back at the end so we don't lose it from the pool.
    room.promptPool.push(next);
    next = alt;
  }
  return next || null;
}

function makePlayerState() {
  return {
    progress: 0,
    progressAt: 0,
    state: "idle", // "idle" | "running" | "fallen" | "finished"
    fallUntil: null,
    currentPrompt: null,
    correctCount: 0,
    fallCount: 0,
    finishedAt: null,
    finishPosition: null,
    // Banana-peel sabotage: a thrown peel by another player is held here
    // until BANANA_LAND_MS elapses, at which point applyBananaSlip flips
    // state→fallen. incomingBananaProgress is the *fixed* track position
    // where the peel sits — the Host display renders it there while the runner
    // walks into it. bananaFromId is who threw it (for UI flavor).
    incomingBananaAt: null,
    incomingBananaProgress: null,
    bananaFromId: null,
  };
}

function initRoom(room) {
  room.phase = "lobby";
  room.startedAt = null;
  room.endsAt = null;
  room.trackLength = TRACK_LENGTH;
  room.baselineRate = BASELINE_RATE;
  room.raceSeconds = RACE_SECONDS;
  room.promptPool = shuffle(ALL_PROMPTS);
  room.playerState = {};
  room.finishOrder = [];
  room._timers = [];
  room._fallTimers = {};
  room._bananaTimers = {};
  // playerState entries for any pre-existing players (resetToLobby path).
  for (const p of room.players || []) {
    room.playerState[p.id] = makePlayerState();
  }
}

function onPlayerJoin(room, player) {
  room.playerState[player.id] = makePlayerState();
}

// Note: shared/rooms.js has already spliced the player out of room.players
// before calling this hook. Clean up their lane state, drop them from
// finishOrder if they were there. Race continues regardless of who left
// (even if the last unfinished player leaves, the race-end timer at 120s
// terminates it naturally — keeping handlers.js out of this lifecycle).
function onPlayerLeave(room, removedPlayer /*, removedIdx */) {
  delete room.playerState[removedPlayer.id];
  if (Array.isArray(room.finishOrder)) {
    room.finishOrder = room.finishOrder.filter(
      (f) => f.playerId !== removedPlayer.id
    );
  }
  // If the leaver had thrown a peel at someone, scrub the credit so the
  // victim doesn't show a phantom thrower name in their warning banner.
  // The pending peel itself stays — fair game, it's already in flight.
  for (const ps of Object.values(room.playerState)) {
    if (ps && ps.bananaFromId === removedPlayer.id) {
      ps.bananaFromId = null;
    }
  }
}

function resetToLobby(room) {
  initRoom(room);
}

// Server-side mirror of the client's extrapolation. Used both to decide
// finish-line crossing at submit time and to freeze running players' positions
// when the race ends mid-stride.
function currentExtrapolated(room, playerId, now) {
  const ps = room.playerState[playerId];
  if (!ps) return 0;
  if (ps.state === "finished") return room.trackLength;
  if (ps.state === "fallen") return ps.progress;
  if (ps.state === "running") {
    const elapsed = Math.max(0, now - ps.progressAt) / 1000;
    return Math.min(room.trackLength, ps.progress + room.baselineRate * elapsed);
  }
  return ps.progress; // idle
}

function startRace(room) {
  if (room.phase !== "lobby") return { error: "ইতিমধ্যে শুরু হয়েছে" };
  if (room.players.length < MIN_PLAYERS) {
    return { error: `মিনিমাম ${MIN_PLAYERS} জন প্লেয়ার লাগবে` };
  }
  // Push startedAt COUNTDOWN_MS into the future so currentExtrapolated
  // (which clamps elapsed to >= 0) holds every runner at progress 0 during
  // the 3-2-1 overlay. Clients detect the countdown by comparing
  // startedAt vs Date.now(). The race-end timer is scheduled from endsAt,
  // which is also pushed by COUNTDOWN_MS — so the full RACE_SECONDS are
  // preserved after "GO!".
  const startsAt = Date.now() + COUNTDOWN_MS;
  room.phase = "racing";
  room.startedAt = startsAt;
  room.endsAt = startsAt + RACE_SECONDS * 1000;
  room.finishOrder = [];
  for (const p of room.players) {
    const ps = room.playerState[p.id] || makePlayerState();
    ps.progress = 0;
    ps.progressAt = startsAt;
    ps.state = "running";
    ps.fallUntil = null;
    ps.currentPrompt = drawPrompt(room, p.id);
    ps.correctCount = 0;
    ps.fallCount = 0;
    ps.finishedAt = null;
    ps.finishPosition = null;
    ps.incomingBananaAt = null;
    ps.incomingBananaProgress = null;
    ps.bananaFromId = null;
    room.playerState[p.id] = ps;
  }
  return { ok: true };
}

// Adjacent-lane (idx ± 1) targets with state in {running, fallen}. Pick the
// one with higher extrapolated progress; random on ties. Returns null if no
// neighbor is on the track. Exposed for views so the play UI can disable the
// banana button when no target exists.
function findBananaTarget(room, throwerId, now = Date.now()) {
  const idx = room.players.findIndex((p) => p.id === throwerId);
  if (idx < 0) return null;
  const candidates = [];
  for (const di of [-1, 1]) {
    const neighbor = room.players[idx + di];
    if (!neighbor) continue;
    const ps = room.playerState[neighbor.id];
    if (!ps) continue;
    if (ps.state !== "running" && ps.state !== "fallen") continue;
    candidates.push({
      player: neighbor,
      ext: currentExtrapolated(room, neighbor.id, now),
    });
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].player;
  if (candidates[0].ext === candidates[1].ext) {
    return candidates[Math.random() < 0.5 ? 0 : 1].player;
  }
  return candidates[0].ext > candidates[1].ext
    ? candidates[0].player
    : candidates[1].player;
}

// Throw a banana peel. Pressing banana is a commitment exactly like Submit:
// with CORRECT text it "spends" the prompt to drop a peel on a neighbor (the
// thrower gets no progress, just a rotated prompt); with WRONG text the
// thrower falls, same as a wrong Submit. This symmetry is the whole point —
// the banana button must not be a free "is my answer right?" probe, so its
// enabled state and pressing it both cost the same as Submit.
// Returns { fell: true } on wrong text, { ok, targetId } on a landed throw.
function throwBanana(room, throwerId, rawText) {
  if (room.phase !== "racing") return { error: "এখন রেস চলছে না" };
  if (room.startedAt && Date.now() < room.startedAt) {
    return { error: "শুরু হয়নি" };
  }
  const ps = room.playerState[throwerId];
  if (!ps) return { error: "প্লেয়ার পাওয়া যায়নি" };
  if (ps.state !== "running") return { error: "এখন ছুড়তে পারবেন না" };
  if (!ps.currentPrompt) return { error: "প্রম্পট নেই" };
  const text = String(rawText ?? "").replace(/\s+$/, "");
  if (text !== ps.currentPrompt.text) {
    applyWrongAnswerFall(room, throwerId);
    return { fell: true };
  }

  const now = Date.now();
  const target = findBananaTarget(room, throwerId, now);
  if (!target) return { error: "কাছাকাছি কেউ নেই" };

  const targetPs = room.playerState[target.id];
  const dropAt = Math.min(
    room.trackLength,
    currentExtrapolated(room, target.id, now) + BANANA_DROP_OFFSET
  );
  // Override any pending banana on this target — second peel resets the
  // landing clock rather than queuing. Keeps the timer story simple.
  targetPs.incomingBananaAt = now + BANANA_LAND_MS;
  targetPs.incomingBananaProgress = dropAt;
  targetPs.bananaFromId = throwerId;

  // Thrower: rotate prompt, stay running. No progress gain.
  ps.currentPrompt = drawPrompt(room, throwerId);

  return { ok: true, targetId: target.id };
}

// Called by the banana-landing timer scheduled in handlers.js. Flips the
// victim to fallen with a slip duration scaled by the difficulty of the
// prompt they're currently staring at. Stacks with an in-progress fall by
// extending fallUntil.
function applyBananaSlip(room, victimId) {
  if (room.phase !== "racing") return null;
  const ps = room.playerState[victimId];
  if (!ps) return null;
  // Always clear the incoming marker — even if the slip is a no-op (victim
  // finished in the 1s window), the Host display should stop rendering the peel.
  ps.incomingBananaAt = null;
  ps.incomingBananaProgress = null;
  ps.bananaFromId = null;
  if (ps.state === "finished") return null;

  const now = Date.now();
  const score = ps.currentPrompt?.score ?? 0;
  const slipMs =
    score > 0 ? SLIP_BASE_MS + SLIP_PER_POINT_MS * score : SLIP_FALLBACK_MS;

  if (ps.state === "running") {
    ps.progress = currentExtrapolated(room, victimId, now);
    ps.progressAt = now;
    ps.state = "fallen";
    ps.fallUntil = now + slipMs;
  } else if (ps.state === "fallen") {
    // Already slipping — stack the penalty by extending fallUntil.
    ps.fallUntil = Math.max(ps.fallUntil ?? now, now) + slipMs;
  }
  ps.fallCount += 1;
  return { slipMs };
}

// Player falls after a wrong commitment — a wrong Submit OR a wrong banana
// throw. Freeze where they were, tip over for FALL_MS, and rotate to a fresh
// prompt (players don't dwell on hard prompts; a new one slides in
// automatically — input stays disabled until recoverFromFall flips state
// back to "running"). Sharing this between submit and banana is deliberate:
// pressing banana must cost exactly as much as Submit on a wrong answer, so
// the button can't be used as a consequence-free correctness oracle.
function applyWrongAnswerFall(room, playerId) {
  const ps = room.playerState[playerId];
  const now = Date.now();
  ps.progress = currentExtrapolated(room, playerId, now);
  ps.progressAt = now;
  ps.state = "fallen";
  ps.fallUntil = now + FALL_MS;
  ps.fallCount += 1;
  ps.currentPrompt = drawPrompt(room, playerId);
}

// Strict, case-sensitive equality after trimming ONLY trailing whitespace
// (mobile keyboards sometimes auto-append a space; without this small forgiveness
// the input is unusably brittle). The body of the text is compared exactly.
function submitGuess(room, playerId, rawText) {
  if (room.phase !== "racing") return { error: "এখন রেস চলছে না" };
  if (room.startedAt && Date.now() < room.startedAt) {
    return { error: "শুরু হয়নি" };
  }
  const ps = room.playerState[playerId];
  if (!ps) return { error: "প্লেয়ার পাওয়া যায়নি" };
  if (ps.state === "finished") return { error: "আপনি ইতিমধ্যে শেষ করেছেন" };
  if (ps.state === "fallen") return { error: "পড়ে গেছেন, একটু অপেক্ষা করুন" };
  if (!ps.currentPrompt) return { error: "প্রম্পট নেই" };
  const text = String(rawText ?? "").replace(/\s+$/, "");
  if (!text) return { error: "কিছু লিখুন" };

  const now = Date.now();
  const target = ps.currentPrompt.text;
  if (text === target) {
    const points = ps.currentPrompt.score;
    const ext = currentExtrapolated(room, playerId, now);
    const newProgress = ext + points;
    ps.correctCount += 1;
    if (newProgress >= room.trackLength) {
      ps.progress = room.trackLength;
      ps.progressAt = now;
      ps.state = "finished";
      ps.currentPrompt = null;
      ps.finishedAt = now;
      // Photo-finish: crossing within FINISH_TIE_MS of the previous finisher
      // shares their position ("touched the line together"). Otherwise it's
      // competition ranking — a tie still consumes a slot, so the next
      // distinct finisher is finishOrder.length + 1 (e.g. 1, 1, 3).
      const last = room.finishOrder[room.finishOrder.length - 1];
      const tied =
        last &&
        last.finishedAt != null &&
        now - last.finishedAt <= FINISH_TIE_MS;
      ps.finishPosition = tied ? last.position : room.finishOrder.length + 1;
      const player = room.players.find((p) => p.id === playerId);
      room.finishOrder.push({
        playerId,
        name: player?.name ?? "?",
        finishedAt: now,
        position: ps.finishPosition,
      });
      return {
        correct: true,
        finished: true,
        points,
        position: ps.finishPosition,
      };
    }
    ps.progress = newProgress;
    ps.progressAt = now;
    ps.state = "running";
    ps.currentPrompt = drawPrompt(room, playerId);
    return { correct: true, finished: false, points };
  }

  // Wrong — fall (identical penalty to a wrong banana throw).
  applyWrongAnswerFall(room, playerId);
  return { correct: false };
}

// Called by the per-player fall-recovery timer scheduled in handlers.js.
// Guards against stale fires (phase changed, player gone, no longer fallen).
function recoverFromFall(room, playerId) {
  if (room.phase !== "racing") return false;
  const ps = room.playerState[playerId];
  if (!ps || ps.state !== "fallen") return false;
  ps.state = "running";
  ps.progressAt = Date.now();
  ps.fallUntil = null;
  return true;
}

// True if every still-present player is finished. Caller is responsible for
// not invoking this before phase === "racing".
function everyoneFinished(room) {
  if (room.players.length === 0) return false;
  return room.players.every(
    (p) => room.playerState[p.id]?.state === "finished"
  );
}

// True when the race should end early (i.e. before the 120s hard cap). The
// 120s is a *maximum* — once the podium is settled, dragging out the rest
// of the time is just dead air. Rule:
//   - 1-player edge:   end when that one finishes.
//   - 2-player game:   end when both finish (no "podium" — there is no 3rd).
//   - 3+ player game:  end as soon as 3 racers cross the line; 4th onwards
//                      get ranked by their frozen progress in endRace().
function shouldEndRace(room) {
  if (room.players.length === 0) return false;
  let finishCount = 0;
  for (const p of room.players) {
    if (room.playerState[p.id]?.state === "finished") finishCount += 1;
  }
  const target = Math.min(3, room.players.length);
  return finishCount >= target;
}

// End the race. Freezes mid-stride players' progress, fills out finishOrder
// for non-finishers sorted by extrapolated progress desc, ties broken by
// correctCount. Nulls everyone's currentPrompt.
function endRace(room, reason) {
  if (room.phase !== "racing") return null;
  const now = Date.now();
  for (const p of room.players) {
    const ps = room.playerState[p.id];
    if (!ps) continue;
    if (ps.state === "running" || ps.state === "fallen") {
      ps.progress = currentExtrapolated(room, p.id, now);
      ps.progressAt = now;
      ps.fallUntil = null;
    }
    ps.currentPrompt = null;
    ps.incomingBananaAt = null;
    ps.incomingBananaProgress = null;
    ps.bananaFromId = null;
  }
  // Non-finishers ranked by progress desc, tiebreaker: more correct prompts first.
  const nonFinishers = room.players
    .filter((p) => room.playerState[p.id]?.state !== "finished")
    .map((p) => ({ player: p, ps: room.playerState[p.id] }))
    .sort((a, b) => {
      if (b.ps.progress !== a.ps.progress)
        return b.ps.progress - a.ps.progress;
      return b.ps.correctCount - a.ps.correctCount;
    });
  for (const { player, ps } of nonFinishers) {
    ps.finishPosition = room.finishOrder.length + 1;
    room.finishOrder.push({
      playerId: player.id,
      name: player.name,
      finishedAt: null,
      position: ps.finishPosition,
    });
  }
  room.phase = "finished";
  room.endReason = reason || "timeout";
  return { reason: room.endReason };
}

module.exports = {
  // constants
  TRACK_LENGTH,
  RACE_SECONDS,
  BASELINE_RATE,
  FALL_MS,
  BANANA_LAND_MS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  // lifecycle
  initRoom,
  onPlayerJoin,
  onPlayerLeave,
  resetToLobby,
  // race flow
  startRace,
  submitGuess,
  recoverFromFall,
  everyoneFinished,
  shouldEndRace,
  endRace,
  throwBanana,
  applyBananaSlip,
  // helpers exposed for views / handlers
  currentExtrapolated,
  findBananaTarget,
};
