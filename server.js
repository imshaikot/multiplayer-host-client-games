const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const { registerSocketHandlers } = require("./lib/shared/socket-server");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3232", 10);
const hostname = "0.0.0.0";

const nextApp = next({ dev, hostname, port });
const handle = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    transports: ["websocket", "polling"],
    // Defaults (25s/20s) are too aggressive for phones on flaky wifi — a
    // backgrounded tab can miss a single pong and get killed. Bumping the
    // timeout gives reconnects a real chance to land before the server
    // declares the socket dead. The client still auto-reconnects either way;
    // the seat is preserved by the grace timer in shared/rooms.js.
    pingInterval: 25_000,
    pingTimeout: 60_000,
    // Cap inbound frame size. Our largest legit message is a stroke batch
    // (a handful of normalized points) — nothing approaches the 1MB default.
    // A tighter ceiling blunts a malicious client trying to flood the relay
    // with oversized payloads. (Per-stroke point counts are also capped in
    // lib/games/janach/logic.js.)
    maxHttpBufferSize: 256 * 1024,
  });

  registerSocketHandlers(io);

  httpServer.listen(port, hostname, () => {
    console.log(`\n  CAH-bangla running on http://localhost:${port}`);
    console.log(`  (open this on your Host display for the host view)\n`);
  });
});
