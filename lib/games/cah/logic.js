// Pure CAH game-logic functions. No socket, no broadcast.
// State lives on the room object passed in; mutations happen in place to match
// the existing pattern.

const cards = require("../../../data/cah_bengali.json");

const ALL_BLACK = cards.black;
const ALL_WHITE = cards.white;
const DEFAULT_HAND_SIZE = 7;
const DEFAULT_SCORE_TO_WIN = 7;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshDeck() {
  return { black: shuffle(ALL_BLACK), white: shuffle(ALL_WHITE) };
}

function drawBlack(room) {
  if (room.deck.black.length === 0) {
    room.deck.black = shuffle(room.discard.black);
    room.discard.black = [];
  }
  return room.deck.black.shift();
}

function drawWhite(room, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (room.deck.white.length === 0) {
      room.deck.white = shuffle(room.discard.white);
      room.discard.white = [];
    }
    out.push(room.deck.white.shift());
  }
  return out;
}

function refillHand(room, playerId) {
  const p = room.players.find((p) => p.id === playerId);
  if (!p) return;
  const need = room.handSize - p.hand.length;
  if (need > 0) p.hand.push(...drawWhite(room, need));
}

function czarPlayerId(room) {
  if (room.players.length === 0) return null;
  return room.players[room.czarIndex % room.players.length]?.id ?? null;
}

function pickRequired(room) {
  return room.blackCard?.pick ?? 1;
}

function startRound(room) {
  if (room.blackCard) room.discard.black.push(room.blackCard);
  for (const s of room.submissions) room.discard.white.push(...s.cards);
  room.submissions = [];
  room.winnerLastRound = null;
  room.blackCard = drawBlack(room);
  room.phase = "submitting";
  room.round += 1;
  for (const p of room.players) refillHand(room, p.id);
}

function rotateCzar(room) {
  if (room.players.length === 0) return;
  room.czarIndex = (room.czarIndex + 1) % room.players.length;
}

// Called by shared/rooms.js createRoom() — seeds CAH-specific state.
function initRoom(room) {
  room.round = 0;
  room.czarIndex = 0;
  room.blackCard = null;
  room.submissions = [];
  room.winnerLastRound = null;
  room.scoreToWin = DEFAULT_SCORE_TO_WIN;
  room.handSize = DEFAULT_HAND_SIZE;
  room.deck = freshDeck();
  room.discard = { black: [], white: [] };
}

// Called by shared/rooms.js joinRoom() — adds CAH-specific player fields.
function onPlayerJoin(room, player) {
  player.score = 0;
  player.hand = [];
}

// Called by shared/rooms.js removePlayerFromAllRooms() — recycles cards
// and keeps czarIndex valid.
function onPlayerLeave(room, removedPlayer, removedIdx) {
  if (removedPlayer.hand?.length) {
    room.discard.white.push(...removedPlayer.hand);
  }
  const wasCzar =
    room.players.length > 0 &&
    // The czar at the moment of removal was the player at removedIdx if
    // czarIndex === removedIdx (the player is already spliced out before this
    // hook is called).
    room.czarIndex === removedIdx;
  room.submissions = room.submissions.filter(
    (s) => s.playerId !== removedPlayer.id
  );
  if (removedIdx < room.czarIndex) room.czarIndex--;
  if (room.players.length > 0 && wasCzar) {
    room.czarIndex = room.czarIndex % room.players.length;
  }
}

function resetToLobby(room) {
  room.phase = "lobby";
  initRoom(room);
  for (const p of room.players) {
    p.score = 0;
    p.hand = [];
  }
}

function submitCards(room, socketId, cardIds) {
  if (room.phase !== "submitting") return { error: "এখন সাবমিট করা যাবে না" };
  if (czarPlayerId(room) === socketId)
    return { error: "ক্যাপ্টেন কার্ড সাবমিট করতে পারবেন না" };
  const player = room.players.find((p) => p.id === socketId);
  if (!player) return { error: "প্লেয়ার পাওয়া যায়নি" };
  if (room.submissions.some((s) => s.playerId === socketId))
    return { error: "ইতিমধ্যে সাবমিট করেছেন" };
  const required = pickRequired(room);
  if (cardIds.length !== required) return { error: `${required}টা কার্ড দিন` };
  const picked = [];
  for (const id of cardIds) {
    const c = player.hand.find((c) => c.id === id);
    if (!c) return { error: "কার্ড পাওয়া যায়নি" };
    picked.push(c);
  }
  player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
  room.submissions.push({ playerId: socketId, cards: picked });
  return { room };
}

function maybeAdvanceToJudging(room) {
  if (room.phase !== "submitting") return false;
  const czarId = czarPlayerId(room);
  const eligible = room.players.filter((p) => p.id !== czarId);
  if (eligible.length === 0) return false;
  const allIn = eligible.every((p) =>
    room.submissions.some((s) => s.playerId === p.id)
  );
  if (allIn) {
    for (let i = room.submissions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [room.submissions[i], room.submissions[j]] = [
        room.submissions[j],
        room.submissions[i],
      ];
    }
    room.phase = "judging";
    return true;
  }
  return false;
}

function pickWinner(room, czarSocketId, winnerId) {
  if (room.phase !== "judging") return { error: "এখন বিজয়ী বাছা যাবে না" };
  if (czarPlayerId(room) !== czarSocketId)
    return { error: "শুধু ক্যাপ্টেন বিজয়ী বাছবেন" };
  const winning = room.submissions.find((s) => s.playerId === winnerId);
  if (!winning) return { error: "ভুল সাবমিশন" };
  const winnerPlayer = room.players.find((p) => p.id === winnerId);
  if (!winnerPlayer) return { error: "প্লেয়ার পাওয়া যায়নি" };
  winnerPlayer.score += 1;
  room.winnerLastRound = {
    playerId: winnerId,
    playerName: winnerPlayer.name,
    cards: winning.cards,
  };
  room.phase = "reveal";
  if (winnerPlayer.score >= room.scoreToWin) room.phase = "gameOver";
  return { room };
}

function nextRound(room) {
  if (room.phase !== "reveal") return { error: "এই মুহূর্তে নেক্সট রাউন্ড না" };
  rotateCzar(room);
  startRound(room);
  return { room };
}

function startGame(room) {
  if (room.phase !== "lobby") return { error: "ইতিমধ্যে শুরু হয়েছে" };
  if (room.players.length < 3) return { error: "মিনিমাম ৩ জন প্লেয়ার লাগবে" };
  room.czarIndex = Math.floor(Math.random() * room.players.length);
  startRound(room);
  return { room };
}

module.exports = {
  initRoom,
  onPlayerJoin,
  onPlayerLeave,
  resetToLobby,
  startGame,
  startRound,
  rotateCzar,
  submitCards,
  maybeAdvanceToJudging,
  pickWinner,
  nextRound,
  czarPlayerId,
  pickRequired,
};
