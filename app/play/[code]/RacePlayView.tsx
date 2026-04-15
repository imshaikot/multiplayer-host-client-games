"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { RacePlayerView } from "@/lib/types";
import { audio } from "@/lib/audio";
import { RaceRunner, colorIndexFromName } from "@/components/RaceRunner";

// Mirrors useRaceCountdown on the Host display. Counts down from server-set
// startedAt; plays a tick on each numeric tick and a gong at GO. Phone-only
// difference: we don't need the GO! window to linger as long since input
// re-enables the moment startedAt is reached.
function useRaceCountdown(startedAt: number | null) {
  const [now, setNow] = useState<number>(() => Date.now());
  const lastPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 80);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return { active: false, phase: null as null | string };
  const msLeft = startedAt - now;
  const goWindowMs = 500;
  if (msLeft <= -goWindowMs) return { active: false, phase: null };

  let phase: "3" | "2" | "1" | "go";
  if (msLeft > 2000) phase = "3";
  else if (msLeft > 1000) phase = "2";
  else if (msLeft > 0) phase = "1";
  else phase = "go";

  if (lastPlayedRef.current !== phase) {
    lastPlayedRef.current = phase;
    if (phase === "go") audio.gong();
    else audio.tick();
  }
  return { active: true, phase };
}

export function RacePlayView({
  view,
  socket,
  code,
}: {
  view: RacePlayerView;
  socket: Socket;
  code: string;
}) {
  const phase = view.room.phase;

  return (
    <main className="min-h-dvh bangla pb-6">
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            room
          </div>
          <div className="font-mono font-bold tracking-widest">{code}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            you
          </div>
          <div className="font-bold truncate max-w-[140px]">
            {view.you.name}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            ✓ / ✗
          </div>
          <div className="text-lg font-black text-red-400 tabular-nums">
            {view.you.correctCount} / {view.you.fallCount}
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {phase === "lobby" && <RaceLobbyPhone view={view} />}
        {phase === "racing" && <RaceTyping view={view} socket={socket} />}
        {phase === "finished" && <RaceFinishPhone view={view} />}
      </div>
    </main>
  );
}

// ----- Lobby -----

function RaceLobbyPhone({ view }: { view: RacePlayerView }) {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">🏁</div>
      <div className="text-xl font-bold">in the lobby</div>
      <div className="text-white/60 mt-2">
        host স্টার্ট চাপলে রেস শুরু
      </div>
      <div className="mt-8 px-3 py-2 bg-white/5 rounded-xl inline-block">
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
          regler
        </div>
        <div className="text-sm text-white/80 leading-relaxed text-left max-w-xs">
          • ফোনে Banglish লেখা আসবে
          <br />
          • <span className="text-yellow-300">হুবহু</span> টাইপ করে enter দিন
          <br />
          • <span className="text-red-300">case sensitive</span>, কোনো ভুল চলবে না
          <br />
          • ভুল হলে পপাত
          <br />
          • 🍌 banana বোতাম Submit-এর মতোই — ঠিক হলে প্রতিবেশীকে ছুঁড়বেন, ভুল হলে নিজেই পড়বেন
          <br />
          • ১২০ সেকেন্ডে কে আগে?
        </div>
      </div>
      <div className="mt-6 text-sm text-white/40">
        {view.room.players.length} players in room
      </div>
    </div>
  );
}

// ----- Racing -----

