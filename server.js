var express = require('express');
var http = require('http');
var fs = require('fs');
var rooms = require('./lib/rooms');
var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
  res.sendfile(__dirname + '/public/index.html');
});

app.get('/cards', function(req, res){
  var data = fs.readFileSync(__dirname + '/cards.json');
  res.send(data);
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
  socket.on('disconnect', function(){});
});

server.listen(3000);
console.log('server started on 3000');
