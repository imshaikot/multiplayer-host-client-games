"use client";

// Sprite-based animated avatar for the Race game. Loads a 4-row × 4-col
// sprite sheet from /public/race-runner.png; each row is one animation:
//   row 0 — idle / finished pose (4 frames, used statically by default)
//   row 3 — running cycle (4 frames, ~10fps)
// 12 visually distinct color variants are made by `filter: hue-rotate` —
// no canvas / no pre-baked sheets. Skin/hair/pants all shift along with the
// shirt; this looks like "12 themed runners" rather than "12 same-skin
// dudes in different shirts," and it's intentional.

import { useEffect, useState } from "react";

const SPRITE_SRC = "/race-runner.webp";
const COLS = 4;
const ROWS = 4;
const ROW_IDLE = 0;
const ROW_RUNNING = 3; // bottom row — most kinetic stride
const RUN_FPS = 10;

export type RunnerState = "idle" | "running" | "fallen" | "finished";

// Cache the natural dimensions across all RaceRunner instances. We probe the
// image once and remember; everyone else gets a synchronous answer.
let cachedDims: { w: number; h: number } | null = null;
const dimsListeners = new Set<(d: { w: number; h: number }) => void>();
let probeStarted = false;

function probeImage() {
  if (cachedDims || probeStarted) return;
  if (typeof window === "undefined") return;
  probeStarted = true;
  const img = new window.Image();
  img.onload = () => {
    cachedDims = {
      w: img.naturalWidth / COLS,
      h: img.naturalHeight / ROWS,
    };
    for (const fn of dimsListeners) fn(cachedDims);
    dimsListeners.clear();
  };
  img.onerror = () => {
    // Silently fail. Component will keep its placeholder.
    probeStarted = false;
  };
  img.src = SPRITE_SRC;
}

function useSpriteDims() {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(cachedDims);
  useEffect(() => {
    if (cachedDims) {
      setDims(cachedDims);
      return;
    }
    const listener = (d: { w: number; h: number }) => setDims(d);
    dimsListeners.add(listener);
    probeImage();
    return () => {
      dimsListeners.delete(listener);
    };
  }, []);
  return dims;
}

export function RaceRunner({
  colorIndex,
  state,
  crowned = false,
  size = 56,
}: {
  colorIndex: number;
  state: RunnerState;
  crowned?: boolean;
  size?: number;
}) {
  const dims = useSpriteDims();
  const [frame, setFrame] = useState(0);

  // Frame-cycle when running. rAF-driven so it stays in sync with the Host
  // display's main loop; we throttle to RUN_FPS by tracking elapsed time.
  useEffect(() => {
    if (state !== "running") {
      setFrame(0);
      return;
    }
    let rafId = 0;
    let last = performance.now();
    const interval = 1000 / RUN_FPS;
    const tick = (now: number) => {
      if (now - last >= interval) {
        setFrame((f) => (f + 1) % COLS);
        last = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [state]);

  // Fallback placeholder until the sprite sheet's natural dims are known.
  // Keep the box the right shape so layouts don't jump when the image loads.
  if (!dims) {
    return (
      <div
        className="inline-block bg-white/5 rounded"
        style={{ width: size, height: size * 1.4 }}
      />
    );
  }

  const aspect = dims.h / dims.w; // ~ frame H : frame W
  const displayW = size;
  const displayH = size * aspect;
  const row = state === "running" ? ROW_RUNNING : ROW_IDLE;
  const col = state === "running" ? frame : 0;

  // Tilt over when fallen. Pivot around the bottom-center so it looks like
  // the character tipped onto the track surface, not pirouetted.
  const fallen = state === "fallen";
  const tilt = fallen ? "rotate(78deg)" : "";

  return (
    <div
      className="relative inline-block select-none pointer-events-none"
      style={{ width: displayW, height: displayH }}
    >
      <div
        style={{
          width: displayW,
          height: displayH,
          backgroundImage: `url(${SPRITE_SRC})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${displayW * COLS}px ${displayH * ROWS}px`,
          backgroundPosition: `-${col * displayW}px -${row * displayH}px`,
          imageRendering: "pixelated",
          filter: `hue-rotate(${colorIndex * 30}deg)${
            state === "finished" ? " brightness(1.1)" : ""
          }`,
          transform: tilt,
          transformOrigin: "50% 100%",
          transition: "transform 120ms ease-out",
        }}
      />
      {crowned && (
        <div
          className="absolute left-1/2 -translate-x-1/2 text-2xl pointer-events-none"
          style={{ top: -displayH * 0.32 }}
        >
          👑
        </div>
      )}
    </div>
  );
}

// Stable color index from a name string. Mirrors the existing avatar palette
// pattern (hashIdx) but ranges 0..11 for the 12 hue slots.
export function colorIndexFromName(name: string): number {
  let h = 0;
  for (const c of name || "?") h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 12;
}
