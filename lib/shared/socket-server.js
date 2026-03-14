// Universal socket event router.
// Owns connection lifecycle and the small set of game-agnostic events
// (host:create, host:rejoin, player:join, disconnect). All other events are
// dispatched to the active game module's handlers map based on room.gameType.

const games = require("../games");
const {
  getRoom,
  getGame,
  createRoom,
  joinRoom,
  markPlayerDisconnected,
  clearHostFromRooms,
  broadcast,
} = require("./rooms");

// The client sends its stable browser-scoped UUID via socket.io's auth
// channel (see hooks/useSocket.ts). Falls back to a per-call payload field
// for backwards-compat with older clients that haven't been updated yet.
function getClientId(socket, payload) {
  const auth = socket.handshake?.auth?.clientId;
  if (typeof auth === "string" && auth) return auth;
  if (payload && typeof payload === "object" && typeof payload.clientId === "string") {
    return payload.clientId;
  }
  return null;
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.data.role = null;
    socket.data.roomCode = null;
    socket.data.clientId = getClientId(socket);

    socket.on("host:create", (payload, cb) => {
      // Backwards-compat: old clients called `host:create` with just a callback.
      const fn = typeof payload === "function" ? payload : cb;
      const gameType =
        (payload && typeof payload === "object" && payload.gameType) || "cah";
      if (!games[gameType]) {
        return fn?.({ error: "এই গেমটা এখনো নেই" });
      }
      const clientId = getClientId(socket, payload);
      const room = createRoom(socket.id, gameType, clientId);
      socket.data.role = "host";
      socket.data.roomCode = room.code;
      socket.data.clientId = clientId;
      socket.join(room.code);
      fn?.({ code: room.code, gameType: room.gameType });
      broadcast(io, room);
    });

    socket.on("host:rejoin", (payload, cb) => {
      const code = payload?.code;
      const room = getRoom(code);
      if (!room) return cb?.({ error: "রুম পাওয়া যায়নি" });
      // If a host:clientId was previously associated with this room, only
      // honor rejoins from the same browser. Without this anyone holding a
      // valid room code could hijack the host display. (When clientId is
      // missing on either side, fall through to the old code-only check.)
      const clientId = getClientId(socket, payload);
      if (room.hostClientId && clientId && room.hostClientId !== clientId) {
        return cb?.({ error: "এই রুমের হোস্ট অন্য কেউ" });
      }
      room.hostSocketId = socket.id;
      if (clientId && !room.hostClientId) room.hostClientId = clientId;
      socket.data.role = "host";
      socket.data.roomCode = room.code;
      socket.data.clientId = clientId;
      socket.join(room.code);
      cb?.({ ok: true, gameType: room.gameType });
      broadcast(io, room);
      // Game-specific rejoin payload (e.g. Ja Nach replays current strokes
      // so a refreshed Host display catches up mid-round).
      const game = getGame(room);
      game?.onHostRejoin?.({ io, room, hostSocketId: socket.id });
    });

    socket.on("player:join", (payload, cb) => {
      const code = payload?.code;
      const name = payload?.name;
      const clientId = getClientId(socket, payload);
      const result = joinRoom(code, socket.id, name, clientId);
      if (result.error) return cb?.({ error: result.error });
      const room = result.room;
      socket.data.role = "player";
      socket.data.roomCode = room.code;
      socket.data.clientId = clientId;
      socket.join(room.code);
      cb?.({
        ok: true,
        code: room.code,
        playerId: socket.id,
        gameType: room.gameType,
        reconnected: !!result.reconnected,
      });
      broadcast(io, room);
    });

    // Dispatch any other event to the active game module's handler.
    socket.onAny((event, ...args) => {
      if (
        event === "host:create" ||
        event === "host:rejoin" ||
        event === "player:join" ||
        event === "disconnect"
      ) {
        return;
      }
      const code = socket.data.roomCode;
      const room = getRoom(code);
      const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
      const payload = args[0];
      if (!room) return cb?.({ error: "রুম পাওয়া যায়নি" });
      const game = getGame(room);
      if (!game) return cb?.({ error: "Unknown game" });
      const handler = game.handlers?.[event];
      if (!handler) return; // unknown events silently ignored
      handler({ io, socket, room, payload, cb, broadcast });
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode;
      if (socket.data.role === "host") {
        clearHostFromRooms(socket.id);
      } else if (socket.data.role === "player") {
        // Don't yank the seat — start the grace timer so the player can
        // reconnect (phone screen-lock, app-switch, transient network blip).
        markPlayerDisconnected(io, socket.id);
      }
      if (code) {
        const room = getRoom(code);
        if (room) broadcast(io, room);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
