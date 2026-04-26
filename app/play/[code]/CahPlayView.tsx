"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { useRouter } from "next/navigation";
import { BlackCard } from "@/components/BlackCard";
import { WhiteCard } from "@/components/WhiteCard";
import { Scoreboard } from "@/components/Scoreboard";
import { ReactionGif } from "@/components/ReactionGif";
import { PHRASES, pickPhrase } from "@/lib/funny-phrases";
import type { CahPlayerView } from "@/lib/types";

export function CahPlayView({
  view,
  socket,
  code,
}: {
  view: CahPlayerView;
  socket: Socket;
  code: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [submittedFor, setSubmittedFor] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Reset selection when the round/phase changes.
  useEffect(() => {
    if (view.room.phase !== "submitting") {
      setSelected([]);
      setSubmittedFor(null);
    }
  }, [view.room.phase, view.room.round]);

  const required = view.room.blackCard?.pick ?? 1;
  const isCzar = view.you.isCzar;
  const phase = view.room.phase;
  const mySubmission = view.room.submissions.find((s) => s.id === view.you.id);

  function toggleCard(id: number) {
    if (submittedFor !== null) return;
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id));
    } else {
      if (selected.length >= required) {
        setSelected([...selected.slice(1), id]);
      } else {
        setSelected([...selected, id]);
      }
    }
  }

  function submit() {
    if (!socket || selected.length !== required) return;
    setError("");
    const round = view.room.round;
    socket.emit(
      "player:submit",
      { cardIds: selected },
      (res: { ok?: boolean; error?: string }) => {
        if (res.error) {
          setError(res.error);
          return;
        }
        setSubmittedFor(round);
      }
    );
  }

  function pickWinner(playerId: string) {
    if (!socket) return;
    socket.emit("czar:pick", { winnerId: playerId }, () => {});
  }

  const round = view.room.round;

  return (
    <main className="min-h-dvh bangla pb-4">
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            রুম
          </div>
          <div className="font-mono font-bold tracking-widest">{code}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            আপনি
          </div>
          <div className="font-bold truncate max-w-[140px]">{view.you.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            পয়েন্ট
          </div>
          <div className="text-2xl font-black text-yellow-400">
            {view.you.score}
          </div>
        </div>
      </header>

      <div className="px-4 pt-4">
        {phase === "lobby" && <LobbyPhone view={view} />}
        {(phase === "submitting" ||
          phase === "judging" ||
          phase === "reveal") && (
          <>
            {view.room.blackCard && (
              <div className="flex justify-center mb-4">
                <BlackCard card={view.room.blackCard} size="md" />
              </div>
            )}
            {isCzar && phase === "submitting" && (
              <div className="text-center py-6 bg-yellow-400/10 rounded-2xl mx-2">
                <div className="text-3xl mb-1">👑</div>
                <div className="font-bold text-yellow-400">
                  আপনি এই রাউন্ডের ক্যাপ্টেন
                </div>
                <div className="text-sm text-white/60 mt-1">
                  {pickPhrase(PHRASES.czarWaiting, round)}
                </div>
              </div>
            )}
            {isCzar && phase === "judging" && (
              <CzarJudge view={view} onPick={pickWinner} />
            )}
            {!isCzar &&
              phase === "submitting" &&
              submittedFor === null &&
              !mySubmission && (
                <PhoneHand
                  view={view}
                  selected={selected}
                  required={required}
                  onToggle={toggleCard}
                  onSubmit={submit}
                  error={error}
                />
              )}
            {!isCzar &&
              phase === "submitting" &&
              (submittedFor !== null || mySubmission) && (
                <div className="text-center py-10 flex flex-col items-center gap-4">
                  <ReactionGif
                    moment="submit"
                    refreshKey={round}
                    fallbackEmoji="🤞"
                    size="sm"
                  />
                  <div className="text-white/60">
                    {pickPhrase(PHRASES.playerWaitingAfterSubmit, round)}
                  </div>
                </div>
              )}
            {!isCzar && phase === "judging" && (
              <div className="text-center py-10 flex flex-col items-center gap-4">
                <ReactionGif
                  moment="judging"
                  refreshKey={round}
                  fallbackEmoji="🤔"
                  size="sm"
                />
                <div className="text-white/60">
                  {pickPhrase(PHRASES.playerCzarJudging, round)}
                </div>
              </div>
            )}
            {phase === "reveal" && <RevealPhone view={view} />}
          </>
        )}
        {phase === "gameOver" && <GameOverPhone view={view} router={router} />}
      </div>

      <details className="mx-4 mt-4 bg-white/5 rounded-xl">
        <summary className="px-4 py-3 cursor-pointer text-sm text-white/70">
          স্কোরবোর্ড
        </summary>
        <div className="px-3 pb-3">
          <Scoreboard
            players={view.room.players}
            czarId={view.room.czarId}
            scoreToWin={view.room.scoreToWin}
            compact
          />
        </div>
      </details>
    </main>
  );
}

function LobbyPhone({ view }: { view: CahPlayerView }) {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">🪑</div>
      <div className="text-xl font-bold">লবিতে অপেক্ষা…</div>
      <div className="text-white/60 mt-2">
        {pickPhrase(PHRASES.playerLobby, view.room.code)}
      </div>
      <div className="mt-6 text-sm text-white/40">
        {view.room.players.length} জন প্লেয়ার রুমে আছে
      </div>
    </div>
  );
}

