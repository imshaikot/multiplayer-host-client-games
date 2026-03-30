// Pure Ja Nach (যা নাচ) game-logic functions. No socket, no broadcast.
// State mutates in place on the room object, mirroring the CAH module's style.
// Timer scheduling lives in handlers.js — logic.js just decides phase
// transitions and scoring.

const data = require("../../../data/janach_words.json");

const ALL_WORDS = data.words;
const ROUNDS_PER_PLAYER = 2;
const DRAW_SECONDS = 80;
const CHOOSE_SECONDS = 15;
const HINT_AT_SECONDS = [50, 25]; // remaining-time thresholds at which to reveal a letter
const WORD_OPTIONS_PER_TURN = 3;
const MIN_PLAYERS = 3;
const STROKES_CAP = 4000;
// Per-stroke point cap. A legit `drawer:stroke` carries only the points
// accumulated since the last 60ms flush (a handful); this bounds a malicious
// or buggy client from shipping a giant array that we'd store and fan out to
// every viewer.
const MAX_POINTS_PER_STROKE = 256;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
// A "close" hit — a fuzzy (Levenshtein-1) slip or a known-misspelling alias —
// still counts as correct but earns only this fraction of the time-based
// points (rounded down, min 1). Exact spellings and legit alternate-name
// aliases get the full amount.
const CLOSE_POINTS_FACTOR = 0.5;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawerPlayerId(room) {
  if (room.players.length === 0) return null;
  return room.players[room.drawerIndex % room.players.length]?.id ?? null;
}

// A latecomer is seated immediately (so they show up on the leaderboard at 0)
// but sits out the round they joined into — they start guessing/drawing from
// the next round. `joinedRound` is the round number that was current when they
// joined; once room.round moves past it they're a full participant.
function isSittingOut(room, player) {
  return (
    !!player &&
    player.joinedRound != null &&
    player.joinedRound >= room.round
  );
}

// Players who may guess the CURRENT round: everyone except the drawer and any
// latecomer still sitting out. Used both to score and to decide when the round
// is "complete" (everyone got it) — a sitting-out player must not block that.
function eligibleGuessers(room) {
  const drawerId = drawerPlayerId(room);
  return room.players.filter(
    (p) => p.id !== drawerId && !isSittingOut(room, p)
  );
}

// Re-derive totalRounds so every current player still gets ROUNDS_PER_PLAYER
// turns. Called whenever the roster changes mid-game (join or leave). The
// in-progress drawer is treated as already credited for the round underway,
// since endRound bumps their drawnCount when it ends.
function recomputeTotalRounds(room) {
  if (room.players.length === 0) return;
  const inProgressDrawerId =
    room.phase === "drawing" || room.phase === "choosing"
      ? drawerPlayerId(room)
      : null;
  let owed = 0;
  for (const p of room.players) {
    const drawn = (p.drawnCount || 0) + (p.id === inProgressDrawerId ? 1 : 0);
    owed += Math.max(0, ROUNDS_PER_PLAYER - drawn);
  }
  room.totalRounds = room.round + owed;
}

// Ja Nach accepts latecomers any time the game is actively running. (Not in
// gameOver — there's no "next round" to seat them for.)
function canJoinMidGame(room) {
  return room.phase !== "gameOver";
}

function refillBank(room) {
  if (room.wordBank.length < WORD_OPTIONS_PER_TURN) {
    room.wordBank = shuffle(ALL_WORDS);
  }
}

function drawWordOptions(room) {
  refillBank(room);
  return room.wordBank.splice(0, WORD_OPTIONS_PER_TURN);
}

// Lower-cased, ASCII-only normalization for guess comparison. Per memory:
// guesses are English-only, no Bengali matching.
function normalizeGuess(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40);
}

// Levenshtein distance capped at 2 (early exit) — we only care about ≤ 1.
function levCapped(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > 1) return 2;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > 1) return 2;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

function matchOne(target, guess) {
  const t = normalizeGuess(target);
  const g = normalizeGuess(guess);
  if (!t || !g) return null;
  if (t === g) return { match: true, close: false };
  // Only allow fuzzy match for words of length >= 4 — short words shouldn't
  // get free hits from typos.
  if (t.length >= 4 && levCapped(t, g) <= 1) return { match: true, close: true };
  return null;
}

