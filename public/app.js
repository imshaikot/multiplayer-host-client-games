function loadCards() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/cards', true);
  xhr.onload = function() {
    var data = JSON.parse(xhr.responseText);
    var box = document.getElementById('cards');
    for (var i = 0; i < data.white.length; i++) {
      var d = document.createElement('div');
      d.className = 'card';
      d.innerHTML = data.white[i];
      box.appendChild(d);
    }
  };
  xhr.send();
}
window.onload = loadCards;
