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

function pickWinner(room, id) {
  var winner = null;
  for (var i = 0; i < room.players.length; i++) {
    if (room.players[i].id === id) {
      room.players[i].score = room.players[i].score + 1;
      winner = room.players[i];
    }
  }
  room.phase = 'reveal';
  return winner;
}

function scores(room) {
  return room.players.map(function(p){ return { name: p.name, score: p.score }; });
}

module.exports = { newRound: newRound, submit: submit, pickWinner: pickWinner, scores: scores, cards: cards };
