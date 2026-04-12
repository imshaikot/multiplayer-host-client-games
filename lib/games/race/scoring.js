// Race game constants + the score formula used to author data/race_prompts.json.
// computePromptScore is NOT called on the runtime hot path — scores are
// precomputed in JSON at authoring time. This file exists so the formula stays
// documented and re-runnable when adding new prompts.

const TRACK_LENGTH = 100;
const RACE_SECONDS = 120;
const BASELINE_RATE = TRACK_LENGTH / RACE_SECONDS; // units per second
const FALL_MS = 1500;
// Pre-race "3-2-1-GO!" countdown. The room transitions to `racing` immediately
// on host:startRace, but startedAt is set to now + COUNTDOWN_MS so progress
// math, the race-end timer, and the submit guard all naturally honor it.
const COUNTDOWN_MS = 3000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function computePromptScore(text) {
  const s = String(text || "");
  const length = s.length;
  const words = s.trim().split(/\s+/).filter(Boolean).length;
  const specialChars = (s.match(/[A-Z!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/g) || [])
    .length;
  const raw = length / 5 + words * 0.5 + specialChars * 0.4;
  return clamp(Math.round(raw), 3, 15);
}

module.exports = {
  TRACK_LENGTH,
  RACE_SECONDS,
  BASELINE_RATE,
  FALL_MS,
  COUNTDOWN_MS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  computePromptScore,
};
