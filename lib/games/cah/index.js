// CAH game module — shape consumed by shared/rooms.js + shared/socket-server.js.

const logic = require("./logic");
const views = require("./views");
const handlers = require("./handlers");

module.exports = {
  id: "cah",
  displayName: "পবিত্র কার্ড",
  minPlayers: 3,
  maxPlayers: 12,

  init: logic.initRoom,
  reset: logic.resetToLobby,

  publicView: views.publicRoomState,
  playerView: views.playerView,

  onPlayerJoin: logic.onPlayerJoin,
  onPlayerLeave: logic.onPlayerLeave,

  handlers,
};
