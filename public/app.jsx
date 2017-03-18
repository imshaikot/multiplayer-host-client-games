var socket = io();

var Scoreboard = React.createClass({
  render: function() {
    var rows = this.props.players.map(function(p, i){
      return <li key={i}>{p.name} - {p.score}</li>;
    });
    return <ul className="scores">{rows}</ul>;
  }
});

var App = React.createClass({
  getInitialState: function() {
    return { players: [], black: '' };
  },
  componentDidMount: function() {
    var self = this;
    socket.on('players', function(players){ self.setState({ players: players }); });
    socket.on('round', function(data){ self.setState({ black: data.black }); });
    socket.on('scores', function(players){ self.setState({ players: players }); });
  },
  render: function() {
    return (
      <div>
        <div className="card black">{this.state.black}</div>
        <Scoreboard players={this.state.players} />
      </div>
    );
  }
});

ReactDOM.render(<App />, document.getElementById('app'));
