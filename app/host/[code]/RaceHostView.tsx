"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Socket } from "socket.io-client";
import type {
  RaceLanePublic,
  RacePublicRoomState,
} from "@/lib/types";
import { audio } from "@/lib/audio";
import { RaceRunner, colorIndexFromName } from "@/components/RaceRunner";
import { Avatar, RoomCornerChip, bn } from "./hostUiShared";

const MAX_LANES = 12;

// Mirrors server-side currentExtrapolated. The Host display renders 60fps off of
// this, anchored on the last broadcast.
function extrapolate(
  lane: RaceLanePublic,
  trackLength: number,
  baselineRate: number,
  now: number
): number {
  if (lane.state === "finished") return trackLength;
  if (lane.state === "fallen") return lane.progress;
  if (lane.state === "running") {
    const elapsed = Math.max(0, now - lane.progressAt) / 1000;
    return Math.min(trackLength, lane.progress + baselineRate * elapsed);
  }
  return lane.progress;
}

// Reads room.startedAt (a wall-clock timestamp the server sets to
// Date.now() + COUNTDOWN_MS at startRace) and returns:
//   - secondsLeft: 3..1 while waiting, 0 at GO!
//   - active: true while we're still inside the countdown window
//   - phase: "3" | "2" | "1" | "go" | null — drives which label renders
// Plays a tick on each numeric tick and a gong on GO. Idempotent: re-renders
// don't re-fire the same audio cue.
function useRaceCountdown(startedAt: number | null) {
  const [now, setNow] = useState<number>(() => Date.now());
  const lastPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 80);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) {
    return { active: false, secondsLeft: 0, phase: null as null | string };
  }
  const msLeft = startedAt - now;
  // Show "GO!" for ~600ms after the start so it doesn't blink off instantly.
  const goWindowMs = 600;
  if (msLeft <= -goWindowMs) {
    return { active: false, secondsLeft: 0, phase: null };
  }
  let phase: "3" | "2" | "1" | "go";
  if (msLeft > 2000) phase = "3";
  else if (msLeft > 1000) phase = "2";
  else if (msLeft > 0) phase = "1";
  else phase = "go";

  // Fire one audio cue per phase transition (lastPlayedRef de-dupes).
  if (lastPlayedRef.current !== phase) {
    lastPlayedRef.current = phase;
    if (phase === "go") audio.gong();
    else audio.tick();
  }

  const secondsLeft =
    phase === "3" ? 3 : phase === "2" ? 2 : phase === "1" ? 1 : 0;
  return { active: true, secondsLeft, phase };
}

