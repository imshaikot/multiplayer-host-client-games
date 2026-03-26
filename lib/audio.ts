"use client";

// Lazy WebAudio synthesizer for Ja Nach sound cues. Tones are generated
// inline rather than shipping audio files. The AudioContext is created on
// first call — on iOS it stays suspended until a user gesture has happened
// on the page, but the Host display clicks "start game" which counts, so by the
// time we want to tick / ding the context is alive.

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  vol = 0.12,
  delay = 0
) {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

export const audio = {
  // Short square tick — last-10s metronome.
  tick: () => beep(880, 0.04, "square", 0.07),
  // Rising two-tone ding — someone guessed correctly.
  ding: () => {
    beep(880, 0.12, "sine", 0.14);
    beep(1320, 0.18, "sine", 0.12, 0.07);
  },
  // Descending gong — round just ended.
  gong: () => {
    beep(220, 0.6, "triangle", 0.18);
    beep(165, 0.8, "triangle", 0.13, 0.08);
  },
  // Game-over fanfare.
  fanfare: () => {
    beep(523, 0.15, "triangle", 0.16);
    beep(659, 0.15, "triangle", 0.16, 0.12);
    beep(784, 0.15, "triangle", 0.16, 0.24);
    beep(1047, 0.4, "triangle", 0.16, 0.36);
  },
  // Whoosh — banana peel hurled through the air.
  whoosh: () => {
    beep(1200, 0.06, "sine", 0.1);
    beep(700, 0.08, "sine", 0.1, 0.04);
    beep(400, 0.12, "sine", 0.08, 0.1);
  },
};
