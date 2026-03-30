// Ja Nach view builders. Critical: the secret word is NEVER sent in the
// public view, and only sent in full to the drawer. Guessers receive a
// masked version showing only revealed letters.

const { drawerPlayerId, normalizeGuess, isSittingOut } = require("./logic");

// "octopus" with revealedPositions=[0,4] -> "o _ _ _ p _ _"
function maskWord(word, revealedPositions) {
  if (!word) return "";
  const target = normalizeGuess(word);
  const set = new Set(revealedPositions || []);
  const out = [];
  for (let i = 0; i < target.length; i++) {
    out.push(set.has(i) ? target[i] : "_");
  }
  return out.join(" ");
}

function publicGuessersView(room) {
  return room.correctOrder.map((g) => ({
    playerId: g.playerId,
    playerName: g.playerName,
    points: g.points,
    close: g.close,
  }));
}

function publicRoomState(room) {
  const drawerId = drawerPlayerId(room);
  return {
    gameType: "janach",
    code: room.code,
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    drawerId,
    drawSeconds: room.drawSeconds,
    chooseSeconds: room.chooseSeconds,
    chooseEndsAt: room.chooseEndsAt,
    roundEndsAt: room.roundEndsAt,
    // During "drawing": masked word with hints. Otherwise: empty.
    // During "reveal": the full word is exposed in roundResults instead.
    wordMask:
      room.phase === "drawing" && room.currentWord
        ? maskWord(room.currentWord.word, room.revealedPositions)
        : "",
    wordLength:
      room.phase === "drawing" && room.currentWord
        ? normalizeGuess(room.currentWord.word).length
        : 0,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
    })),
    correctGuessers: publicGuessersView(room),
    guessLog: room.guessLog.slice(-10), // last 10 wrong guesses for chat-style display
    roundResults: room.roundResults, // null unless phase === "reveal"
  };
}

function playerView(room, socketId) {
  const player = room.players.find((p) => p.id === socketId);
  if (!player) return null;
  const drawerId = drawerPlayerId(room);
  const isDrawer = drawerId === socketId;
  const hasGuessedCorrectly = room.correctOrder.some(
    (g) => g.playerId === socketId
  );
  const you = {
    id: player.id,
    name: player.name,
    score: player.score,
    isDrawer,
    hasGuessedCorrectly,
    // True for a latecomer who joined mid-round: they watch this round and
    // start guessing/drawing from the next one.
    sittingOut: isSittingOut(room, player),
    // Drawer-only: the secret word (+ optional modifier prompt).
    secretWord:
      isDrawer && room.phase === "drawing" && room.currentWord
        ? room.currentWord
        : null,
    // Drawer-only: the 3 options during "choosing" phase.
    wordOptions:
      isDrawer && room.phase === "choosing" ? room.wordOptions : null,
  };
  return {
    gameType: "janach",
    you,
    room: publicRoomState(room),
  };
}

module.exports = { publicRoomState, playerView };
