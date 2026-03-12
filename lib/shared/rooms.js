// Game-agnostic room infrastructure.
// Owns the rooms map, code generation, and player identity tracking.
// Game-specific state (CAH cards, scores, etc.) is initialized and mutated
// by the active game module via room.gameType -> games registry.
//
// Identity model:
//   - Players are keyed by a stable `clientId` (a UUID minted in the browser
//     and persisted in localStorage) — NOT by socket.id. The socket id is
//     just the current transport address; it changes on every reconnect.
//   - On disconnect, players aren't removed immediately. They are marked
//     connected:false and a grace timer (DISCONNECT_GRACE_MS) is armed.
//     If they reconnect (same clientId in the same room) before the timer
//     fires, the timer is cancelled and they're restored seamlessly.
//   - The host is treated the same way: hostSocketId is the current address,
//     hostClientId is the stable identity. Host:rejoin matches by clientId
//     when one is provided, or by the room code as a fallback for old clients.

const { customAlphabet } = require("nanoid");
const games = require("../games");

const codeGen = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 4);
const rooms = new Map();

// How long a player can stay disconnected before they're truly removed from
// the room. 60s covers screen-lock / app-switch on phones; longer would leave
// stale ghost players in the scoreboard.
const DISCONNECT_GRACE_MS = 60_000;

function getRoom(code) {
  if (!code) return undefined;
  return rooms.get(String(code).toUpperCase());
}

function getGame(room) {
  return games[room?.gameType];
}

function createRoom(hostSocketId, gameType, hostClientId) {
  const game = games[gameType];
  if (!game) throw new Error(`Unknown gameType: ${gameType}`);
  let code = codeGen();
  while (rooms.has(code)) code = codeGen();
  const room = {
    code,
    hostSocketId,
    hostClientId: hostClientId || null,
    gameType,
    players: [],
    phase: "lobby",
  };
  game.init(room);
  rooms.set(code, room);
  return room;
}

function deleteRoom(code) {
  const room = getRoom(code);
  if (!room) return;
  const game = getGame(room);
  game?.dispose?.(room);
  // Cancel any pending disconnect-grace timers so they don't fire after the
  // room is gone.
  if (room._disconnectTimers) {
    for (const t of room._disconnectTimers.values()) clearTimeout(t);
    room._disconnectTimers.clear();
  }
  rooms.delete(room.code);
}

// Two-mode join: new players need an open lobby; returning players (matched
// by clientId) skip the lobby check and just refresh their socket address.
function joinRoom(code, socketId, name, clientId) {
  const room = getRoom(code);
  if (!room) return { error: "এই কোডের কোনো রুম নেই" };

  // Reconnect path: same clientId already in this room → restore the seat.
  if (clientId) {
    const existing = room.players.find((p) => p.clientId === clientId);
    if (existing) {
      existing.id = socketId;
      existing.connected = true;
      existing.disconnectedAt = null;
      cancelDisconnectTimer(room, clientId);
      return { room, reconnected: true, player: existing };
    }
  }

  const game = getGame(room);
  // Most games only accept new players in the lobby. A game may opt into
  // mid-game joining by exporting canJoinMidGame(room) — e.g. Ja Nach lets a
  // latecomer in and seats them for the next round (score 0 on the board).
  if (room.phase !== "lobby" && !game?.canJoinMidGame?.(room)) {
    return { error: "খেলা ইতিমধ্যে শুরু হয়েছে" };
  }
  const cap = game?.maxPlayers ?? 12;
  if (room.players.length >= cap) return { error: "রুম পূর্ণ" };
  const cleanName =
    (name || "").trim().slice(0, 20) || `প্লেয়ার ${room.players.length + 1}`;
  const player = {
    id: socketId,
    clientId: clientId || null,
    name: cleanName,
    connected: true,
    disconnectedAt: null,
  };
  room.players.push(player);
  game?.onPlayerJoin?.(room, player);
  return { room, player };
}

// Truly remove a player from a room — called either when the grace timer
// fires or when the room/game module wants the seat gone immediately.
function removePlayerFromRoom(room, socketId) {
  const idx = room.players.findIndex((p) => p.id === socketId);
  if (idx === -1) return null;
  const [removed] = room.players.splice(idx, 1);
  const game = getGame(room);
  game?.onPlayerLeave?.(room, removed, idx);
  if (room.players.length === 0 && room.hostSocketId == null) {
    deleteRoom(room.code);
  }
  return { removed, idx };
}

function cancelDisconnectTimer(room, clientId) {
  if (!room._disconnectTimers) return;
  const t = room._disconnectTimers.get(clientId);
  if (t) {
    clearTimeout(t);
    room._disconnectTimers.delete(clientId);
  }
}

// Mark the player as disconnected and arm the grace timer. If the player
// reconnects (same clientId) within DISCONNECT_GRACE_MS, the timer is
// cancelled in joinRoom. Otherwise we splice them out and broadcast.
//
// Players without a clientId (old/buggy clients) can't be reconnected, so
// we skip the grace period and remove immediately to preserve old behavior.
function markPlayerDisconnected(io, socketId) {
  const affected = [];
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.id === socketId);
    if (!player) continue;
    // Two cases where we skip the grace period and remove immediately:
    //  1. The player has no clientId → can't reconnect anyway.
    //  2. We're still in the lobby → there's no game state worth preserving,
    //     and lingering disconnected entries pile up across test sessions
    //     and create phantom "extra players" in the host's lobby list.
    if (!player.clientId || room.phase === "lobby") {
      removePlayerFromRoom(room, socketId);
      affected.push(room.code);
      continue;
    }
    player.connected = false;
    player.disconnectedAt = Date.now();
    if (!room._disconnectTimers) room._disconnectTimers = new Map();
    cancelDisconnectTimer(room, player.clientId);
    const clientId = player.clientId;
    const t = setTimeout(() => {
      room._disconnectTimers?.delete(clientId);
      // Re-check by clientId — the player object may have been refreshed in
      // a reconnect that arrived just before the timer fired.
      const stillThere = room.players.find(
        (p) => p.clientId === clientId && p.connected === false
      );
      if (!stillThere) return;
      removePlayerFromRoom(room, stillThere.id);
      broadcast(io, room);
    }, DISCONNECT_GRACE_MS);
    room._disconnectTimers.set(clientId, t);
    affected.push(room.code);
  }
  return affected;
}

function clearHostFromRooms(socketId) {
  const affected = [];
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId) {
      room.hostSocketId = null;
      affected.push(room.code);
      if (room.players.length === 0) deleteRoom(room.code);
    }
  }
  return affected;
}

function broadcast(io, room) {
  if (!room) return;
  const game = getGame(room);
  if (!game) return;
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit("room:state", game.publicView(room));
  }
  for (const p of room.players) {
    // Skip players currently in the disconnected-but-grace-pending state —
    // their socket address is stale and io.to(staleId) is a no-op anyway.
    if (p.connected === false) continue;
    const view = game.playerView(room, p.id);
    if (view) io.to(p.id).emit("player:state", view);
  }
}

module.exports = {
  rooms,
  getRoom,
  getGame,
  createRoom,
  deleteRoom,
  joinRoom,
  markPlayerDisconnected,
  // Back-compat alias — old callers used the splice-immediately semantics.
  removePlayerFromAllRooms: markPlayerDisconnected,
  clearHostFromRooms,
  broadcast,
  DISCONNECT_GRACE_MS,
};
