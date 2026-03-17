"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getClientId } from "./useClientId";

let socketSingleton: Socket | null = null;

function getSocket(): Socket {
  if (!socketSingleton) {
    socketSingleton = io({
      autoConnect: true,
      transports: ["websocket", "polling"],
      // socket.io-client already auto-reconnects with these defaults, but
      // we set them explicitly so the intent is clear: keep trying forever,
      // backing off up to 5s. A backgrounded phone tab may resume seconds
      // or minutes later; we want to be ready when it does.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0.5,
      // Stable identity sent on every handshake — the server uses it to
      // match a returning socket back to its existing seat in the room
      // (see lib/shared/rooms.js).
      auth: (cb) => cb({ clientId: getClientId() }),
    });
  }
  return socketSingleton;
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    const s = getSocket();
    ref.current = s;
    setConnected(s.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: ref.current as Socket, connected };
}
