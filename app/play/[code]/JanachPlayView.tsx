"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useRouter } from "next/navigation";
import type { JanachPlayerView, JanachWord } from "@/lib/types";
import { JanachCanvas } from "@/components/JanachCanvas";

export function JanachPlayView({
  view,
  socket,
  code,
}: {
  view: JanachPlayerView;
  socket: Socket;
  code: string;
}) {
  const router = useRouter();
  const phase = view.room.phase;
  const round = view.room.round;
  const isDrawer = view.you.isDrawer;

  return (
    <main className="min-h-dvh bangla pb-4">
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
            {view.you.name} {isDrawer && "🎨"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            score
          </div>
          <div className="text-2xl font-black text-pink-400">
            {view.you.score}
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {phase === "lobby" && <JanachLobbyPhone view={view} />}

        {phase === "choosing" && isDrawer && view.you.wordOptions && (
          <DrawerWordPicker
            options={view.you.wordOptions}
            chooseEndsAt={view.room.chooseEndsAt}
            onPick={(idx) =>
              socket.emit("drawer:pickWord", { optionIndex: idx }, () => {})
            }
          />
        )}
        {phase === "choosing" && !isDrawer && (
          <WaitingForDrawer view={view} />
        )}

        {phase === "drawing" && isDrawer && view.you.secretWord && (
          <DrawerSurface
            view={view}
            socket={socket}
            word={view.you.secretWord}
            roundKey={`${round}-drawing`}
          />
        )}
        {phase === "drawing" && !isDrawer && (
          <GuesserSurface
            view={view}
            socket={socket}
            roundKey={`${round}-drawing`}
          />
        )}

        {phase === "reveal" && <RevealPhone view={view} socket={socket} />}

        {phase === "gameOver" && (
          <GameOverPhone view={view} router={router} />
        )}
      </div>
    </main>
  );
}

// ----- Lobby -----

function JanachLobbyPhone({ view }: { view: JanachPlayerView }) {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">🎨</div>
      <div className="text-xl font-bold">in the lobby</div>
      <div className="text-white/60 mt-2">
        host will start the game when everyone's in
      </div>
      <div className="mt-6 text-sm text-white/40">
        {view.room.players.length} players in room
      </div>
    </div>
  );
}

// ----- Choosing phase -----

function DrawerWordPicker({
  options,
  onPick,
  chooseEndsAt,
}: {
  options: JanachWord[];
  onPick: (idx: number) => void;
  chooseEndsAt: number | null;
}) {
  return (
    <div className="flex flex-col gap-3 pt-8">
      <div className="text-center mb-2 flex flex-col items-center gap-3">
        <div className="text-xs uppercase tracking-[0.3em] text-pink-400">
          your turn to draw
        </div>
        <div className="text-lg text-white/70">pick one to draw</div>
        <CountdownChip endsAt={chooseEndsAt} />
        <div className="text-[10px] text-white/40">
          auto-picks the first one if you wait too long
        </div>
      </div>
      {options.map((w, i) => (
        <motion.button
          key={i}
          whileTap={{ scale: 0.96 }}
          onClick={() => onPick(i)}
          className="bg-white text-black p-4 rounded-2xl text-left shadow-card"
        >
          <div className="text-2xl font-black">{w.word}</div>
          {w.modifier && (
            <div className="text-base italic text-black/60 mt-1">
              {w.modifier}
            </div>
          )}
        </motion.button>
      ))}
      <div className="text-center text-white/40 text-xs mt-2">
        guessers only need to type the first word
      </div>
    </div>
  );
}

function WaitingForDrawer({ view }: { view: JanachPlayerView }) {
  const drawer = view.room.players.find((p) => p.id === view.room.drawerId);
  return (
    <div className="text-center py-16">
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.4, repeat: Infinity }}
        className="text-5xl mb-4"
      >
        🎨
      </motion.div>
      <div className="text-xl font-bold">{drawer?.name} is picking…</div>
      <div className="text-white/40 mt-2">drawing about to start</div>
    </div>
  );
}

// ----- Drawing phase: drawer -----

