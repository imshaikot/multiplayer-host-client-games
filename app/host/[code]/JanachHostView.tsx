"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Socket } from "socket.io-client";
import type { JanachPublicRoomState } from "@/lib/types";
import { JanachCanvas } from "@/components/JanachCanvas";
import { audio } from "@/lib/audio";
import { Avatar, RoomCornerChip, bn } from "./hostUiShared";

export function JanachHostView({
  state,
  joinUrl,
  socket,
}: {
  state: JanachPublicRoomState;
  joinUrl: string;
  socket: Socket;
}) {
  const drawer = state.players.find((p) => p.id === state.drawerId);
  const isGameplay =
    state.phase === "choosing" ||
    state.phase === "drawing" ||
    state.phase === "reveal";

  // Audio cues — fire on state transitions, not on every render.
  const prevPhaseRef = useRef(state.phase);
  const prevCorrectCountRef = useRef(state.correctGuessers.length);
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    if (prevPhase !== "reveal" && state.phase === "reveal") {
      if (state.roundResults?.reason !== "drawerLeft") audio.gong();
    }
    if (prevPhase !== "gameOver" && state.phase === "gameOver") {
      audio.fanfare();
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, state.roundResults?.reason]);
  useEffect(() => {
    if (state.correctGuessers.length > prevCorrectCountRef.current) {
      audio.ding();
    }
    prevCorrectCountRef.current = state.correctGuessers.length;
  }, [state.correctGuessers.length]);

  return (
    <>
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-black tracking-tighter">
          <span className="text-pink-400">আঁকো</span>
        </h1>
        <div className="flex items-center gap-8">
          {isGameplay && (
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-white/40">
                প্লেয়ার
              </div>
              <div className="text-2xl font-black tabular-nums">
                {bn(state.players.length)}
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-white/40">
              রাউন্ড
            </div>
            <div className="text-4xl font-black tabular-nums">
              {state.round
                ? `${bn(state.round)}/${bn(state.totalRounds)}`
                : "—"}
            </div>
          </div>
        </div>
      </header>

      {state.phase === "lobby" && (
        <JanachLobby state={state} joinUrl={joinUrl} socket={socket} />
      )}
      {(state.phase === "choosing" ||
        state.phase === "drawing" ||
        state.phase === "reveal") && (
        <JanachPlayBoard
          state={state}
          socket={socket}
          drawerName={drawer?.name}
        />
      )}
      {state.phase === "gameOver" && (
        <JanachGameOver state={state} socket={socket} />
      )}

      {isGameplay && <RoomCornerChip code={state.code} joinUrl={joinUrl} />}
    </>
  );
}

function JanachLobby({
  state,
  joinUrl,
  socket,
}: {
  state: JanachPublicRoomState;
  joinUrl: string;
  socket: Socket;
}) {
  const empties = Math.max(0, 3 - state.players.length);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-10 pt-2">
      <div className="flex flex-col items-center justify-start gap-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="text-xs uppercase tracking-widest text-white/40 mb-2">
            ফোনে এই কোডটা দিন
          </div>
          <div className="text-[10rem] leading-none font-black tracking-[0.15em] text-pink-400">
            {state.code}
          </div>
        </motion.div>

        <div className="flex items-center gap-6">
          {joinUrl && (
            <div className="bg-white p-4 rounded-2xl">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
          )}
          <div className="text-white/60 max-w-[180px]">
            <div className="text-xs uppercase tracking-widest text-white/40 mb-1">
              অথবা
            </div>
            <div className="text-base leading-snug">
              QR কোডটা ফোনে স্ক্যান করুন। লিংক খুললে কোড অটো ভরে যাবে।
            </div>
          </div>
        </div>

        <JanachHowTo />
      </div>

      <div className="flex flex-col gap-5">
        <div className="bg-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest text-white/40">
              প্লেয়ার ({bn(state.players.length)}/{bn(12)})
            </div>
            <div className="text-xs uppercase tracking-widest text-white/40">
              everyone draws {bn(2)}x
            </div>
          </div>

          {state.players.length === 0 ? (
            <div className="py-10 text-center text-white/40 italic">
              অপেক্ষায়… কেউ এখনো জয়েন করেনি
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <AnimatePresence>
                {state.players.map((p) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.7, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ type: "spring", stiffness: 200, damping: 18 }}
                    className={`flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2 ${
                      p.connected ? "" : "opacity-50"
                    }`}
                  >
                    <Avatar name={p.name} size="md" dim={!p.connected} />
                    <div className="truncate">
                      <div className="font-bold truncate">{p.name}</div>
                      <div
                        className={`text-[11px] uppercase tracking-wider ${
                          p.connected ? "text-white/40" : "text-amber-300"
                        }`}
                      >
                        {p.connected ? "ready" : "reconnecting…"}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {Array.from({ length: empties }).map((_, i) => (
                <motion.div
                  key={`empty-${i}`}
                  animate={{ opacity: [0.25, 0.5, 0.25] }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                  className="flex items-center gap-3 border-2 border-dashed border-white/10 rounded-xl px-3 py-2 h-[60px]"
                >
                  <div className="w-12 h-12 rounded-full bg-white/5" />
                  <div className="text-white/30 text-sm">অপেক্ষায়…</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <motion.button
          whileHover={state.players.length >= 3 ? { scale: 1.03 } : {}}
          whileTap={state.players.length >= 3 ? { scale: 0.97 } : {}}
          animate={
            state.players.length >= 3
              ? {
                  boxShadow: [
                    "0 0 0 0 rgba(244,114,182,0.4)",
                    "0 0 0 16px rgba(244,114,182,0)",
                  ],
                }
              : {}
          }
          transition={{ duration: 1.6, repeat: Infinity }}
          disabled={state.players.length < 3}
          onClick={() => socket.emit("host:startGame", () => {})}
          className="bg-pink-400 text-black font-black text-3xl px-8 py-5 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.players.length < 3
            ? `আরও ${bn(3 - state.players.length)} জন লাগবে`
            : "Start drawing →"}
        </motion.button>
      </div>
    </div>
  );
}

function JanachHowTo() {
  const steps = [
    { n: "1", t: "Join on phone", d: "Type the code or scan the QR." },
    { n: "2", t: "One person draws", d: "Picks a word and has 80 seconds." },
    { n: "3", t: "Everyone guesses", d: "Type the word. Faster = more points." },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xl mt-2">
      {steps.map((s) => (
        <div
          key={s.n}
          className="bg-white/5 rounded-xl p-3 ring-1 ring-white/5"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-pink-400 text-black flex items-center justify-center font-black text-sm">
              {s.n}
            </div>
            <div className="font-bold text-sm">{s.t}</div>
          </div>
          <div className="text-[11px] text-white/50 leading-snug">{s.d}</div>
        </div>
      ))}
    </div>
  );
}

// Countdown chip — recomputes from the server-provided deadline so all
// clients see the same number even if a client tab was backgrounded.
// `tick` enables the per-second metronome cue (Host display uses it during the
// drawing phase; we suppress it on the choosing phase so the audio room
// isn't constantly clicking when the drawer is just picking).
function CountdownChip({
  endsAt,
  tick = false,
}: {
  endsAt: number | null;
  tick?: boolean;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  const lastTickedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  const remaining = endsAt
    ? Math.max(0, Math.ceil((endsAt - now) / 1000))
    : 0;
  useEffect(() => {
    if (!tick || !endsAt) {
      lastTickedRef.current = null;
      return;
    }
    if (
      remaining > 0 &&
      remaining <= 10 &&
      lastTickedRef.current !== remaining
    ) {
      audio.tick();
      lastTickedRef.current = remaining;
    }
  }, [tick, remaining, endsAt]);
  if (!endsAt) return null;
  const hot = remaining <= 10;
  return (
    <motion.div
      animate={hot ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={hot ? { duration: 0.5, repeat: Infinity } : { duration: 0.2 }}
      className={`text-5xl font-black tabular-nums px-5 py-2 rounded-2xl ${
        hot
          ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60"
          : "bg-white/5 text-white"
      }`}
    >
      {remaining}s
    </motion.div>
  );
}

function WordMaskBanner({
  mask,
  length,
}: {
  mask: string;
  length: number;
}) {
  // Detect which character position just flipped from `_` to a real letter
  // so we can flash it. The server sends `wordMask` as space-separated
  // glyphs ("o _ _ _ p _ _") so we split on whitespace.
  const chars = mask ? mask.split(/\s+/) : [];
  const prevCharsRef = useRef<string[]>([]);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  useEffect(() => {
    const prev = prevCharsRef.current;
    let revealed: number | null = null;
    for (let i = 0; i < chars.length; i++) {
      if ((prev[i] ?? "_") === "_" && chars[i] !== "_") {
        revealed = i;
        break;
      }
    }
    prevCharsRef.current = chars;
    if (revealed != null) {
      setFlashIdx(revealed);
      const t = setTimeout(() => setFlashIdx(null), 900);
      return () => clearTimeout(t);
    }
  }, [mask]);
  if (!mask) return null;
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-2">
        word ({bn(length)} letters)
      </div>
      <div className="text-5xl font-black uppercase flex items-end justify-center gap-3">
        {chars.map((ch, i) => (
          <motion.span
            key={i}
            initial={false}
            animate={
              flashIdx === i
                ? {
                    color: ["#ffffff", "#facc15", "#ffffff"],
                    scale: [1, 1.4, 1],
                  }
                : { color: "#ffffff", scale: 1 }
            }
            transition={{ duration: 0.7 }}
            className="inline-block min-w-[1ch] tabular-nums"
          >
            {ch}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function JanachPlayBoard({
  state,
  socket,
  drawerName,
}: {
  state: JanachPublicRoomState;
  socket: Socket;
  drawerName?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_320px] gap-6 min-h-[calc(100dvh-120px)]">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 bg-pink-400/10 ring-1 ring-pink-400/30 rounded-full pl-2 pr-5 py-2">
          {drawerName && <Avatar name={drawerName} size="sm" />}
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-pink-300/80 leading-none">
              {state.phase === "choosing"
                ? "picking a word"
                : state.phase === "drawing"
                  ? "drawing"
                  : "round over"}
            </div>
            <div className="font-black text-pink-300">🎨 {drawerName}</div>
          </div>
        </div>

        {state.phase === "choosing" && (
          <CountdownChip endsAt={state.chooseEndsAt} />
        )}

        {state.phase === "drawing" && (
          <>
            <CountdownChip endsAt={state.roundEndsAt} tick />
            <WordMaskBanner mask={state.wordMask} length={state.wordLength} />
          </>
        )}

        {state.phase === "reveal" && state.roundResults && (
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-pink-300 mb-1">
              {state.roundResults.reason === "drawerLeft"
                ? "artist bailed"
                : state.roundResults.reason === "complete"
                  ? "everyone got it!"
                  : "time's up"}
            </div>
            <div className="text-6xl font-black uppercase tracking-wider">
              {state.roundResults.word?.word ?? "?"}
            </div>
            {state.roundResults.word?.modifier && (
              <div className="text-xl text-white/60 italic mt-1">
                {state.roundResults.word.modifier}
              </div>
            )}
          </div>
        )}

        <div className="w-full max-w-3xl">
          <JanachCanvas
            mode="viewer"
            socket={socket}
            resetKey={`${state.round}-${state.phase}`}
          />
        </div>

        {state.phase === "reveal" && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => socket.emit("host:nextRound", () => {})}
            className="bg-pink-400 text-black font-black text-xl px-8 py-3 rounded-xl shadow-xl"
          >
            পরের রাউন্ড →
          </motion.button>
        )}
      </div>

      <aside className="bg-white/5 rounded-2xl p-4 self-start flex flex-col gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40 mb-3">
            scoreboard
          </div>
          <JanachScoreboard state={state} />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40 mb-2">
            guesses
          </div>
          <GuessFeed state={state} />
        </div>
      </aside>
    </div>
  );
}

function JanachScoreboard({ state }: { state: JanachPublicRoomState }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const correctMap = new Map(
    state.correctGuessers.map((g) => [g.playerId, g.points] as const)
  );
  const revealDrawerId =
    state.phase === "reveal" ? state.roundResults?.drawerId ?? null : null;
  const drawerBonus =
    state.phase === "reveal" ? state.roundResults?.drawerPoints ?? 0 : 0;
  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((p, i) => {
        const isDrawer = p.id === state.drawerId;
        const justGotGuess = correctMap.get(p.id);
        const justGotDraw =
          p.id === revealDrawerId && drawerBonus > 0 ? drawerBonus : null;
        return (
          <div
            key={p.id}
            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg ${
              i === 0 ? "bg-pink-400/10" : "bg-white/5"
            } ${p.connected ? "" : "opacity-50"}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Avatar name={p.name} size="sm" dim={!p.connected} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold flex items-center gap-1">
                  {p.name} {isDrawer && <span>🎨</span>}
                  {!p.connected && (
                    <span className="text-[9px] text-amber-300 uppercase tracking-wider">
                      offline
                    </span>
                  )}
                </div>
                {justGotGuess != null && (
                  <div className="text-[10px] text-green-300">
                    +{justGotGuess}
                  </div>
                )}
                {justGotDraw != null && (
                  <div className="text-[10px] text-pink-300">
                    +{justGotDraw} 🎨
                  </div>
                )}
              </div>
            </div>
            <div className="font-black text-pink-300 tabular-nums text-lg">
              {p.score}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GuessFeed({ state }: { state: JanachPublicRoomState }) {
  const items: { key: string; text: string; kind: "right" | "wrong" }[] = [];
  for (const g of state.correctGuessers) {
    items.push({
      key: `r-${g.playerId}`,
      text: `${g.playerName} got it (+${g.points})${g.close ? " ~close" : ""}`,
      kind: "right",
    });
  }
  for (const g of state.guessLog.slice(-6)) {
    items.push({
      key: `w-${g.ts}-${g.playerId}`,
      text: `${g.playerName}: ${g.text}`,
      kind: "wrong",
    });
  }
  if (items.length === 0) {
    return <div className="text-white/30 text-sm italic">no guesses yet…</div>;
  }
  return (
    <div className="flex flex-col gap-1 max-h-[200px] overflow-hidden">
      {items.map((it) => (
        <div
          key={it.key}
          className={`text-xs rounded px-2 py-1 ${
            it.kind === "right"
              ? "bg-green-500/15 text-green-200"
              : "text-white/60"
          }`}
        >
          {it.text}
        </div>
      ))}
    </div>
  );
}

function JanachGameOver({
  state,
  socket,
}: {
  state: JanachPublicRoomState;
  socket: Socket;
}) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter((p) => p.score === topScore);
  const others = sorted.filter((p) => p.score !== topScore);
  const tied = winners.length > 1;
  return (
    <div className="min-h-[calc(100dvh-120px)] flex flex-col items-center justify-start gap-6 text-center pt-8">
      <div className="text-xs uppercase tracking-[0.3em] text-pink-300">
        {tied ? "tied!" : "game over"}
      </div>
      {tied ? (
        <div className="flex flex-col items-center gap-1">
          {winners.map((w) => (
            <div key={w.id} className="text-5xl font-black bangla">
              {w.name}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-7xl font-black bangla">{winners[0]?.name}</div>
      )}
      <div className="text-pink-300 text-3xl font-black">
        🏆 {bn(topScore)} points
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
        {others.map((p) => (
          <span key={p.id} className="bg-white/5 rounded-full px-3 py-1">
            {p.name} — {bn(p.score)}
          </span>
        ))}
      </div>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => socket.emit("host:resetLobby", () => {})}
        className="bg-pink-400 text-black font-black text-xl px-8 py-3 rounded-xl shadow-xl"
      >
        আবার খেলুন
      </motion.button>
    </div>
  );
}