function RaceTyping({
  view,
  socket,
}: {
  view: RacePlayerView;
  socket: Socket;
}) {
  const [text, setText] = useState("");
  const [shake, setShake] = useState(0);
  const [flash, setFlash] = useState<{ points: number; at: number } | null>(
    null
  );
  const [throwFlash, setThrowFlash] = useState<{
    name: string;
    at: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prompt = view.you.currentPrompt;
  const promptText = prompt?.text ?? "";
  const isFallen = view.you.state === "fallen";
  const isFinished = view.you.state === "finished";
  const targetName = view.you.bananaTargetName;
  const countdown = useRaceCountdown(view.room.startedAt);
  // While the 3-2-1 plays out, everyone is held at the start line server-side;
  // submit/throw stay disabled here so we never round-trip a guaranteed reject.
  const isCountingDown = countdown.active;

  // Clear text when prompt changes (correct submit rotates it server-side).
  useEffect(() => {
    setText("");
  }, [promptText]);

  // Blur the input while fallen so the mobile keyboard goes away (clear
  // signal that they should wait), refocus when they recover. iOS Safari
  // can be picky about programmatic focus after a gesture gap — best-effort.
  useEffect(() => {
    if (view.you.state === "fallen") {
      inputRef.current?.blur();
    } else if (view.you.state === "running") {
      inputRef.current?.focus();
    }
  }, [view.you.state]);

  // Countdown for the race-end timer on the player side.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!view.room.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [view.room.endsAt]);
  const remaining = view.room.endsAt
    ? Math.max(0, Math.ceil((view.room.endsAt - now) / 1000))
    : 0;

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text || isFallen || isFinished || isCountingDown) return;
    socket.emit(
      "player:submit",
      { text },
      (ack: {
        ok?: boolean;
        correct?: boolean;
        points?: number;
        finished?: boolean;
        position?: number;
        error?: string;
      }) => {
        if (ack.error) return;
        if (ack.correct) {
          setText("");
          if (ack.points) {
            setFlash({ points: ack.points, at: Date.now() });
            setTimeout(() => setFlash(null), 900);
          }
          audio.ding();
        } else {
          setText("");
          setShake((s) => s + 1);
          // Brief descending tone for the fall.
          audio.gong();
        }
      }
    );
  }

  // Throw a banana instead of submitting. Pressing banana is a full
  // commitment like Submit: the server checks the text and either lands
  // the peel (correct) or falls us (wrong). The button is intentionally
  // NOT gated on correctness — that would leak whether the text is right.
  function throwBanana() {
    if (!text || isFallen || isFinished || !targetName || isCountingDown)
      return;
    // Snapshot the target name now — by ack time our view has refreshed and
    // the adjacent leader may have changed.
    const thrownAt = targetName;
    socket.emit(
      "player:throwBanana",
      { text },
      (ack: {
        ok?: boolean;
        correct?: boolean;
        targetId?: string;
        error?: string;
      }) => {
        if (ack.error) return;
        if (ack.correct === false) {
          // Wrong text — we fell, same as a wrong Submit.
          setText("");
          setShake((s) => s + 1);
          audio.gong();
          return;
        }
        setText("");
        setThrowFlash({ name: thrownAt, at: Date.now() });
        setTimeout(() => setThrowFlash(null), 1200);
        audio.whoosh();
      }
    );
  }

  if (isFinished) {
    return (
      <FinishedTakeover position={view.you.finishPosition ?? 0} view={view} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest">
        <div className="text-white/40">টাইপ করুন</div>
        <div
          className={`tabular-nums font-black text-base ${
            remaining <= 10 ? "text-red-400" : "text-white/60"
          }`}
        >
          {remaining}s
        </div>
      </div>

      {/* Your runner — react to state in real time. */}
      <div
        className="flex items-end justify-center bg-gradient-to-b from-emerald-700/40 to-emerald-900/40 rounded-2xl ring-1 ring-emerald-300/20 py-4"
        style={{ minHeight: 140 }}
      >
        <RaceRunner
          colorIndex={colorIndexFromName(view.you.name)}
          // Stand still during the 3-2-1 — server holds progress at 0, but
          // the sprite would otherwise play its run cycle in place.
          state={isCountingDown ? "idle" : view.you.state}
          size={88}
        />
      </div>

      {/* Countdown banner — visible only during the 3-2-1. The prompt
          stays rendered below so players can pre-read while input is
          locked. */}
      <AnimatePresence>
        {countdown.active && countdown.phase && (
          <motion.div
            key={`countdown-${countdown.phase}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className={`flex items-center justify-center font-black tabular-nums leading-none ${
              countdown.phase === "go"
                ? "text-yellow-300 text-7xl"
                : "text-white text-8xl"
            }`}
          >
            {countdown.phase === "go" ? "GO!" : countdown.phase}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prompt */}
      <motion.div
        key={`prompt-${promptText}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onContextMenu={(e) => e.preventDefault()}
        className="bg-white text-black rounded-2xl p-5 shadow-xl select-none"
      >
        <div className="text-[10px] uppercase tracking-[0.3em] text-black/40 mb-2">
          এটা হুবহু লিখুন (case-sensitive)
        </div>
        <div className="font-mono text-2xl font-black leading-snug break-words select-none">
          {promptText || "…"}
        </div>
        <div className="mt-3 inline-block bg-red-400/90 text-black text-xs font-black px-2 py-1 rounded-full">
          +{prompt?.score ?? 0} boost
        </div>
      </motion.div>

      {/* Recovery bar — visible while fallen. Keyed on fallUntil so it
          restarts cleanly for each new fall. Duration is computed from
          fallUntil + Date.now() so it stays accurate even if the bar mounts
          a beat after the fall starts (e.g. broadcast latency). */}
      <AnimatePresence>
        {isFallen && view.you.fallUntil && (
          <motion.div
            key={`fall-${view.you.fallUntil}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-xs text-red-200 -mt-1"
          >
            <span className="uppercase tracking-widest font-bold">
              💥 অপেক্ষা…
            </span>
            <div className="flex-1 h-1.5 bg-red-500/20 rounded-full overflow-hidden">
              <motion.div
                key={`fall-bar-${view.you.fallUntil}`}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{
                  duration: Math.max(
                    0,
                    (view.you.fallUntil - Date.now()) / 1000
                  ),
                  ease: "linear",
                }}
                className="h-full bg-red-400 origin-left rounded-full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incoming banana warning — peel is in flight from another player. */}
      <IncomingBananaBanner
        incomingAt={view.you.incomingBananaAt}
        fromName={view.you.bananaFromName}
      />

      {/* Input */}
      <motion.form
        key={`shake-${shake}`}
        onSubmit={submit}
        animate={
          shake
            ? { x: [0, -8, 8, -6, 6, -3, 3, 0] }
            : { x: 0 }
        }
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-2"
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Anti-cheat: disallow paste/copy/cut so players can't shortcut by
          // copying the prompt into the input or sharing typed text. The
          // browser's context menu (long-press on iOS) would surface paste,
          // so block that too.
          onPaste={(e) => e.preventDefault()}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          disabled={isFallen || isCountingDown}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          inputMode="text"
          placeholder={
            isCountingDown
              ? "প্রস্তুত…"
              : isFallen
                ? "💥 পপাত…"
                : "এখানে টাইপ করুন"
          }
          className={`w-full font-mono text-xl px-4 py-4 rounded-xl outline-none ${
            isFallen
              ? "bg-red-500/10 text-red-200 ring-2 ring-red-500/50"
              : "bg-white/10 text-white focus:bg-white/20"
          }`}
        />
        <div className="flex gap-2">
          <motion.button
            type="submit"
            whileTap={!isFallen && !isCountingDown && text ? { scale: 0.96 } : {}}
            disabled={isFallen || isCountingDown || !text}
            className="flex-1 bg-red-400 text-black font-black text-lg py-3 rounded-xl disabled:opacity-40"
          >
            {isCountingDown ? "প্রস্তুত…" : isFallen ? "অপেক্ষা…" : "Submit"}
          </motion.button>
          <BananaThrowButton
            // Enabled whenever there's text + a target — NOT gated on
            // correctness, so it never hints whether the text is right.
            disabled={
              isFallen ||
              isFinished ||
              isCountingDown ||
              !targetName ||
              !text
            }
            targetName={targetName}
            onClick={throwBanana}
          />
        </div>
      </motion.form>

      <AnimatePresence>
        {throwFlash && (
          <motion.div
            key={throwFlash.at}
            initial={{ opacity: 0, y: 10, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center text-base font-black text-yellow-300"
          >
            🍌 {throwFlash.name}-কে ছুঁড়ে দিলেন!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boost flash */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.at}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center text-3xl font-black text-green-300"
          >
            +{flash.points} 🚀
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mini leaderboard so the player sees their relative position */}
      <MiniLeaderboard view={view} />
    </div>
  );
}

function BananaThrowButton({
  disabled,
  targetName,
  onClick,
}: {
  disabled: boolean;
  targetName: string | null;
  onClick: () => void;
}) {
  // Two states only — enabled (bright) / disabled (dim). Deliberately NOT
  // tied to text correctness: a correctness-driven pulse or color would
  // give away whether the typed sentence is right.
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.92, rotate: -8 } : {}}
      title={
        disabled
          ? targetName
            ? "লিখে তারপর ছুঁড়ুন"
            : "কাছাকাছি কেউ নেই"
          : `${targetName}-কে ছুঁড়ুন (ভুল হলে আপনি পড়বেন)`
      }
      className={`relative w-16 h-[60px] rounded-xl flex items-center justify-center ${
        disabled
          ? "bg-yellow-300/20 ring-1 ring-yellow-200/30 opacity-40"
          : "bg-yellow-300 ring-2 ring-yellow-200"
      }`}
    >
      <img
        src="/banana-peel.png"
        alt="banana"
        className="w-9 h-9 object-contain pointer-events-none select-none drop-shadow"
        draggable={false}
      />
      {targetName && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-yellow-200 font-bold truncate max-w-[90px]">
          → {targetName}
        </div>
      )}
    </motion.button>
  );
}

function IncomingBananaBanner({
  incomingAt,
  fromName,
}: {
  incomingAt: number | null;
  fromName: string | null;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!incomingAt) return;
    const id = setInterval(() => setNow(Date.now()), 60);
    return () => clearInterval(id);
  }, [incomingAt]);
  if (!incomingAt) return null;
  const msLeft = Math.max(0, incomingAt - now);
  const ratio = Math.min(1, msLeft / 1000);
  return (
    <motion.div
      key={`incoming-${incomingAt}`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="bg-yellow-300/15 ring-2 ring-yellow-300/60 rounded-xl px-3 py-2 flex items-center gap-3"
    >
      <img
        src="/banana-peel.png"
        alt="banana"
        className="w-8 h-8 object-contain pointer-events-none select-none drop-shadow"
        draggable={false}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-yellow-200 font-bold">
          কলার বরা আসছে!
        </div>
        <div className="text-xs text-white/70 truncate">
          {fromName ? `${fromName} ছুঁড়েছে — পড়তে যাচ্ছেন!` : "পড়তে যাচ্ছেন!"}
        </div>
        <div className="mt-1 h-1 bg-yellow-300/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-300 rounded-full"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function MiniLeaderboard({ view }: { view: RacePlayerView }) {
  const meId = view.you.id;
  const ordered = [...view.room.players].sort(
    (a, b) => b.progress - a.progress
  );
  return (
    <div className="mt-4 bg-white/5 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
        leaderboard
      </div>
      <div className="flex flex-col gap-1">
        {ordered.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between text-sm px-2 py-1 rounded ${
              p.id === meId ? "bg-red-400/20" : ""
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate font-bold">
                {p.name}
                {p.id === meId && " (you)"}
              </span>
              {p.state === "fallen" && <span>💥</span>}
              {p.state === "finished" && p.finishPosition === 1 && (
                <span>🥇</span>
              )}
              {p.state === "finished" &&
                p.finishPosition &&
                p.finishPosition > 1 && (
                  <span className="text-white/50 text-xs">
                    #{p.finishPosition}
                  </span>
                )}
            </div>
            <div className="text-white/60 tabular-nums text-xs">
              {Math.floor(p.progress)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Player has finished but the race is still going — keep them on the screen
// with their position, not idle.
function FinishedTakeover({
  position,
  view,
}: {
  position: number;
  view: RacePlayerView;
}) {
  return (
    <div className="text-center py-10 flex flex-col items-center gap-3">
      <div className="text-6xl">
        {position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : "🏁"}
      </div>
      <div className="text-xs uppercase tracking-[0.3em] text-red-300">
        আপনি শেষ করেছেন
      </div>
      <div className="text-5xl font-black">{position}</div>
      <div className="text-white/60 text-sm">
        {view.you.correctCount} prompts · {view.you.fallCount} falls
      </div>
      <div className="text-white/40 text-xs mt-2">
        বাকিদের জন্য অপেক্ষা…
      </div>
      <MiniLeaderboard view={view} />
    </div>
  );
}

// ----- Finished phase -----

function RaceFinishPhone({ view }: { view: RacePlayerView }) {
  const me = view.room.finishOrder.find((f) => f.playerId === view.you.id);
  return (
    <div className="text-center py-8 flex flex-col items-center gap-4">
      <div className="text-7xl">
        {me?.position === 1
          ? "🥇"
          : me?.position === 2
            ? "🥈"
            : me?.position === 3
              ? "🥉"
              : "🏁"}
      </div>
      <div className="text-xs uppercase tracking-[0.3em] text-red-300">
        race over
      </div>
      {me ? (
        <div className="text-5xl font-black">#{me.position}</div>
      ) : (
        <div className="text-2xl font-bold text-white/60">finished</div>
      )}
      <div className="text-white/60">
        {view.you.correctCount} prompts · {view.you.fallCount} falls
      </div>

      <div className="w-full max-w-md mt-4">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-2">
          final standings
        </div>
        <div className="flex flex-col gap-2">
          {view.room.finishOrder.map((f) => (
            <div
              key={f.playerId}
              className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                f.playerId === view.you.id
                  ? "bg-red-400/20 ring-1 ring-red-400/50"
                  : "bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-black tabular-nums w-6 text-right">
                  {f.position}
                </span>
                <span className="font-bold truncate">{f.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