function CountdownChip({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return null;
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const hot = remaining <= 10;
  return (
    <motion.div
      animate={hot ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={hot ? { duration: 0.5, repeat: Infinity } : { duration: 0.2 }}
      className={`text-3xl font-black tabular-nums px-3 py-1 rounded-xl ${
        hot
          ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60"
          : "bg-white/10 text-white"
      }`}
    >
      {remaining}s
    </motion.div>
  );
}

function DrawerSurface({
  view,
  socket,
  word,
  roundKey,
}: {
  view: JanachPlayerView;
  socket: Socket;
  word: JanachWord;
  roundKey: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 bg-pink-400/10 ring-1 ring-pink-400/30 rounded-2xl p-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-pink-300 leading-none">
            draw this
          </div>
          <div className="font-black text-2xl truncate">{word.word}</div>
          {word.modifier && (
            <div className="italic text-white/60 text-sm truncate">
              {word.modifier}
            </div>
          )}
        </div>
        <CountdownChip endsAt={view.room.roundEndsAt} />
      </div>
      <JanachCanvas mode="drawer" socket={socket} resetKey={roundKey} />
      <div className="text-center text-xs text-white/40">
        guessers see the masked word only — keep drawing!
      </div>
    </div>
  );
}

// ----- Drawing phase: guesser -----

function GuesserSurface({
  view,
  socket,
  roundKey,
}: {
  view: JanachPlayerView;
  socket: Socket;
  roundKey: string;
}) {
  const drawer = view.room.players.find((p) => p.id === view.room.drawerId);
  const hasGuessed = view.you.hasGuessedCorrectly;
  const sittingOut = view.you.sittingOut;
  const myCorrect = view.room.correctGuessers.find(
    (g) => g.playerId === view.you.id
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 bg-white/5 rounded-2xl p-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 leading-none">
            🎨 {drawer?.name} is drawing
          </div>
          <div className="font-black text-3xl tabular-nums tracking-[0.3em] uppercase mt-1">
            {view.room.wordMask || "?"}
          </div>
          <div className="text-[10px] text-white/40">
            {view.room.wordLength} letters
          </div>
        </div>
        <CountdownChip endsAt={view.room.roundEndsAt} />
      </div>

      <JanachCanvas mode="viewer" socket={socket} resetKey={roundKey} />

      {sittingOut ? (
        <div className="bg-yellow-400/10 ring-1 ring-yellow-400/30 rounded-2xl p-4 text-center">
          <div className="text-yellow-200 font-black text-lg">
            👋 you're in!
          </div>
          <div className="text-yellow-200/70 text-sm mt-1">
            watch this round — you start guessing next round
          </div>
        </div>
      ) : hasGuessed ? (
        <div className="bg-green-500/15 ring-1 ring-green-400/30 rounded-2xl p-4 text-center">
          <div className="text-green-200 font-black text-lg">
            ✓ got it! +{myCorrect?.points ?? 0}
          </div>
          <div className="text-green-200/60 text-sm mt-1">
            waiting for everyone else…
          </div>
        </div>
      ) : (
        <GuessInput socket={socket} round={view.room.round} />
      )}

      <ChatFeed view={view} />
    </div>
  );
}

function GuessInput({ socket, round }: { socket: Socket; round: number }) {
  const [text, setText] = useState("");
  const [shake, setShake] = useState(false);
  const [closeMiss, setCloseMiss] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Clear field when round changes.
  useEffect(() => {
    setText("");
    setShake(false);
    setCloseMiss(false);
  }, [round]);

  function submit() {
    const t = text.trim();
    if (!t) return;
    socket.emit(
      "player:guess",
      { text: t },
      (res: {
        ok?: boolean;
        correct?: boolean;
        close?: boolean;
        error?: string;
      }) => {
        if (res.error) return;
        if (res.correct) {
          setText("");
          if (res.close) setCloseMiss(true);
        } else {
          setShake(true);
          setText("");
          setTimeout(() => setShake(false), 400);
        }
      }
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {closeMiss && (
        <div className="text-xs text-amber-300 text-center">
          close spelling — half points!
        </div>
      )}
      <motion.div
        animate={shake ? { x: [-6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.3 }}
        className="flex gap-2"
      >
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="type your guess…"
        maxLength={40}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        className="flex-1 bg-white/10 rounded-xl px-4 py-3 outline-none focus:bg-white/20 text-lg lowercase"
      />
      <motion.button
        whileTap={{ scale: 0.95 }}
        disabled={!text.trim()}
        onClick={submit}
        className="bg-pink-400 text-black font-black px-5 rounded-xl disabled:opacity-40"
      >
        guess
      </motion.button>
      </motion.div>
    </div>
  );
}

function ChatFeed({ view }: { view: JanachPlayerView }) {
  const items: { key: string; text: string; kind: "right" | "wrong" }[] = [];
  for (const g of view.room.correctGuessers) {
    items.push({
      key: `r-${g.playerId}`,
      text: `✓ ${g.playerName} got it (+${g.points})${g.close ? " ~close" : ""}`,
      kind: "right",
    });
  }
  for (const g of view.room.guessLog.slice(-8)) {
    items.push({
      key: `w-${g.ts}-${g.playerId}`,
      text: `${g.playerName}: ${g.text}`,
      kind: "wrong",
    });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 max-h-[180px] overflow-hidden bg-white/5 rounded-xl p-2">
      {items.map((it) => (
        <div
          key={it.key}
          className={`text-xs px-2 py-1 rounded ${
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

// ----- Reveal phase -----

function RevealPhone({
  view,
  socket,
}: {
  view: JanachPlayerView;
  socket: Socket;
}) {
  const r = view.room.roundResults;
  const myCorrect = r?.correctGuessers.find(
    (g) => g.playerId === view.you.id
  );
  return (
    <div className="text-center py-8 flex flex-col items-center gap-4">
      <div className="text-xs uppercase tracking-widest text-pink-400">
        {r?.reason === "drawerLeft"
          ? "drawer left"
          : r?.reason === "complete"
            ? "everyone got it!"
            : "time's up"}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40">
          the word was
        </div>
        <div className="text-5xl font-black uppercase tracking-wider">
          {r?.word?.word ?? "?"}
        </div>
        {r?.word?.modifier && (
          <div className="text-base italic text-white/60 mt-1">
            {r.word.modifier}
          </div>
        )}
      </div>
      {myCorrect && (
        <div className="bg-green-500/15 ring-1 ring-green-400/30 rounded-2xl px-5 py-3">
          <div className="text-green-200 font-black text-lg">
            ✓ +{myCorrect.points}
          </div>
        </div>
      )}
      {!myCorrect && view.you.isDrawer && (r?.drawerPoints ?? 0) > 0 && (
        <div className="bg-pink-400/15 ring-1 ring-pink-400/30 rounded-2xl px-5 py-3">
          <div className="text-pink-200 font-black text-lg">
            🎨 +{r?.drawerPoints} (artist bonus)
          </div>
        </div>
      )}
      <div className="text-sm text-white/40 mt-4">
        host will start the next round…
      </div>
    </div>
  );
}

function GameOverPhone({
  view,
  router,
}: {
  view: JanachPlayerView;
  router: ReturnType<typeof useRouter>;
}) {
  const sorted = [...view.room.players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter((p) => p.score === topScore);
  const tied = winners.length > 1;
  const wonIt = winners.some((w) => w.id === view.you.id);
  return (
    <div className="text-center py-12 flex flex-col items-center">
      <div className="text-xs uppercase tracking-widest text-pink-400">
        {tied ? "tied!" : "game over"}
      </div>
      {tied ? (
        <div className="flex flex-col items-center mt-2 gap-1">
          {winners.map((w) => (
            <div key={w.id} className="text-4xl font-black bangla">
              {w.name}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-6xl font-black mt-2 bangla">
          {winners[0]?.name}
        </div>
      )}
      <div className="text-pink-300 text-2xl font-black mt-2">
        🏆 {topScore} points
      </div>
      {wonIt && (
        <div className="text-pink-300 mt-2">
          {tied ? "🎉 you tied for first!" : "🎉 you won!"}
        </div>
      )}
      <button
        onClick={() => router.push("/ay-nachi")}
        className="mt-8 bg-white/10 text-white px-6 py-3 rounded-xl"
      >
        home
      </button>
    </div>
  );
}
