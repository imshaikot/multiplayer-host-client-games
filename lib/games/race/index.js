// Race (আঙুলের দৌড়) — 12-lane vertical typing race.
// Same module shape as cah/index.js and janach/index.js — consumed by
// shared/rooms.js + shared/socket-server.js via the games registry.

const logic = require("./logic");
const views = require("./views");
const handlers = require("./handlers");

// Pull internal lifecycle helpers out of the handlers map so they don't get
// auto-dispatched as socket events.
const {
  __dispose,
  __onHostRejoin,
  __clearAllTimers,
  __clearFallTimer,
  __clearBananaTimer,
  ...socketHandlers
} = handlers;

module.exports = {
  id: "race",
  displayName: "আঙুলের দৌড়",
  minPlayers: logic.MIN_PLAYERS,
  maxPlayers: logic.MAX_PLAYERS,

  init: logic.initRoom,
  reset: logic.resetToLobby,
  dispose: __dispose,
  onHostRejoin: __onHostRejoin,

  publicView: views.publicRoomState,
  playerView: views.playerView,

  onPlayerJoin: logic.onPlayerJoin,
  onPlayerLeave: logic.onPlayerLeave,

  handlers: socketHandlers,
};