// Checks the canonical word first, then aliases, then known misspellings.
//
//   aliases — legitimate alternate spellings/names too far apart for
//     Levenshtein-1 to catch (e.g. "jalebi" for "jilapi" — 3 edits away).
//     An exact alias hit is as valid as the canonical word (full points);
//     only a fuzzy alias hit is `close`.
//   typos — common spelling MISTAKES. Any hit (exact or fuzzy) is always
//     `close`, so a misspelling earns reduced points even when typed exactly.
function matchGuess(wordEntry, guess) {
  if (!wordEntry) return { match: false };
  const primary = matchOne(wordEntry.word, guess);
  if (primary) return primary;
  if (Array.isArray(wordEntry.aliases)) {
    for (const alt of wordEntry.aliases) {
      const m = matchOne(alt, guess);
      // An alias hit is reported as `close` only when it was fuzzy — an
      // exact alias match is just as legit as an exact canonical match.
      if (m) return m;
    }
  }
  if (Array.isArray(wordEntry.typos)) {
    for (const typo of wordEntry.typos) {
      // Force `close: true` regardless of how the typo itself matched — the
      // guess is a known misspelling, so it always gets reduced points.
      if (matchOne(typo, guess)) return { match: true, close: true };
    }
  }
  return { match: false };
}

function initRoom(room) {
  room.round = 0;
  room.totalRounds = 0;
  room.drawerIndex = 0;
  room.wordBank = shuffle(ALL_WORDS);
  room.currentWord = null; // { word, modifier } — secret, drawer-only
  room.wordOptions = null; // 3 options shown only to drawer during "choosing"
  room.chooseEndsAt = null; // server timestamp (ms) for "choosing" deadline
  room.chooseSeconds = CHOOSE_SECONDS;
  room.roundEndsAt = null; // server timestamp (ms) for "drawing" deadline
  room.drawSeconds = DRAW_SECONDS;
  room.revealedPositions = []; // indices of letters revealed as hints
  room.strokes = []; // accumulated strokes for late host replay (capped)
  room.correctOrder = []; // [{ playerId, points, close, atMs }] in order they got it
  room.guessLog = []; // small chat-like log of wrong guesses (capped)
  room.roundResults = null; // populated during "reveal"
  room._timers = []; // server-side timeout handles, never sent to client
}

function onPlayerJoin(room, player) {
  player.score = 0;
  player.drawnCount = 0;
  // Lobby joiners (round 0) play from the start; mid-game joiners sit out the
  // round in progress and start from the next one.
  player.joinedRound = room.phase === "lobby" ? 0 : room.round;
  // Stretch the game so the latecomer also gets their ROUNDS_PER_PLAYER turns.
  if (room.phase !== "lobby" && room.phase !== "gameOver") {
    recomputeTotalRounds(room);
  }
}

function onPlayerLeave(room, removedPlayer, removedIdx) {
  // Note: shared/rooms.js has already spliced the player out before calling
  // this hook, so room.drawerIndex still points to whoever the drawer was
  // BEFORE removal — meaning drawerIndex === removedIdx ⇒ the drawer left.
  const wasDrawer =
    (room.phase === "choosing" || room.phase === "drawing") &&
    room.drawerIndex === removedIdx;
  room.correctOrder = room.correctOrder.filter(
    (g) => g.playerId !== removedPlayer.id
  );
  if (wasDrawer && room.players.length > 0) {
    // Step the drawer index back one slot so nextRound's +1 advance lands
    // on the player who was originally next in turn order. Without this,
    // the post-splice drawerIndex already points at that next player and
    // we'd skip them.
    room.drawerIndex =
      (room.drawerIndex - 1 + room.players.length) % room.players.length;
  } else if (removedIdx < room.drawerIndex) {
    room.drawerIndex--;
  }
  if (room.players.length > 0) {
    room.drawerIndex = room.drawerIndex % room.players.length;
  }
  if (wasDrawer) {
    // End the round in place. Stale timers (hint reveal / round-end) will
    // still be pending in handlers.js but they no-op because room.phase
    // becomes "reveal" — and the next pickWord call clears them before
    // scheduling fresh ones.
    room.roundResults = {
      reason: "drawerLeft",
      word: room.currentWord,
      drawerId: removedPlayer.id,
      drawerName: removedPlayer.name,
      drawerPoints: 0,
      correctGuessers: [...room.correctOrder],
    };
    room.phase = "reveal";
    room.roundEndsAt = null;
    room.currentWord = null;
    room.wordOptions = null;
  } else if (room.phase === "drawing") {
    // A non-drawer left — if every remaining eligible guesser has already
    // correctly guessed, end the round now instead of waiting for the
    // timeout. The drawer would otherwise be left waiting with no one
    // able to guess.
    const eligibleCount = eligibleGuessers(room).length;
    if (eligibleCount > 0 && room.correctOrder.length >= eligibleCount) {
      endRound(room, "complete");
      if (Array.isArray(room._timers)) {
        for (const t of room._timers) clearTimeout(t);
        room._timers = [];
      }
    }
  }
  // Recompute totalRounds so each remaining player still gets
  // ROUNDS_PER_PLAYER turns.
  recomputeTotalRounds(room);
  return { drawerLeft: wasDrawer };
}

