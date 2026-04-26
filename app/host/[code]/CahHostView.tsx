"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Socket } from "socket.io-client";
import { BlackCard } from "@/components/BlackCard";
import { WhiteCard } from "@/components/WhiteCard";
import { Scoreboard } from "@/components/Scoreboard";
import { ReactionGif } from "@/components/ReactionGif";
import { PHRASES, pickPhrase } from "@/lib/funny-phrases";
import type { CahPublicRoomState } from "@/lib/types";
import { Avatar, RoomCornerChip, bn, hashIdx } from "./hostUiShared";

export function CahHostView({
  state,
  joinUrl,
  socket,
}: {
  state: CahPublicRoomState;
  joinUrl: string;
  socket: Socket;
}) {
  const czar = state.players.find((p) => p.id === state.czarId);
  const isGameplay =
    state.phase === "submitting" ||
    state.phase === "judging" ||
    state.phase === "reveal";

  return (
    <>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-black tracking-tighter">
          পবিত্র <span className="text-yellow-400">কার্ড</span>
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
              {state.round ? bn(state.round) : "—"}
            </div>
          </div>
        </div>
      </header>

      {state.phase === "lobby" && (
        <LobbyView state={state} joinUrl={joinUrl} socket={socket} />
      )}
      {state.phase === "submitting" && (
        <SubmittingView state={state} czarName={czar?.name} />
      )}
      {state.phase === "judging" && (
        <JudgingView state={state} czarName={czar?.name} />
      )}
      {state.phase === "reveal" && <RevealView state={state} socket={socket} />}
      {state.phase === "gameOver" && (
        <GameOverView state={state} socket={socket} />
      )}

      {isGameplay && <RoomCornerChip code={state.code} joinUrl={joinUrl} />}
    </>
  );
}

function LobbyView({
  state,
  joinUrl,
  socket,
}: {
  state: CahPublicRoomState;
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
          <div className="text-[10rem] leading-none font-black tracking-[0.15em] text-yellow-400">
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

        <HowToPlay />
      </div>

      <div className="flex flex-col gap-5">
        <div className="bg-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest text-white/40">
              প্লেয়ার ({bn(state.players.length)}/{bn(12)})
            </div>
            <div className="text-xs uppercase tracking-widest text-white/40">
              জিততে দরকার {bn(state.scoreToWin)} পয়েন্ট
            </div>
          </div>

          {state.players.length === 0 ? (
            <div className="py-10 text-center text-white/40 italic">
              {pickPhrase(PHRASES.emptyLobby, state.code)}
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
                        {p.connected ? "জয়েন করেছেন" : "reconnecting…"}
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
                    "0 0 0 0 rgba(250,204,21,0.4)",
                    "0 0 0 16px rgba(250,204,21,0)",
                  ],
                }
              : {}
          }
          transition={{ duration: 1.6, repeat: Infinity }}
          disabled={state.players.length < 3}
          onClick={() => socket.emit("host:startGame", () => {})}
          className="bg-yellow-400 text-black font-black text-3xl px-8 py-5 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.players.length < 3
            ? `আরও ${bn(3 - state.players.length)} জন লাগবে`
            : "খেলা শুরু করুন →"}
        </motion.button>

        {state.players.length >= 3 && (
          <div className="text-center text-white/40 text-sm">
            মিনিমাম ৩, ম্যাক্স ১২ জন। সবাই জয়েন করেছে?
          </div>
        )}
      </div>
    </div>
  );
}

