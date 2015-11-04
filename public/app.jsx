var Card = React.createClass({
  render: function() {
    var cls = this.props.black ? "card black" : "card";
    return <div className={cls} onClick={this.props.onPick}>{this.props.text}</div>;
  }
});

var PlayerList = React.createClass({
  render: function() {
    var items = this.props.players.map(function(p, i) {
      return <li key={i}>{p}</li>;
    });
    return <ul>{items}</ul>;
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
    return { white: [], black: "", players: ["ami", "tumi"] };
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
    alert("picked " + this.state.white[i]);
  },
  render: function() {
    return (
      <div>
        <PlayerList players={this.state.players} />
        <Board white={this.state.white} black={this.state.black} onPick={this.pick} />
      </div>
    );
  }
});

ReactDOM.render(<App />, document.getElementById('app'));
