// Ja Nach (যা নাচ) — Skribbl-style draw-and-guess game.
// Same module shape as cah/index.js — consumed by shared/rooms.js +
// shared/socket-server.js via the games registry.

const logic = require("./logic");
const views = require("./views");
const handlers = require("./handlers");

// Pull the internal lifecycle helpers out of the handlers map so they don't
// get auto-dispatched as socket events.
const {
  __dispose,
  __onHostRejoin,
  __clearTimers,
  __scheduleRoundTimers,
  ...socketHandlers
} = handlers;

module.exports = {
  id: "janach",
  displayName: "আঁকো",
  minPlayers: 3,
  maxPlayers: 12,

  init: logic.initRoom,
  reset: logic.resetToLobby,
  dispose: __dispose,
  onHostRejoin: __onHostRejoin,
  canJoinMidGame: logic.canJoinMidGame,

  publicView: views.publicRoomState,
  playerView: views.playerView,

  onPlayerJoin: logic.onPlayerJoin,
  onPlayerLeave: logic.onPlayerLeave,

  handlers: socketHandlers,
};
