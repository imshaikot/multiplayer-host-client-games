var Card = React.createClass({
  render: function() {
    return <div className="card">{this.props.text}</div>;
  }
});

var App = React.createClass({
  getInitialState: function() {
    return { white: [] };
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
    return <div>{cards}</div>;
  }
});

React.render(<App />, document.getElementById('app'));
