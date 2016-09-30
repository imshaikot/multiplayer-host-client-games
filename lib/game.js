var fs = require('fs');
var cards = JSON.parse(fs.readFileSync(__dirname + '/../cards.json'));

function newRound(room) {
  room.black = cards.black[Math.floor(Math.random() * cards.black.length)];
  room.played = [];
  room.phase = 'submitting';
}

function submit(room, id, card) {
  room.played.push({ id: id, card: card });
  if (room.played.length >= room.players.length - 1) {
    room.phase = 'judging';
  }
}

module.exports = { newRound: newRound, submit: submit, cards: cards };
