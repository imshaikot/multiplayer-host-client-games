var Card = React.createClass({
  render: function() {
    var cls = this.props.black ? "card black" : "card";
    return <div className={cls} onClick={this.props.onPick}>{this.props.text}</div>;
  }
});

var Scoreboard = React.createClass({
  render: function() {
    var sorted = this.props.players.slice().sort(function(a, b){ return b.score - a.score; });
    var rows = sorted.map(function(p, i) {
      return <li key={i}>{p.name} - {p.score}</li>;
    });
    return <ul className="scores">{rows}</ul>;
  }
});

var Board = React.createClass({
  render: function() {
    var self = this;
    var cards = this.props.white.map(function(c, i) {
      return <Card text={c} key={i} onPick={function(){ self.props.onPick(i); }} />;
    });
    return (
      <div className="board">
        <Card text={this.props.black} black={true} />
        <div className="hand">{cards}</div>
      </div>
    );
  }
});

var App = React.createClass({
  getInitialState: function() {
    return { white: [], black: "", players: [{name:"ami",score:0},{name:"tumi",score:0}] };
  },
  componentDidMount: function() {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/cards', true);
    xhr.onload = function() {
      var data = JSON.parse(xhr.responseText);
      self.setState({ white: data.white, black: data.black[0] });
    };
    xhr.send();
  },
  pick: function(i) {
    var players = this.state.players;
    players[0].score = players[0].score + 1;
    this.setState({ players: players });
  },
  render: function() {
    return (
      <div>
        <Scoreboard players={this.state.players} />
        <Board white={this.state.white} black={this.state.black} onPick={this.pick} />
      </div>
    );
  }
});

ReactDOM.render(<App />, document.getElementById('app'));
