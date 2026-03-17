"use client";

import { useEffect, useState } from "react";

// Stable per-browser UUID used as the player's identity on the wire. Survives
// reloads and disconnects so the server can match a returning socket to the
// existing seat in its room (see lib/shared/rooms.js). Generated lazily on
// first read and persisted in localStorage.
//
// Returns null during SSR / first paint; consumers should gate socket-emit
// calls on this being non-null.

const STORAGE_KEY = "cah-client-id";

function generateId(): string {
  // Prefer the platform UUID generator when available, fall back to a
  // best-effort random hex string otherwise (older Safari etc.).
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

let cached: string | null = null;

export function getClientId(): string | null {
  if (typeof window === "undefined") return null;
  if (cached) return cached;
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateId();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    cached = id;
    return id;
  } catch {
    // Private-mode Safari can throw on localStorage access. Fall back to a
    // per-session id so the user can still play this session (just won't
    // reconnect across reloads).
    if (!cached) cached = generateId();
    return cached;
  }
}

export function useClientId(): string | null {
  const [id, setId] = useState<string | null>(() => getClientId());
  useEffect(() => {
    if (!id) setId(getClientId());
  }, [id]);
  return id;
}