function HowToPlay() {
  const steps = [
    { n: "১", t: "ফোনে জয়েন", d: "কোড টাইপ বা QR স্ক্যান করুন।" },
    { n: "২", t: "কার্ড দিন", d: "কালো কার্ডের শূন্যস্থান সাদা কার্ড দিয়ে ভরুন।" },
    { n: "৩", t: "ক্যাপ্টেন বাছবেন", d: "প্রতি রাউন্ডে একজন সেরা উত্তর বাছবেন। ১ পয়েন্ট।" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xl mt-2">
      {steps.map((s) => (
        <div
          key={s.n}
          className="bg-white/5 rounded-xl p-3 ring-1 ring-white/5"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-yellow-400 text-black flex items-center justify-center font-black text-sm">
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

function SubmittingView({
  state,
  czarName,
}: {
  state: CahPublicRoomState;
  czarName?: string;
}) {
  const eligible = state.players.filter((p) => p.id !== state.czarId);
  const submittedIds = new Set(state.submissions.map((s) => s.id));
  const done = eligible.filter((p) => submittedIds.has(p.id)).length;
  const total = eligible.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const header = pickPhrase(PHRASES.hostSubmittingHeader, state.round);
  const czarPlayer = state.players.find((p) => p.id === state.czarId);

  return (
    <div className="grid grid-cols-[1fr_320px] gap-8 min-h-[calc(100dvh-120px)]">
      <div className="flex flex-col items-center justify-start gap-5">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 bg-yellow-400/10 ring-1 ring-yellow-400/30 rounded-full pl-2 pr-5 py-2"
        >
          {czarPlayer && <Avatar name={czarPlayer.name} size="sm" />}
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-yellow-400/80 leading-none">
              এই রাউন্ডের ক্যাপ্টেন
            </div>
            <div className="font-black text-yellow-300">👑 {czarName}</div>
          </div>
        </motion.div>

        {state.blackCard && <BlackCard card={state.blackCard} size="xl" />}

        <div className="w-full max-w-3xl flex flex-col items-center gap-3">
          <div className="flex items-center justify-between w-full text-xs uppercase tracking-widest text-white/40">
            <span>{header}</span>
            <span className="tabular-nums">
              {bn(done)}/{bn(total)} জমা পড়েছে
            </span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
              className="h-full bg-gradient-to-r from-yellow-300 to-yellow-500"
            />
          </div>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            {eligible.map((p) => {
              const submitted = submittedIds.has(p.id);
              return (
                <motion.div
                  key={p.id}
                  animate={submitted ? { y: 0, scale: 1 } : { y: [0, -3, 0] }}
                  transition={
                    submitted
                      ? { type: "spring" }
                      : {
                          duration: 1.4,
                          repeat: Infinity,
                          delay: hashIdx(p.id, 6) * 0.1,
                        }
                  }
                  className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 ring-1 ${
                    submitted
                      ? "bg-green-500/15 ring-green-400/40 text-green-200"
                      : "bg-white/5 ring-white/10 text-white"
                  }`}
                >
                  <div className="relative">
                    <Avatar name={p.name} size="sm" dim={!submitted} />
                    {submitted && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-400 text-black text-xs font-black flex items-center justify-center ring-2 ring-black"
                      >
                        ✓
                      </motion.div>
                    )}
                  </div>
                  <span className="font-semibold text-sm">{p.name}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="bg-white/5 rounded-2xl p-4 self-start">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-3">
          স্কোর
        </div>
        <Scoreboard
          players={state.players}
          czarId={state.czarId}
          scoreToWin={state.scoreToWin}
        />
      </aside>
    </div>
  );
}

function JudgingView({
  state,
  czarName,
}: {
  state: CahPublicRoomState;
  czarName?: string;
}) {
  const header = pickPhrase(PHRASES.hostJudgingHeader, state.round);
  const czarPlayer = state.players.find((p) => p.id === state.czarId);
  return (
    <div className="grid grid-cols-[1fr_320px] gap-8 min-h-[calc(100dvh-120px)]">
      <div className="flex flex-col items-center gap-5">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 bg-yellow-400/10 ring-1 ring-yellow-400/30 rounded-full pl-2 pr-5 py-2"
        >
          {czarPlayer && <Avatar name={czarPlayer.name} size="sm" />}
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-yellow-400/80 leading-none">
              {header}
            </div>
            <div className="font-black text-yellow-300">
              👑 {czarName} বিচার করছেন
            </div>
          </div>
        </motion.div>

        <div className="flex gap-6 items-start w-full justify-center">
          {state.blackCard && <BlackCard card={state.blackCard} size="lg" />}
          <div className="grid grid-cols-2 gap-4 max-w-3xl">
            <AnimatePresence>
              {state.submissions.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ rotateY: 180, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: i * 0.15, duration: 0.5 }}
                  className="relative"
                >
                  <div className="absolute -top-3 -left-3 z-10 w-9 h-9 rounded-full bg-yellow-400 text-black font-black flex items-center justify-center text-lg shadow-lg ring-2 ring-black/40">
                    {bn(i + 1)}
                  </div>
                  <div className="flex flex-col gap-2">
                    {s.cards.map((c) => (
                      <WhiteCard key={c.id} card={c} size="md" />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <aside className="bg-white/5 rounded-2xl p-4 self-start">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-3">
          স্কোর
        </div>
        <Scoreboard
          players={state.players}
          czarId={state.czarId}
          scoreToWin={state.scoreToWin}
        />
      </aside>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 2.2 + Math.random() * 1.6,
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 8,
      color: ["#fbbf24", "#ec4899", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"][
        i % 6
      ],
    }));
  }, []);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -40, opacity: 0, rotate: 0 }}
          animate={{
            y: "110vh",
            opacity: [0, 1, 1, 0.4],
            rotate: p.rotate + 540,
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size * 0.4,
            background: p.color,
          }}
        />
      ))}
    </div>
  );
}

function RevealView({
  state,
  socket,
}: {
  state: CahPublicRoomState;
  socket: Socket;
}) {
  const w = state.winnerLastRound;
  const filled = w ? w.cards.map((c) => c.text.replace(/।$/, "")) : undefined;
  const winnerPlayer = state.players.find((p) => p.id === w?.playerId);
  const others = state.submissions.filter((s) => s.id !== w?.playerId);
  const headline = pickPhrase(PHRASES.hostRevealCelebration, state.round);

  return (
    <div className="relative min-h-[calc(100dvh-120px)] grid grid-cols-[1fr_320px] gap-8">
      <Confetti />
      <div className="flex flex-col items-center gap-4 pt-2 z-10">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 12 }}
          className="text-center flex flex-col items-center gap-2"
        >
          <div className="text-xs uppercase tracking-[0.3em] text-yellow-400">
            {headline}
          </div>
          <div className="flex items-center gap-4">
            {winnerPlayer && (
              <Avatar name={winnerPlayer.name} size="xl" crowned />
            )}
            <div className="text-left">
              <div className="text-6xl font-black bangla leading-none">
                {w?.playerName}
              </div>
              <div className="text-yellow-400 text-2xl font-black mt-1">
                +১ পয়েন্ট
              </div>
            </div>
          </div>
        </motion.div>

        {state.blackCard && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <BlackCard card={state.blackCard} size="lg" filledWith={filled} />
          </motion.div>
        )}

        {others.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="w-full max-w-4xl"
          >
            <div className="text-[11px] uppercase tracking-[0.25em] text-white/40 text-center mb-2">
              যারা হারল
            </div>
            <div className="flex gap-2 justify-center flex-wrap opacity-60">
              {others.map((s) => (
                <div key={s.id} className="flex flex-col gap-1">
                  {s.cards.map((c) => (
                    <WhiteCard key={c.id} card={c} size="sm" />
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => socket.emit("host:nextRound", () => {})}
          className="bg-yellow-400 text-black font-black text-xl px-8 py-3 rounded-xl mt-1 shadow-xl"
        >
          পরের রাউন্ড →
        </motion.button>
      </div>

      <aside className="bg-white/5 backdrop-blur rounded-2xl p-4 self-start z-10">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-3">
          স্কোর
        </div>
        <Scoreboard
          players={state.players}
          czarId={state.czarId}
          scoreToWin={state.scoreToWin}
        />
        <div className="mt-4 pt-3 border-t border-white/10 flex justify-center">
          <ReactionGif
            moment="winner"
            refreshKey={state.round}
            fallbackEmoji="🎉"
            size="sm"
          />
        </div>
      </aside>
    </div>
  );
}

function GameOverView({
  state,
  socket,
}: {
  state: CahPublicRoomState;
  socket: Socket;
}) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const second = sorted[1];
  const third = sorted[2];
  const others = sorted.slice(3);
  const title = pickPhrase(PHRASES.gameOverTitle, winner?.id ?? state.code);
  const subline = pickPhrase(PHRASES.gameOverSubline, winner?.id ?? state.code);

  const podium: { p: typeof winner; h: string; rank: string; place: string }[] =
    [];
  if (second) podium.push({ p: second, h: "h-32", rank: "🥈", place: "২য়" });
  if (winner) podium.push({ p: winner, h: "h-44", rank: "🥇", place: "১ম" });
  if (third) podium.push({ p: third, h: "h-24", rank: "🥉", place: "৩য়" });

  return (
    <div className="relative min-h-[calc(100dvh-120px)] flex flex-col items-center justify-start gap-5 text-center">
      <Confetti />
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1, rotate: [0, -4, 4, 0] }}
        transition={{ duration: 0.8 }}
        className="z-10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-yellow-400">
          খেলা শেষ
        </div>
        <div className="text-7xl font-black mt-2 bangla">{winner?.name}</div>
        <div className="text-yellow-400 text-3xl font-black mt-2">{title}</div>
        <div className="text-white/40 mt-1 italic">{subline}</div>
      </motion.div>

      <div className="z-10 flex items-end justify-center gap-4 mt-1">
        {podium.map(({ p, h, rank, place }) => (
          <motion.div
            key={p.id}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: place === "১ম" ? 0.6 : place === "২য়" ? 0.8 : 1.0,
            }}
            className="flex flex-col items-center gap-2"
          >
            <Avatar name={p.name} size="lg" crowned={place === "১ম"} />
            <div className="text-2xl">{rank}</div>
            <div className="font-bold text-lg">{p.name}</div>
            <div className="text-yellow-400 font-black text-xl tabular-nums">
              {bn(p.score)}
            </div>
            <div
              className={`w-28 ${h} rounded-t-lg ${
                place === "১ম"
                  ? "bg-yellow-400"
                  : place === "২য়"
                    ? "bg-white/30"
                    : "bg-amber-700"
              } flex items-start justify-center pt-2`}
            >
              <span className="font-black text-black/70 text-sm tracking-widest">
                {place}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {others.length > 0 && (
        <div className="z-10 text-white/50 text-sm flex flex-wrap gap-2 justify-center max-w-2xl">
          {others.map((p) => (
            <span key={p.id} className="bg-white/5 rounded-full px-3 py-1">
              {p.name} — {bn(p.score)}
            </span>
          ))}
        </div>
      )}

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => socket.emit("host:resetLobby", () => {})}
        className="z-10 bg-yellow-400 text-black font-black text-xl px-8 py-3 rounded-xl shadow-xl"
      >
        আবার খেলুন
      </motion.button>
    </div>
  );
}