function resetToLobby(room) {
  room.phase = "lobby";
  initRoom(room);
  for (const p of room.players) {
    p.score = 0;
    p.drawnCount = 0;
    p.joinedRound = 0;
  }
}

function startGame(room) {
  if (room.phase !== "lobby") return { error: "ইতিমধ্যে শুরু হয়েছে" };
  if (room.players.length < MIN_PLAYERS)
    return { error: `মিনিমাম ${MIN_PLAYERS} জন প্লেয়ার লাগবে` };
  room.totalRounds = ROUNDS_PER_PLAYER * room.players.length;
  room.drawerIndex = Math.floor(Math.random() * room.players.length);
  room.round = 0;
  return startChoosing(room);
}

// Advance to the next drawer's turn-pick phase. Called from startGame and
// nextRound.
function startChoosing(room) {
  room.round += 1;
  if (room.round > room.totalRounds) {
    room.phase = "gameOver";
    room.currentWord = null;
    room.wordOptions = null;
    room.roundEndsAt = null;
    room.chooseEndsAt = null;
    room.revealedPositions = [];
    room.strokes = [];
    room.correctOrder = [];
    room.guessLog = [];
    return { room };
  }
  room.phase = "choosing";
  room.wordOptions = drawWordOptions(room);
  room.currentWord = null;
  room.roundEndsAt = null;
  room.chooseEndsAt = Date.now() + room.chooseSeconds * 1000;
  room.revealedPositions = [];
  room.strokes = [];
  room.correctOrder = [];
  room.guessLog = [];
  room.roundResults = null;
  return { room };
}

// Drawer picks one of the 3 word options to draw. Transitions to "drawing"
// phase. The caller (handlers.js) schedules timers based on
// room.roundEndsAt.
function pickWord(room, drawerSocketId, optionIndex) {
  if (room.phase !== "choosing") return { error: "এখন শব্দ বাছা যাবে না" };
  if (drawerPlayerId(room) !== drawerSocketId)
    return { error: "শুধু আঁকিয়ে শব্দ বাছবেন" };
  if (!room.wordOptions || !room.wordOptions[optionIndex])
    return { error: "ভুল অপশন" };
  room.currentWord = room.wordOptions[optionIndex];
  room.wordOptions = null;
  room.phase = "drawing";
  room.chooseEndsAt = null;
  room.roundEndsAt = Date.now() + room.drawSeconds * 1000;
  room.revealedPositions = [];
  return { room };
}

// Called by the timer scheduled in handlers.js. Returns the next index to
// reveal, or -1 if no more letters can/should be revealed.
function revealNextLetter(room) {
  if (room.phase !== "drawing" || !room.currentWord) return -1;
  const target = normalizeGuess(room.currentWord.word);
  const total = target.length;
  // Reveal at most floor(total / 2) - 1 letters so the word stays
  // partially obscured even at the end.
  const cap = Math.max(0, Math.floor(total / 2) - 1);
  if (room.revealedPositions.length >= cap) return -1;
  const remaining = [];
  for (let i = 0; i < total; i++) {
    if (!room.revealedPositions.includes(i)) remaining.push(i);
  }
  if (remaining.length === 0) return -1;
  const pick = remaining[Math.floor(Math.random() * remaining.length)];
  room.revealedPositions.push(pick);
  return pick;
}

// Player submits a guess. Returns:
//   { error } -> bad request (e.g. drawer guessing)
//   { match: false, broadcast?: { playerName, text } } -> wrong, OK to show
//   { match: true, close, points, allCorrect } -> right
function submitGuess(room, socketId, text) {
  if (room.phase !== "drawing") return { error: "এখন গেস করা যাবে না" };
  const drawerId = drawerPlayerId(room);
  if (drawerId === socketId) return { error: "আঁকিয়ে গেস করতে পারবেন না" };
  const player = room.players.find((p) => p.id === socketId);
  if (!player) return { error: "প্লেয়ার পাওয়া যায়নি" };
  if (isSittingOut(room, player))
    return { error: "পরের রাউন্ড থেকে খেলতে পারবেন" };
  if (room.correctOrder.some((g) => g.playerId === socketId))
    return { error: "ইতিমধ্যে সঠিক গেস করেছেন" };
  const result = matchGuess(room.currentWord, text);
  if (!result.match) {
    const entry = {
      playerId: socketId,
      playerName: player.name,
      text: String(text || "").slice(0, 40),
      ts: Date.now(),
    };
    room.guessLog.push(entry);
    if (room.guessLog.length > 30) room.guessLog.shift();
    return { match: false, broadcast: entry };
  }
  const remainingMs = Math.max(0, (room.roundEndsAt || 0) - Date.now());
  const remainingSeconds = remainingMs / 1000;
  let points = Math.max(1, Math.floor(remainingSeconds * 1.5));
  // A close hit (fuzzy slip or known misspelling) earns only a fraction.
  if (result.close) points = Math.max(1, Math.floor(points * CLOSE_POINTS_FACTOR));
  room.correctOrder.push({
    playerId: socketId,
    playerName: player.name,
    points,
    close: !!result.close,
    atMs: Date.now(),
  });
  player.score += points;
  const eligibleCount = eligibleGuessers(room).length;
  const allCorrect = room.correctOrder.length >= eligibleCount;
  return { match: true, close: !!result.close, points, allCorrect };
}

