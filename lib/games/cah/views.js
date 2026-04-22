// View builders — must produce the exact shape clients expect.
// PublicRoomState goes to the Host display; PlayerView goes to each phone.

const { czarPlayerId } = require("./logic");

function publicRoomState(room) {
  const czarId = czarPlayerId(room);
  const showRevealed = room.phase === "judging" || room.phase === "reveal";
  return {
    gameType: "cah",
    code: room.code,
    phase: room.phase,
    round: room.round,
    czarId,
    blackCard: room.blackCard,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      handCount: p.hand.length,
    })),
    submissions: room.submissions.map((s) => ({
      id: s.playerId,
      cards: s.cards,
      revealed: showRevealed,
    })),
    winnerLastRound: room.winnerLastRound,
    scoreToWin: room.scoreToWin,
  };
}

function playerView(room, socketId) {
  const player = room.players.find((p) => p.id === socketId);
  if (!player) return null;
  return {
    gameType: "cah",
    you: {
      id: player.id,
      name: player.name,
      isCzar: czarPlayerId(room) === socketId,
      score: player.score,
      hand: player.hand,
    },
    room: publicRoomState(room),
  };
}

module.exports = { publicRoomState, playerView };
