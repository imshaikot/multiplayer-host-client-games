var Card = React.createClass({
  render: function() {
    return <div className="card">{this.props.text}</div>;
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

var App = React.createClass({
  getInitialState: function() {
    return { white: [], players: ["ami", "tumi"] };
  },
  componentDidMount: function() {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/cards', true);
    xhr.onload = function() {
      var data = JSON.parse(xhr.responseText);
      self.setState({ white: data.white });
    };
    xhr.send();
  },
  render: function() {
    var cards = this.state.white.map(function(c, i) {
      return <Card text={c} key={i} />;
    });
    return (
      <div>
        <PlayerList players={this.state.players} />
        <div>{cards}</div>
      </div>
    );
  }
});

React.render(<App />, document.getElementById('app'));