// End the active drawing round. Triggered either by timeout, by everyone
// guessing correctly, or by the drawer leaving. Returns the populated
// roundResults object for convenience.
function endRound(room, reason) {
  if (room.phase !== "drawing" && room.phase !== "choosing") return null;
  const drawerId = drawerPlayerId(room);
  const drawer = room.players.find((p) => p.id === drawerId);
  // Drawer gets average of correct guessers' points (rounded down). If no
  // one got it, drawer gets 0.
  let drawerPoints = 0;
  if (room.correctOrder.length > 0) {
    const sum = room.correctOrder.reduce((a, g) => a + g.points, 0);
    drawerPoints = Math.floor(sum / room.correctOrder.length);
    if (drawer) drawer.score += drawerPoints;
  }
  if (drawer) drawer.drawnCount = (drawer.drawnCount || 0) + 1;
  room.roundResults = {
    reason: reason || "timeout",
    word: room.currentWord, // { word, modifier }
    drawerId,
    drawerName: drawer?.name ?? null,
    drawerPoints,
    correctGuessers: [...room.correctOrder],
  };
  room.phase = "reveal";
  room.roundEndsAt = null;
  return room.roundResults;
}

// Called when the host hits "next round" from the reveal screen.
function nextRound(room) {
  if (room.phase !== "reveal") return { error: "এই মুহূর্তে নেক্সট রাউন্ড না" };
  if (room.players.length > 0) {
    room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
  }
  return startChoosing(room);
}

// Sanitize an incoming points array: drop anything non-numeric, clamp coords
// into the normalized [0..1] wire space, and cap the count. Returns a fresh
// array (never the caller's) so stored/relayed strokes can't be mutated from
// outside.
function sanitizePoints(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    out.push({ x: clamp01(p.x), y: clamp01(p.y) });
    if (out.length >= MAX_POINTS_PER_STROKE) break;
  }
  return out;
}

// Stroke handling — append-only with a hard cap so a long round can't blow
// up memory. When capped, oldest strokes are dropped (the host will miss
// the start of the drawing on a late reconnect, which is acceptable).
//
// Every field is validated/clamped here so the relay (handlers.js) can forward
// the returned object verbatim — clients never see unsanitized wire data.
// Returns the clean stroke on success, or null if the payload was unusable
// (wrong phase, no valid points).
function appendStroke(room, payload) {
  if (room.phase !== "drawing") return null;
  const points = sanitizePoints(payload?.points);
  if (points.length === 0) return null;
  let size = Number(payload?.size);
  if (!Number.isFinite(size)) size = 6;
  size = Math.max(1, Math.min(64, size));
  const stroke = {
    id: String(payload?.id || "").slice(0, 32),
    points,
    color: HEX_COLOR.test(payload?.color) ? payload.color : "#000000",
    size,
    end: !!payload?.end,
  };
  room.strokes.push(stroke);
  if (room.strokes.length > STROKES_CAP) {
    room.strokes.splice(0, room.strokes.length - STROKES_CAP);
  }
  return stroke;
}

function clearStrokes(room) {
  if (room.phase !== "drawing") return false;
  room.strokes = [];
  return true;
}

module.exports = {
  // constants
  DRAW_SECONDS,
  HINT_AT_SECONDS,
  // lifecycle
  initRoom,
  onPlayerJoin,
  onPlayerLeave,
  resetToLobby,
  canJoinMidGame,
  // turn flow
  startGame,
  startChoosing,
  pickWord,
  endRound,
  nextRound,
  // round mechanics
  submitGuess,
  revealNextLetter,
  // drawing
  appendStroke,
  clearStrokes,
  // helpers exposed for views
  drawerPlayerId,
  normalizeGuess,
  isSittingOut,
};