// Pure presentational — the hook is lifted to RaceTrack so it's called once
// (it has audio side effects and drives the runner's idle/run state too).
function CountdownOverlay({
  active,
  phase,
}: {
  active: boolean;
  phase: string | null;
}) {
  return (
    <AnimatePresence>
      {active && phase && (
        <motion.div
          key={phase}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.6, opacity: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
        >
          <div
            className={`font-black tabular-nums ${
              phase === "go"
                ? "text-yellow-300 text-[14rem] leading-none drop-shadow-[0_0_30px_rgba(250,204,21,0.6)]"
                : "text-white text-[16rem] leading-none drop-shadow-[0_0_24px_rgba(255,255,255,0.4)]"
            }`}
          >
            {phase === "go" ? "GO!" : phase}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Banana peel sitting on the lane awaiting the runner. Position is locked
// at throw time (incomingBananaProgress on the server), so no rAF needed —
// just animate the drop and an exit. Mirrors the same 6%→96% travel as the
// runner sprite for visual alignment.
function BananaPeelDrop({
  incomingBananaAt,
  progress,
  trackLength,
}: {
  incomingBananaAt: number | null;
  progress: number | null;
  trackLength: number;
}) {
  return (
    <AnimatePresence>
      {incomingBananaAt && progress !== null && (
        <motion.div
          key={`peel-${incomingBananaAt}`}
          initial={{ opacity: 0, y: -40, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.4, rotate: 60, y: -10 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="absolute top-1/2 pointer-events-none"
          style={{
            left: `${6 + Math.min(1, progress / trackLength) * 90}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <img
            src="/banana-peel.png"
            alt=""
            className="w-9 h-9 object-contain drop-shadow"
            draggable={false}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function RaceHostView({
  state,
  joinUrl,
  socket,
}: {
  state: RacePublicRoomState;
  joinUrl: string;
  socket: Socket;
}) {
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    // Gong is now played when the 3-2-1 countdown ends (see CountdownOverlay),
    // not when phase first transitions to racing — which is the START of the
    // countdown, not the actual GO! moment.
    if (prev !== "finished" && state.phase === "finished") audio.fanfare();
    prevPhaseRef.current = state.phase;
  }, [state.phase]);

  return (
    <>
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-black tracking-tighter">
          আঙুলের <span className="text-red-400">দৌড়</span>
        </h1>
        {(state.phase === "racing" || state.phase === "finished") && (
          <div className="flex items-center gap-8">
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-white/40">
                প্লেয়ার
              </div>
              <div className="text-2xl font-black tabular-nums">
                {bn(state.players.length)}
              </div>
            </div>
          </div>
        )}
      </header>

      {state.phase === "lobby" && (
        <RaceLobby state={state} joinUrl={joinUrl} socket={socket} />
      )}
      {state.phase === "racing" && <RaceTrack state={state} />}
      {state.phase === "finished" && (
        <RaceFinished state={state} socket={socket} />
      )}

      {(state.phase === "racing" || state.phase === "finished") && (
        <RoomCornerChip code={state.code} joinUrl={joinUrl} />
      )}
    </>
  );
}

// ---------------- Lobby ----------------

function RaceLobby({
  state,
  joinUrl,
  socket,
}: {
  state: RacePublicRoomState;
  joinUrl: string;
  socket: Socket;
}) {
  const empties = Math.max(0, 2 - state.players.length);
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
          <div className="text-[10rem] leading-none font-black tracking-[0.15em] text-red-400">
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
              QR স্ক্যান করুন। লিংক খুললে কোড অটো ভরে যাবে।
            </div>
          </div>
        </div>

        <RaceHowTo />
      </div>

      <div className="flex flex-col gap-5">
        <div className="bg-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest text-white/40">
              প্লেয়ার ({bn(state.players.length)}/{bn(MAX_LANES)})
            </div>
            <div className="text-xs uppercase tracking-widest text-white/40">
              ১২০ সেকেন্ড টাইপ রেস
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
          whileHover={state.players.length >= 2 ? { scale: 1.03 } : {}}
          whileTap={state.players.length >= 2 ? { scale: 0.97 } : {}}
          animate={
            state.players.length >= 2
              ? {
                  boxShadow: [
                    "0 0 0 0 rgba(248,113,113,0.4)",
                    "0 0 0 16px rgba(248,113,113,0)",
                  ],
                }
              : {}
          }
          transition={{ duration: 1.6, repeat: Infinity }}
          disabled={state.players.length < 2}
          onClick={() => socket.emit("host:startRace", () => {})}
          className="bg-red-400 text-black font-black text-3xl px-8 py-5 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.players.length < 2
            ? `আরও ${bn(2 - state.players.length)} জন লাগবে`
            : "Start race →"}
        </motion.button>
      </div>
    </div>
  );
}

function RaceHowTo() {
  const steps = [
    { n: "১", t: "ফোন থেকে জয়েন", d: "QR বা কোড দিয়ে।" },
    { n: "২", t: "টাইপ করুন", d: "ফোনে আসা Banglish লেখাটা হুবহু লিখুন।" },
    { n: "৩", t: "জিতুন", d: "১২০ সেকেন্ডে যে আগে পৌঁছাবে সে বিজয়ী।" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xl mt-2">
      {steps.map((s) => (
        <div
          key={s.n}
          className="bg-white/5 rounded-xl p-3 ring-1 ring-white/5"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-red-400 text-black flex items-center justify-center font-black text-sm">
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

// ---------------- Race track ----------------

function RaceTrack({ state }: { state: RacePublicRoomState }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const avatarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const countdown = useRaceCountdown(state.startedAt);
  const lanesRef = useRef<RaceLanePublic[]>(state.players);
  const trackParamsRef = useRef({
    trackLength: state.trackLength,
    baselineRate: state.baselineRate,
  });

  // Keep refs in sync with the latest broadcast — the rAF loop reads from refs
  // so it doesn't restart on every re-render.
  useEffect(() => {
    lanesRef.current = state.players;
    trackParamsRef.current = {
      trackLength: state.trackLength,
      baselineRate: state.baselineRate,
    };
  }, [state.players, state.trackLength, state.baselineRate]);

  // One rAF loop drives every lane's horizontal position. The runner sprite
  // owns its own visual state (running cycle + fallen tilt) internally —
  // this loop only writes `left` so we don't double-transform.
  //
  // `left` is a percentage of the parent (the lane), unlike `transform:
  // translate(%)` which is a percentage of the element itself. Using `left`
  // gives the full lane-width travel range we actually want.
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const now = Date.now();
      const { trackLength, baselineRate } = trackParamsRef.current;
      for (const lane of lanesRef.current) {
        const el = avatarRefs.current.get(lane.id);
        if (!el) continue;
        const ext = extrapolate(lane, trackLength, baselineRate, now);
        const ratio = Math.min(1, ext / trackLength);
        // Travel from 6% (just past the start line + lane number) to 96%
        // (just inside the checkered finish band). Centering on the anchor
        // is done via a static `transform: translate(-50%, -50%)` in CSS.
        el.style.left = `${6 + ratio * 90}%`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Final-10-second metronome on the Host display.
  const tenSecCountdownRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state.endsAt) return;
    const id = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil(((state.endsAt as number) - Date.now()) / 1000)
      );
      if (
        remaining > 0 &&
        remaining <= 10 &&
        tenSecCountdownRef.current !== remaining
      ) {
        audio.tick();
        tenSecCountdownRef.current = remaining;
      }
    }, 250);
    return () => clearInterval(id);
  }, [state.endsAt]);

  // Leader-change ding (debounced) — picks the lane with the highest
  // extrapolated progress and dings when it changes.
  const lastLeaderRef = useRef<string | null>(null);
  const lastLeaderChangeRef = useRef<number>(0);
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const { trackLength, baselineRate } = trackParamsRef.current;
      let leaderId: string | null = null;
      let leaderExt = -1;
      for (const lane of lanesRef.current) {
        const ext = extrapolate(lane, trackLength, baselineRate, now);
        if (ext > leaderExt) {
          leaderExt = ext;
          leaderId = lane.id;
        }
      }
      if (
        leaderId &&
        leaderId !== lastLeaderRef.current &&
        now - lastLeaderChangeRef.current > 1500 &&
        leaderExt > 5
      ) {
        // Skip the very first assignment (no prior leader) and tiny progress.
        if (lastLeaderRef.current !== null) audio.ding();
        lastLeaderRef.current = leaderId;
        lastLeaderChangeRef.current = now;
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  const leaderId = useLeaderId(state);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 min-h-[calc(100dvh-120px)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] px-2">
          <span className="text-white/40">start</span>
          <span className="text-yellow-300">finish line →</span>
        </div>
        <div
          ref={trackRef}
          className="relative grid gap-2 h-[78vh] rounded-2xl p-3 overflow-hidden ring-1 ring-emerald-300/20"
          style={{
            gridTemplateRows: `repeat(${MAX_LANES}, minmax(0, 1fr))`,
            // Layered backgrounds (top-to-bottom in stack order):
            //   1. faint dark vignette at the edges for readability of text
            //   2. tiled grass photo
            backgroundImage: [
              "linear-gradient(to right, rgba(0,0,0,0.32), rgba(0,0,0,0.08) 25%, rgba(0,0,0,0.08) 75%, rgba(0,0,0,0.32))",
              "url(/grass.jpeg)",
            ].join(", "),
            backgroundSize: "100% 100%, 192px 192px",
            backgroundRepeat: "no-repeat, repeat",
          }}
        >
          {/* Checkered finish band on the right */}
          <div
            className="absolute top-3 bottom-3 right-3 w-2 rounded-sm pointer-events-none ring-1 ring-black/40"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, #fde047 0 12px, #111 12px 24px)",
            }}
          />
          {/* Start line on the left */}
          <div className="absolute top-3 bottom-3 left-3 w-[3px] bg-white/70 rounded-full pointer-events-none" />

          <CountdownOverlay active={countdown.active} phase={countdown.phase} />
          {Array.from({ length: MAX_LANES }).map((_, i) => {
            const lane = state.players[i];
            const empty = !lane;
            return (
              <div
                key={i}
                className={`relative rounded-xl ${
                  empty
                    ? "bg-emerald-900/30 ring-1 ring-emerald-700/20"
                    : "bg-emerald-500/10 ring-1 ring-emerald-300/25"
                }`}
              >
                {/* Lane number on the far left of the strip */}
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-100/60 font-black tabular-nums">
                  {bn(i + 1)}
                </div>

                {/* Banana peel — sits at a fixed track position the runner
                    walks into. Keyed on incomingBananaAt so each fresh
                    throw replays the drop animation. The element unmounts
                    when the server clears incomingBananaAt (i.e. the slip
                    just landed), which AnimatePresence then animates out. */}
                {lane && (
                  <BananaPeelDrop
                    incomingBananaAt={lane.incomingBananaAt}
                    progress={lane.incomingBananaProgress}
                    trackLength={state.trackLength}
                  />
                )}

                {/* Runner sprite — `left` is written by the rAF loop above. */}
                {lane && (
                  <div
                    ref={(el) => {
                      if (el) avatarRefs.current.set(lane.id, el);
                      else avatarRefs.current.delete(lane.id);
                    }}
                    className="absolute top-1/2"
                    style={{
                      left: "6%",
                      transform: "translate(-50%, -50%)",
                      // No CSS transition on `left` — rAF owns it for 60fps.
                    }}
                  >
                    <RaceRunner
                      colorIndex={colorIndexFromName(lane.name)}
                      // Stand still + no crown during the 3-2-1 — nobody has
                      // moved yet, so the run cycle and leader crown would
                      // both be misleading.
                      state={countdown.active ? "idle" : lane.state}
                      crowned={!countdown.active && lane.id === leaderId}
                      size={44}
                    />
                    {/* Player name — anchored to avatar, sits just under it */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 text-[10px] text-white font-bold truncate drop-shadow max-w-[120px] text-center">
                      {lane.name}
                    </div>
                    {/* Fall puff — appears under the tipped sprite */}
                    <AnimatePresence>
                      {lane.state === "fallen" && (
                        <motion.div
                          key="puff"
                          initial={{ opacity: 0, scale: 0.5, x: -6 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-base"
                        >
                          💥
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {/* Finish flag — above the sprite */}
                    {lane.state === "finished" && lane.finishPosition && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-lg">
                        {lane.finishPosition === 1
                          ? "🥇"
                          : lane.finishPosition === 2
                            ? "🥈"
                            : lane.finishPosition === 3
                              ? "🥉"
                              : "🏁"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <aside className="bg-white/5 rounded-2xl p-4 self-start flex flex-col gap-4">
        <RaceCountdownChip endsAt={state.endsAt} />
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40 mb-3">
            leaderboard
          </div>
          <RaceLiveBoard state={state} />
        </div>
        {state.finishOrder.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-widest text-white/40 mb-2">
              finishes
            </div>
            <div className="flex flex-col gap-1 max-h-[200px] overflow-hidden">
              {state.finishOrder.map((f) => (
                <div
                  key={f.playerId}
                  className="flex items-center justify-between text-sm bg-green-500/10 text-green-200 rounded px-2 py-1"
                >
                  <span className="truncate">
                    {bn(f.position)}. {f.name}
                  </span>
                  {f.position === 1 && <span>🥇</span>}
                  {f.position === 2 && <span>🥈</span>}
                  {f.position === 3 && <span>🥉</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function useLeaderId(state: RacePublicRoomState): string | null {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      let best: string | null = null;
      let bestExt = -1;
      for (const lane of state.players) {
        const ext = extrapolate(
          lane,
          state.trackLength,
          state.baselineRate,
          now
        );
        if (ext > bestExt) {
          bestExt = ext;
          best = lane.id;
        }
      }
      setLeaderId(best);
    }, 250);
    return () => clearInterval(id);
  }, [state.players, state.trackLength, state.baselineRate]);
  return leaderId;
}

function RaceCountdownChip({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const hot = remaining <= 10;
  return (
    <motion.div
      animate={hot ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={hot ? { duration: 0.5, repeat: Infinity } : { duration: 0.2 }}
      className={`text-5xl font-black tabular-nums px-5 py-2 rounded-2xl text-center ${
        hot
          ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60"
          : "bg-white/5 text-white"
      }`}
    >
      {remaining}s
    </motion.div>
  );
}

function RaceLiveBoard({ state }: { state: RacePublicRoomState }) {
  // Recompute order every frame-ish so the leaderboard sorts by extrapolated
  // progress, not just the last anchor.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);
  const ordered = useMemo(() => {
    const now = Date.now();
    return [...state.players]
      .map((p) => ({
        p,
        ext: extrapolate(p, state.trackLength, state.baselineRate, now),
      }))
      .sort((a, b) => {
        // Finished first (by position), then by ext desc.
        const aFin = a.p.finishPosition ?? Number.MAX_SAFE_INTEGER;
        const bFin = b.p.finishPosition ?? Number.MAX_SAFE_INTEGER;
        if (aFin !== bFin) return aFin - bFin;
        return b.ext - a.ext;
      });
    // tick is intentionally in dep array to refresh ordering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.players, state.trackLength, state.baselineRate, tick]);
  return (
    <div className="flex flex-col gap-1.5">
      {ordered.map(({ p, ext }, i) => (
        <div
          key={p.id}
          className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg ${
            i === 0 ? "bg-red-400/10" : "bg-white/5"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={p.name} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold flex items-center gap-1">
                {p.name}
                {p.state === "fallen" && <span>💥</span>}
                {p.state === "finished" && p.finishPosition === 1 && (
                  <span>🥇</span>
                )}
              </div>
              <div className="text-[10px] text-white/40">
                {bn(p.correctCount)} ✓ · {bn(p.fallCount)} ✗
              </div>
            </div>
          </div>
          <div className="font-black text-red-300 tabular-nums text-sm">
            {Math.floor(ext)}%
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Finished ----------------

function RaceFinished({
  state,
  socket,
}: {
  state: RacePublicRoomState;
  socket: Socket;
}) {
  // Everyone sharing position 1 — usually one, but a photo-finish can put
  // several runners across the line together (all joint winners).
  const winners = state.finishOrder.filter((f) => f.position === 1);
  const soloWinnerLane =
    winners.length === 1
      ? state.players.find((p) => p.id === winners[0].playerId)
      : null;
  return (
    <div className="min-h-[calc(100dvh-120px)] flex flex-col items-center justify-start gap-6 text-center pt-8">
      <div className="text-xs uppercase tracking-[0.3em] text-red-300">
        {state.endReason === "podium"
          ? "podium settled"
          : state.endReason === "all_finished"
            ? "all finished"
            : "time's up"}
      </div>
      {winners.length > 0 && (
        <>
          <div className="text-7xl font-black bangla">
            {winners.map((w) => w.name).join(" & ")}
          </div>
          <div className="text-red-300 text-3xl font-black flex items-center gap-3">
            🏆 {winners.length > 1 ? "যৌথ প্রথম" : "প্রথম"}
            {soloWinnerLane && (
              <span className="text-white/60 text-xl font-bold">
                ({bn(soloWinnerLane.correctCount)} প্রম্পট,{" "}
                {bn(soloWinnerLane.fallCount)} পপাত)
              </span>
            )}
          </div>
        </>
      )}
      <div className="flex flex-col gap-2 w-full max-w-md">
        {state.finishOrder.map((f) => {
          const lane = state.players.find((p) => p.id === f.playerId);
          return (
            <div
              key={f.playerId}
              className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2 ${
                f.position === 1
                  ? "bg-red-400/20 ring-1 ring-red-400/50"
                  : "bg-white/5"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-2xl font-black tabular-nums w-8 text-right">
                  {bn(f.position)}
                </div>
                <Avatar name={f.name} size="sm" />
                <div className="truncate font-bold">{f.name}</div>
              </div>
              <div className="text-xs text-white/60 tabular-nums">
                {lane
                  ? `${bn(lane.correctCount)} ✓ · ${bn(lane.fallCount)} ✗`
                  : ""}
              </div>
            </div>
          );
        })}
      </div>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => socket.emit("host:resetLobby", () => {})}
        className="bg-red-400 text-black font-black text-xl px-8 py-3 rounded-xl shadow-xl"
      >
        আবার খেলুন
      </motion.button>
    </div>
  );
}
