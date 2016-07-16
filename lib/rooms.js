var rooms = {};

function makeCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var code = '';
  for (var i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom() {
  var code = makeCode();
  rooms[code] = { code: code, players: [] };
  return rooms[code];
}

function getRoom(code) {
  return rooms[code];
}

function joinRoom(code, name, id) {
  var room = rooms[code];
  if (!room) { return null; }
  room.players.push({ id: id, name: name, score: 0 });
  return room;
}

module.exports = { createRoom: createRoom, getRoom: getRoom, joinRoom: joinRoom, rooms: rooms };
