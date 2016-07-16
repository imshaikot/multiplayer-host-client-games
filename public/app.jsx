var socket = io();

var Join = React.createClass({
  getInitialState: function() {
    return { code: '', name: '' };
  },
  join: function() {
    socket.emit('join', { code: this.state.code, name: this.state.name }, function(res){
      if (res.error) { alert(res.error); }
    });
  },
  render: function() {
    var self = this;
    return (
      <div>
        <input placeholder="code" onChange={function(e){ self.setState({code: e.target.value}); }} />
        <input placeholder="name" onChange={function(e){ self.setState({name: e.target.value}); }} />
        <button onClick={this.join}>join</button>
      </div>
    );
  }
});

var App = React.createClass({
  getInitialState: function() {
    return { players: [] };
  },
  componentDidMount: function() {
    var self = this;
    socket.on('players', function(players){
      self.setState({ players: players });
    });
  },
  render: function() {
    var rows = this.state.players.map(function(p, i){
      return <li key={i}>{p.name}</li>;
    });
    return (
      <div>
        <Join />
        <ul>{rows}</ul>
      </div>
    );
  }
});

ReactDOM.render(<App />, document.getElementById('app'));
