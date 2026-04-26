"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { CahPublicPlayer } from "@/lib/types";

export function Scoreboard({
  players,
  czarId,
  scoreToWin,
  compact = false,
}: {
  players: CahPublicPlayer[];
  czarId: string | null;
  scoreToWin: number;
  compact?: boolean;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <AnimatePresence initial={false}>
        {sorted.map((p) => (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={`flex items-center justify-between gap-3 rounded-lg px-3 ${compact ? "py-1.5 text-sm" : "py-2 text-base"} ${
              p.id === czarId
                ? "bg-yellow-400 text-black"
                : "bg-white/5 text-white"
            } ${!p.connected ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-2 truncate">
              {p.id === czarId && (
                <span className="text-xs font-bold uppercase tracking-wider">
                  👑
                </span>
              )}
              <span className="truncate font-semibold bangla">{p.name}</span>
            </div>
            <div className="flex items-center gap-1 font-bold tabular-nums">
              <motion.span
                key={p.score}
                initial={{ scale: 1.6, color: "#fbbf24" }}
                animate={{ scale: 1, color: p.id === czarId ? "#000" : "#fff" }}
                transition={{ duration: 0.4 }}
              >
                {p.score}
              </motion.span>
              <span className="opacity-50">/ {scoreToWin}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
