// Socket event handlers for CAH. Each receives the shared dispatch context
// { io, socket, room, payload, cb, broadcast } from shared/socket-server.js.

const logic = require("./logic");

function startGame({ socket, room, cb, broadcast, io }) {
  const result = logic.startGame(room);
  if (result.error) return cb?.({ error: result.error });
  cb?.({ ok: true });
  broadcast(io, room);
}

function playerSubmit({ socket, room, payload, cb, broadcast, io }) {
  const cardIds = payload?.cardIds ?? [];
  const result = logic.submitCards(room, socket.id, cardIds);
  if (result.error) return cb?.({ error: result.error });
  logic.maybeAdvanceToJudging(room);
  cb?.({ ok: true });
  broadcast(io, room);
}

function czarPick({ socket, room, payload, cb, broadcast, io }) {
  const winnerId = payload?.winnerId;
  const result = logic.pickWinner(room, socket.id, winnerId);
  if (result.error) return cb?.({ error: result.error });
  cb?.({ ok: true });
  broadcast(io, room);
}

function nextRound({ room, cb, broadcast, io }) {
  const result = logic.nextRound(room);
  if (result.error) return cb?.({ error: result.error });
  cb?.({ ok: true });
  broadcast(io, room);
}

function resetLobby({ room, cb, broadcast, io }) {
  logic.resetToLobby(room);
  cb?.({ ok: true });
  broadcast(io, room);
}

module.exports = {
  "host:startGame": startGame,
  "host:nextRound": nextRound,
  "host:resetLobby": resetLobby,
  "player:submit": playerSubmit,
  "czar:pick": czarPick,
};
