var express = require('express');
var fs = require('fs');
var app = express();

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
  res.sendfile(__dirname + '/public/index.html');
});

app.get('/cards', function(req, res){
  var data = fs.readFileSync(__dirname + '/cards.json');
  res.send(data);
});

app.listen(3000);
console.log('server started on 3000');
