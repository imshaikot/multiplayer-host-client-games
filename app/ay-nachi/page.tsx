"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { PHRASES } from "@/lib/funny-phrases";
import PinGate from "@/components/PinGate";

type Mode = "idle" | "joining";

type GameTile = {
  id: "cah" | "janach" | "race";
  name: string;
  blurb: string;
  available: boolean;
  accent: string;
  badge?: string;
};

const GAMES: GameTile[] = [
  {
    id: "cah",
    name: "পবিত্র কার্ড",
    blurb: "কালো কার্ড পড়ো, সাদা কার্ড দাও। যত নোংরা, তত মজা।",
    available: true,
    accent: "bg-yellow-400 text-black",
    badge: "১৮+",
  },
  {
    id: "janach",
    name: "আঁকো",
    blurb: "একজন আঁকবে, বাকিরা গেস করবে। মজার ছবি, মজার গেস।",
    available: true,
    accent: "bg-pink-400 text-black",
    badge: "নতুন",
  },
  {
    id: "race",
    name: "আঙুলের দৌড়",
    blurb: "টাইপ রেস। ভুল লিখলে পপাত, ঠিক লিখলে রকেট। ১২০ সেকেন্ডে কে আগে?",
    available: true,
    accent: "bg-red-400 text-black",
    badge: "নতুন",
  },
];

function HubInner() {
  const router = useRouter();
  const { socket, connected } = useSocket();
  const [mode, setMode] = useState<Mode>("idle");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const c = url.searchParams.get("code");
    if (c) {
      setCode(c.toUpperCase());
      setMode("joining");
    }
  }, []);

  function hostGame(gameType: GameTile["id"]) {
    if (!socket) return;
    socket.emit(
      "host:create",
      { gameType },
      (res: { code?: string; error?: string }) => {
        if (res.error) {
          setErr(res.error);
          return;
        }
        if (res.code) router.push(`/host/${res.code}`);
      }
    );
  }

  function joinGame() {
    if (!socket) return;
    setErr("");
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    socket.emit(
      "player:join",
      { code: trimmedCode, name: trimmedName },
      (res: { ok?: boolean; code?: string; error?: string }) => {
        if (res.error) {
          setErr(res.error);
          return;
        }
        if (typeof window !== "undefined") {
          sessionStorage.setItem("cah-player-name", trimmedName);
          // The play page reads this on mount to auto-rejoin if the socket
          // ever reconnects (phone screen-lock, network blip, reload).
          // Identity is the browser-scoped clientId from useClientId; the
          // server matches by it inside joinRoom().
          window.localStorage.setItem(
            `cah-room:${res.code}`,
            JSON.stringify({ name: trimmedName })
          );
        }
        router.push(`/play/${res.code}`);
      }
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6 bangla">
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-10"
      >
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter">
          ভবের <span className="text-yellow-400">খেলাঘর</span>
        </h1>
        <p className="mt-3 text-white/60 text-sm md:text-base">Build with ❤️ by Shaikat</p>
      </motion.div>

      <AnimatePresence mode="wait">
        {mode === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-6 w-full max-w-3xl"
          >
            <div className="text-center text-xs uppercase tracking-[0.25em] text-white/40">
              কোন গেমটা খেলবেন?
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {GAMES.map((g) => (
                <motion.button
                  key={g.id}
                  whileHover={g.available ? { scale: 1.02 } : {}}
                  whileTap={g.available ? { scale: 0.98 } : {}}
                  onClick={() => g.available && hostGame(g.id)}
                  disabled={!g.available || !connected}
                  className={`relative text-left rounded-2xl p-6 ring-1 ${
                    g.available
                      ? `${g.accent} ring-black/10 shadow-lg`
                      : "bg-white/5 ring-white/10 text-white/50"
                  } disabled:cursor-not-allowed`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-3xl font-black tracking-tight">
                        {g.name}
                      </div>
                      <div
                        className={`text-sm mt-2 leading-snug ${
                          g.available ? "text-black/70" : "text-white/40"
                        }`}
                      >
                        {g.blurb}
                      </div>
                      {g.available && (
                        <div className="text-[10px] uppercase tracking-[0.25em] mt-4 text-black/60">
                          → হোস্ট করুন
                        </div>
                      )}
                    </div>
                    {g.badge && (
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-1 ring-1 ${
                          g.available
                            ? "bg-black/10 ring-black/20 text-black/70"
                            : "bg-white/10 ring-white/20 text-white/50"
                        }`}
                      >
                        {g.badge}
                      </span>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>

            {err && <p className="text-red-400 text-sm text-center">{err}</p>}

            <div className="flex items-center gap-3 text-white/30 text-xs uppercase tracking-[0.25em]">
              <div className="flex-1 h-px bg-white/10" />
              <span>ফোন থেকে জয়েন করতে চান?</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setMode("joining")}
              disabled={!connected}
              className="bg-white/10 text-white font-bold py-3 rounded-xl text-base disabled:opacity-50 hover:bg-white/15"
            >
              রুম কোড দিয়ে জয়েন করুন
            </motion.button>

            {!connected && (
              <p className="text-center text-xs text-white/50">
                {PHRASES.connecting[0]}
              </p>
            )}
          </motion.div>
        )}

        {mode === "joining" && (
          <motion.div
            key="joining"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 w-full max-w-sm"
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="রুম কোড (4 অক্ষর)"
              maxLength={4}
              className="bg-white/10 text-center text-3xl font-black tracking-[0.5em] py-4 rounded-xl uppercase outline-none focus:bg-white/20"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="আপনার নাম"
              maxLength={20}
              className="bg-white/10 px-4 py-3 rounded-xl outline-none focus:bg-white/20 text-lg"
            />
            {err && <p className="text-red-400 text-sm text-center">{err}</p>}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={joinGame}
              disabled={!connected || code.length !== 4 || !name.trim()}
              className="bg-yellow-400 text-black font-bold py-4 rounded-xl text-xl disabled:opacity-40"
            >
              জয়েন
            </motion.button>
            <button
              onClick={() => {
                setErr("");
                setMode("idle");
              }}
              className="text-white/50 text-sm py-2"
            >
              ← ফিরে যান
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default function HubPage() {
  return (
    <PinGate>
      <HubInner />
    </PinGate>
  );
}
