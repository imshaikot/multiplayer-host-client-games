"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { PHRASES, pickPhrase } from "@/lib/funny-phrases";
import type { PlayerView } from "@/lib/types";
import { CahPlayView } from "./CahPlayView";
import { JanachPlayView } from "./JanachPlayView";
import { RacePlayView } from "./RacePlayView";

// What we stash in localStorage on first join, keyed by room code. Lets the
// play page auto-rejoin after a reload / phone wakeup without bouncing the
// user back to the hub. Identity itself lives in useClientId (a stable
// browser UUID), so we only need to remember the display name here.
type StoredRoom = { name: string };

function readStoredRoom(code: string): StoredRoom | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`cah-room:${code}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code?.toUpperCase() ?? "";
  const { socket, connected } = useSocket();
  const [view, setView] = useState<PlayerView | null>(null);
  const [rejoinError, setRejoinError] = useState<string | null>(null);
  // Track whether we've ever been connected in this page load. Used to
  // distinguish "still loading" from "lost connection — reconnecting" in
  // the UI; both have view===null briefly but they look different to a user.
  const everConnectedRef = useRef(false);

  // (Re)join the room every time the socket transitions to connected. The
  // server uses clientId (sent via socket auth) to match this back to the
  // existing seat if one exists — no need to track that on the client.
  useEffect(() => {
    if (!socket || !connected || !code) return;
    everConnectedRef.current = true;
    const stored = readStoredRoom(code);
    // Fall back to a session-stored name (set on the hub page) — covers a
    // refresh where the per-room key got cleared but the user hasn't left
    // the tab.
    const fallbackName =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("cah-player-name") || ""
        : "";
    const name = stored?.name || fallbackName;
    if (!name) {
      // No identity to rejoin with — punt back to the hub so the user can
      // enter their name again.
      router.replace(`/ay-nachi?code=${code}`);
      return;
    }
    socket.emit(
      "player:join",
      { code, name },
      (res: { ok?: boolean; error?: string; reconnected?: boolean }) => {
        if (res.error) {
          // Common reasons: room doesn't exist (server restart), or it's
          // mid-game and we're a brand-new identity (no clientId match).
          // Either way the user can't usefully stay here; show the error
          // with a way home.
          setRejoinError(res.error);
        } else {
          setRejoinError(null);
        }
      }
    );
  }, [socket, connected, code, router]);

  useEffect(() => {
    if (!socket) return;
    const onState = (v: PlayerView) => setView(v);
    socket.on("player:state", onState);
    return () => {
      socket.off("player:state", onState);
    };
  }, [socket]);

  if (rejoinError) {
    return (
      <main className="min-h-dvh flex items-center justify-center bangla p-6">
        <div className="text-center max-w-sm">
          <div className="text-2xl font-black mb-2">😬</div>
          <div className="text-lg font-bold text-white/90">{rejoinError}</div>
          <button
            onClick={() => router.replace("/ay-nachi")}
            className="mt-6 bg-white/10 text-white px-6 py-3 rounded-xl"
          >
            হোম এ ফিরে যান
          </button>
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="min-h-dvh flex items-center justify-center bangla">
        <div className="text-xl text-white/50">
          {pickPhrase(PHRASES.connecting, code)}
        </div>
      </main>
    );
  }

  return (
    <>
      {view.gameType === "cah" && (
        <CahPlayView view={view} socket={socket} code={code} />
      )}
      {view.gameType === "janach" && (
        <JanachPlayView view={view} socket={socket} code={code} />
      )}
      {view.gameType === "race" && (
        <RacePlayView view={view} socket={socket} code={code} />
      )}
      {!connected && everConnectedRef.current && <ReconnectingOverlay />}
    </>
  );
}

// Shown only on the phone (play side) when the socket drops. The seat is
// preserved server-side by the grace timer in lib/shared/rooms.js for 60s,
// and the play page re-emits player:join on every successful reconnect, so
// in most cases this flashes briefly and disappears on its own.
function ReconnectingOverlay() {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center bangla">
      <div className="text-center px-6">
        <div className="inline-block w-10 h-10 rounded-full border-4 border-yellow-400 border-t-transparent animate-spin mb-4" />
        <div className="text-xl font-black">আবার কানেক্ট করছি…</div>
        <div className="text-sm text-white/60 mt-2">
          আপনার সিট রাখা আছে। একটু অপেক্ষা করুন।
        </div>
      </div>
    </div>
  );
}
