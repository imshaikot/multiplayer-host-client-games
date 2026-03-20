"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { PHRASES, pickPhrase } from "@/lib/funny-phrases";
import type { PublicRoomState } from "@/lib/types";
import { CahHostView } from "./CahHostView";
import { JanachHostView } from "./JanachHostView";
import { RaceHostView } from "./RaceHostView";
import PinGate from "@/components/PinGate";

function HostInner() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code?.toUpperCase();
  const { socket, connected } = useSocket();
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [rejoinError, setRejoinError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/ay-nachi?code=${code}`);
    }
  }, [code]);

  useEffect(() => {
    if (!socket || !connected || !code) return;
    // Re-emit host:rejoin every time the socket reconnects. The server uses
    // the stable clientId (sent via socket auth in useSocket.ts) to verify
    // this is the same browser that originally created the room, then
    // refreshes hostSocketId and broadcasts the latest room:state.
    socket.emit(
      "host:rejoin",
      { code },
      (res: { ok?: boolean; error?: string }) => {
        if (res.error) {
          // Server has no room with this code — typically because the server
          // restarted, or the room was garbage-collected after all players
          // and the host had been gone for a while. Show an explicit dead
          // end instead of silently rendering whatever stale state was last
          // on screen.
          setRejoinError(res.error);
        } else {
          setRejoinError(null);
        }
      }
    );
    const onState = (s: PublicRoomState) => setState(s);
    socket.on("room:state", onState);
    return () => {
      socket.off("room:state", onState);
    };
  }, [socket, connected, code]);

  if (rejoinError) {
    return (
      <main className="min-h-dvh flex items-center justify-center bangla p-6">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-3">🪦</div>
          <div className="text-2xl font-black">এই রুমটা আর নেই</div>
          <div className="text-white/60 mt-2">{rejoinError}</div>
          <button
            onClick={() => router.replace("/ay-nachi")}
            className="mt-8 bg-yellow-400 text-black font-black px-6 py-3 rounded-xl"
          >
            হোম এ ফিরে যান
          </button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-dvh flex items-center justify-center bangla">
        <div className="text-2xl text-white/50">
          {pickPhrase(PHRASES.hostLoading, code)}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh p-8 bangla relative">
      {state.gameType === "cah" && (
        <CahHostView state={state} joinUrl={joinUrl} socket={socket} />
      )}
      {state.gameType === "janach" && (
        <JanachHostView state={state} joinUrl={joinUrl} socket={socket} />
      )}
      {state.gameType === "race" && (
        <RaceHostView state={state} joinUrl={joinUrl} socket={socket} />
      )}
    </main>
  );
}

export default function HostPage() {
  return (
    <PinGate>
      <HostInner />
    </PinGate>
  );
}