function PhoneHand({
  view,
  selected,
  required,
  onToggle,
  onSubmit,
  error,
}: {
  view: CahPlayerView;
  selected: number[];
  required: number;
  onToggle: (id: number) => void;
  onSubmit: () => void;
  error: string;
}) {
  return (
    <>
      <div className="text-center my-3">
        <div className="text-xs uppercase tracking-widest text-white/40">
          {required > 1 ? `${required}টা কার্ড বাছুন` : "একটা কার্ড বাছুন"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 pb-32">
        {view.you.hand.map((c) => {
          const idx = selected.indexOf(c.id);
          return (
            <div key={c.id} className="flex justify-center">
              <WhiteCard
                card={c}
                size="sm"
                selected={idx !== -1}
                selectedNumber={idx !== -1 && required > 1 ? idx + 1 : undefined}
                onClick={() => onToggle(c.id)}
              />
            </div>
          );
        })}
      </div>
      <div className="fixed bottom-0 inset-x-0 bg-gradient-to-t from-black via-black to-transparent pt-6 pb-4 px-4">
        {error && (
          <p className="text-red-400 text-sm text-center mb-2">{error}</p>
        )}
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={selected.length !== required}
          onClick={onSubmit}
          className="w-full bg-yellow-400 text-black font-black text-xl py-4 rounded-xl disabled:opacity-40"
        >
          জমা দিন ({selected.length}/{required})
        </motion.button>
      </div>
    </>
  );
}

function CzarJudge({
  view,
  onPick,
}: {
  view: CahPlayerView;
  onPick: (playerId: string) => void;
}) {
  return (
    <div className="pb-8">
      <div className="text-center bg-yellow-400/10 rounded-2xl py-3 mb-4">
        <div className="text-2xl">👑</div>
        <div className="font-bold text-yellow-400">আপনি বিজয়ী বাছবেন</div>
      </div>
      <div className="flex flex-col gap-4">
        {view.room.submissions.map((s) => (
          <motion.button
            key={s.id}
            whileTap={{ scale: 0.96 }}
            onClick={() => onPick(s.id)}
            className="bg-white text-black p-4 rounded-2xl text-left shadow-card"
          >
            {s.cards.map((c, i) => (
              <div
                key={c.id}
                className={i > 0 ? "mt-3 pt-3 border-t border-black/10" : ""}
              >
                {c.text}
              </div>
            ))}
            <div className="text-[10px] uppercase tracking-widest text-black/40 mt-3">
              বিজয়ী বানাতে ট্যাপ করুন
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function RevealPhone({ view }: { view: CahPlayerView }) {
  const w = view.room.winnerLastRound;
  const wonIt = w?.playerId === view.you.id;
  const round = view.room.round;
  return (
    <div className="text-center py-8 flex flex-col items-center">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring" }}
      >
        <div className="text-xs uppercase tracking-widest text-yellow-400">
          বিজয়ী
        </div>
        <div className="text-4xl font-black mt-1">{w?.playerName}</div>
        {wonIt && (
          <div className="text-yellow-400 font-black text-2xl mt-2">
            {pickPhrase(PHRASES.playerWonRound, round)}
          </div>
        )}
      </motion.div>
      <div className="mt-4">
        <ReactionGif
          moment={wonIt ? "winner" : "loser"}
          refreshKey={`${round}-${w?.playerId ?? ""}`}
          fallbackEmoji={wonIt ? "🎉" : "😩"}
          size="sm"
        />
      </div>
      <div className="mt-4 bg-white/5 rounded-xl p-4 w-full">
        {w?.cards.map((c) => (
          <div key={c.id} className="py-1 font-medium">
            "{c.text}"
          </div>
        ))}
      </div>
      <div className="text-sm text-white/40 mt-6">
        হোস্ট পরের রাউন্ড শুরু করবেন…
      </div>
    </div>
  );
}

function GameOverPhone({
  view,
  router,
}: {
  view: CahPlayerView;
  router: ReturnType<typeof useRouter>;
}) {
  const winner = [...view.room.players].sort((a, b) => b.score - a.score)[0];
  const wonIt = winner?.id === view.you.id;
  return (
    <div className="text-center py-12 flex flex-col items-center">
      <div className="text-xs uppercase tracking-widest text-yellow-400">
        খেলা শেষ
      </div>
      <div className="text-6xl font-black mt-2 bangla">{winner?.name}</div>
      <div className="text-yellow-400 text-2xl font-black mt-2">
        {pickPhrase(PHRASES.gameOverTitle, winner?.score)}
      </div>
      <div className="mt-4">
        <ReactionGif
          moment={wonIt ? "gameWin" : "loser"}
          refreshKey={winner?.id ?? "end"}
          fallbackEmoji={wonIt ? "🏆" : "💀"}
          size="md"
        />
      </div>
      <button
        onClick={() => router.push("/ay-nachi")}
        className="mt-8 bg-white/10 text-white px-6 py-3 rounded-xl"
      >
        হোম
      </button>
    </div>
  );
}
