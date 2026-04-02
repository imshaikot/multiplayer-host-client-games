"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Socket } from "socket.io-client";
import type { StrokePayload, StrokePoint } from "@/lib/types";

// Wire coordinates are normalized to [0..1] so the drawer's phone canvas
// and the Host display's canvas share a coordinate space — each side multiplies
// by its own pixel dimensions at render time.

// Throttle interval for the drawer's live stroke pushes. 60ms ≈ 16 events/s,
// which feels live without flooding the socket.
const STROKE_BATCH_MS = 60;

const BRUSH_COLORS = [
  "#000000",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#ffffff",
];

const BRUSH_SIZES: { label: string; size: number }[] = [
  { label: "S", size: 3 },
  { label: "M", size: 6 },
  { label: "L", size: 12 },
];

type Mode = "drawer" | "viewer";

// Per-stroke render state used by the quadratic-midpoint smoothing pass.
// `last` = the most recent input point we've seen.
// `cursor` = the point our pen is currently sitting at — usually a midpoint,
// not an input point. Midpoints become the anchors of the quadratic curves
// so successive segments meet smoothly instead of cornering at every sample.
type StrokeState = {
  last: StrokePoint | null;
  cursor: StrokePoint | null;
};

function dot(
  ctx: CanvasRenderingContext2D,
  p: StrokePoint,
  w: number,
  h: number,
  color: string,
  size: number
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x * w, p.y * h, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

// Apply `newPoints` to a stroke that may already be partially drawn. The
// `state` ref is mutated in place. We use quadratic curves through
// midpoints so a series of pointer samples renders as a smooth line rather
// than a polyline of corners.
function drawStrokeIncrement(
  ctx: CanvasRenderingContext2D,
  state: StrokeState,
  newPoints: StrokePoint[],
  end: boolean,
  w: number,
  h: number,
  color: string,
  size: number
) {
  if (newPoints.length === 0 && !end) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of newPoints) {
    if (!state.last) {
      // First point of the stroke — paint a dot so single taps register.
      dot(ctx, p, w, h, color, size);
      state.last = p;
      state.cursor = p;
      continue;
    }
    const mid = { x: (state.last.x + p.x) / 2, y: (state.last.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(state.cursor!.x * w, state.cursor!.y * h);
    ctx.quadraticCurveTo(
      state.last.x * w,
      state.last.y * h,
      mid.x * w,
      mid.y * h
    );
    ctx.stroke();
    state.cursor = mid;
    state.last = p;
  }
  if (end && state.cursor && state.last) {
    // Close out the stroke with a straight segment to the final input
    // point — otherwise the last bit of the smoothed curve would stop at
    // the midpoint instead of the actual pen-up location.
    ctx.beginPath();
    ctx.moveTo(state.cursor.x * w, state.cursor.y * h);
    ctx.lineTo(state.last.x * w, state.last.y * h);
    ctx.stroke();
  }
}

export function JanachCanvas({
  mode,
  socket,
  resetKey,
}: {
  mode: Mode;
  socket: Socket;
  // Bumping this prop clears the canvas (e.g. on round transition).
  resetKey: string | number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Drawer side: current in-progress stroke being captured locally.
  const drawingRef = useRef(false);
  const strokeIdRef = useRef<string | null>(null);
  const pendingPointsRef = useRef<StrokePoint[]>([]);
  const lastFlushRef = useRef(0);
  const localStrokeStateRef = useRef<StrokeState>({ last: null, cursor: null });

  // Viewer side: render state for each in-progress stroke we've heard about.
  // Completed strokes are deleted on `end: true`.
  const viewerStrokesRef = useRef<Map<string, StrokeState>>(new Map());

  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(6);

  // Resize the backing canvas to match its CSS box. Re-runs on window
  // resize. We honor devicePixelRatio so strokes stay sharp on retina.
  useEffect(() => {
    const c = canvasRef.current;
    const w = wrapRef.current;
    if (!c || !w) return;
    const resize = () => {
      const rect = w.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.floor(rect.width * dpr));
      c.height = Math.max(1, Math.floor(rect.height * dpr));
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctxRef.current = ctx;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Clear when resetKey changes (round transition / phase reset).
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    viewerStrokesRef.current.clear();
    localStrokeStateRef.current = { last: null, cursor: null };
  }, [resetKey]);

  // Socket listeners. `janach:replay` (the one-shot full-buffer rebuild) is
  // wired for BOTH modes: a reconnecting viewer/host needs to recover the
  // drawing-so-far, and a reconnecting drawer's local canvas is blank too
  // (their own strokes are never relayed back to them). Live per-stroke relay
  // (`janach:stroke`/`janach:clear`) is viewer-only — the drawer is excluded
  // from those relays server-side and renders its own strokes locally.
  useEffect(() => {
    if (!socket) return;
    const drawPayload = (payload: StrokePayload) => {
      const ctx = ctxRef.current;
      const c = canvasRef.current;
      if (!ctx || !c) return;
      const rect = c.getBoundingClientRect();
      let state = viewerStrokesRef.current.get(payload.id);
      if (!state) {
        state = { last: null, cursor: null };
        viewerStrokesRef.current.set(payload.id, state);
      }
      drawStrokeIncrement(
        ctx,
        state,
        payload.points,
        !!payload.end,
        rect.width,
        rect.height,
        payload.color,
        payload.size
      );
      if (payload.end) viewerStrokesRef.current.delete(payload.id);
    };
    const wipeCanvas = () => {
      const c = canvasRef.current;
      const ctx = ctxRef.current;
      if (!c || !ctx) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.restore();
      viewerStrokesRef.current.clear();
      // The drawer's in-progress local stroke state is meaningless after a
      // full rebuild; reset it so the next pen-down starts fresh.
      localStrokeStateRef.current = { last: null, cursor: null };
    };
    const onStroke = (payload: StrokePayload) => drawPayload(payload);
    // The server emits this one-shot to any socket that asks (via
    // janach:requestReplay) with the full stroke buffer of the current round,
    // so a canvas that mounted or reconnected mid-drawing rebuilds instead of
    // starting blank.
    const onReplay = (payload: { strokes: StrokePayload[] }) => {
      wipeCanvas();
      for (const s of payload?.strokes ?? []) drawPayload(s);
    };
    // Pull the current drawing on mount and again on every (re)connect. Being
    // client-driven guarantees this listener is attached before the request
    // goes out, sidestepping the push-replay listener-readiness race. The
    // server no-ops the request outside the drawing phase.
    const requestReplay = () => socket.emit("janach:requestReplay");

    socket.on("janach:replay", onReplay);
    socket.on("connect", requestReplay);
    if (mode === "viewer") {
      socket.on("janach:stroke", onStroke);
      socket.on("janach:clear", wipeCanvas);
    }
    if (socket.connected) requestReplay();
    return () => {
      socket.off("janach:replay", onReplay);
      socket.off("connect", requestReplay);
      socket.off("janach:stroke", onStroke);
      socket.off("janach:clear", wipeCanvas);
    };
  }, [mode, socket]);

  // ----- Drawer handlers -----

  function getNormalizedPoint(
    e: ReactPointerEvent<HTMLCanvasElement>
  ): StrokePoint {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  function flushPendingPoints(end: boolean) {
    if (!strokeIdRef.current) return;
    if (pendingPointsRef.current.length === 0 && !end) return;
    socket.emit("drawer:stroke", {
      id: strokeIdRef.current,
      points: pendingPointsRef.current,
      color,
      size,
      end,
    } satisfies StrokePayload);
    pendingPointsRef.current = [];
    lastFlushRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (mode !== "drawer") return;
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    c.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = getNormalizedPoint(e);
    strokeIdRef.current = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    pendingPointsRef.current = [p];
    lastFlushRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    localStrokeStateRef.current = { last: null, cursor: null };
    const rect = c.getBoundingClientRect();
    drawStrokeIncrement(
      ctx,
      localStrokeStateRef.current,
      [p],
      false,
      rect.width,
      rect.height,
      color,
      size
    );
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (mode !== "drawer" || !drawingRef.current) return;
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    const p = getNormalizedPoint(e);
    const rect = c.getBoundingClientRect();
    drawStrokeIncrement(
      ctx,
      localStrokeStateRef.current,
      [p],
      false,
      rect.width,
      rect.height,
      color,
      size
    );
    pendingPointsRef.current.push(p);
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastFlushRef.current >= STROKE_BATCH_MS) flushPendingPoints(false);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (mode !== "drawer" || !drawingRef.current) return;
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    c?.releasePointerCapture(e.pointerId);
    drawingRef.current = false;
    const p = getNormalizedPoint(e);
    const last =
      pendingPointsRef.current[pendingPointsRef.current.length - 1] ??
      localStrokeStateRef.current.last;
    if (!last || last.x !== p.x || last.y !== p.y) {
      pendingPointsRef.current.push(p);
    }
    // Render the final tail locally before flushing, so the drawer sees
    // their own stroke close cleanly without waiting for echo.
    if (c && ctx) {
      const rect = c.getBoundingClientRect();
      const pts = last && (last.x !== p.x || last.y !== p.y) ? [p] : [];
      drawStrokeIncrement(
        ctx,
        localStrokeStateRef.current,
        pts,
        true,
        rect.width,
        rect.height,
        color,
        size
      );
    }
    flushPendingPoints(true);
    strokeIdRef.current = null;
  }

  function clearAll() {
    if (mode !== "drawer") return;
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    localStrokeStateRef.current = { last: null, cursor: null };
    socket.emit("drawer:clear");
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div
        ref={wrapRef}
        className="relative w-full aspect-[4/3] bg-white rounded-2xl overflow-hidden ring-1 ring-black/10"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={mode === "drawer" ? "cursor-crosshair" : ""}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
      {mode === "drawer" && (
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex gap-1.5">
            {BRUSH_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full ring-2 ${
                  color === c ? "ring-yellow-400" : "ring-black/20"
                }`}
                style={{ background: c }}
                aria-label={`color ${c}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {BRUSH_SIZES.map((b) => (
              <button
                key={b.size}
                onClick={() => setSize(b.size)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                  size === b.size
                    ? "bg-yellow-400 text-black"
                    : "bg-white/10 text-white"
                }`}
              >
                {b.label}
              </button>
            ))}
            <button
              onClick={clearAll}
              className="ml-2 px-3 py-1.5 rounded-lg text-xs font-black bg-red-500/80 text-white"
            >
              মুছুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
