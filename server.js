var express = require('express');
var http = require('http');
var fs = require('fs');
var rooms = require('./lib/rooms');
var game = require('./lib/game');
var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
  res.sendfile(__dirname + '/public/index.html');
});

io.on('connection', function(socket){
  socket.on('create', function(cb){
    var room = rooms.createRoom();
    socket.join(room.code);
    cb(room.code);
  });
  socket.on('join', function(data, cb){
    var room = rooms.joinRoom(data.code, data.name, socket.id);
    if (!room) { cb({ error: 'no room' }); return; }
    socket.join(room.code);
    io.to(room.code).emit('players', room.players);
    cb({ ok: true });
  });
  socket.on('start', function(code){
    var room = rooms.getRoom(code);
    game.newRound(room);
    io.to(code).emit('round', { black: room.black });
  });
  socket.on('submit', function(data){
    var room = rooms.getRoom(data.code);
    game.submit(room, socket.id, data.card);
    if (room.phase === 'judging') {
      io.to(data.code).emit('judging', room.played);
    }
  });
  socket.on('disconnect', function(){});
});

server.listen(3000);
console.log('server started on 3000');
