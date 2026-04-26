"use client";

import { motion } from "framer-motion";
import type { Card } from "@/lib/types";

export function WhiteCard({
  card,
  size = "md",
  selected = false,
  selectedNumber,
  onClick,
  faceDown = false,
}: {
  card?: Card;
  size?: "sm" | "md" | "lg" | "xl";
  selected?: boolean;
  selectedNumber?: number;
  onClick?: () => void;
  faceDown?: boolean;
}) {
  const sizeClass = {
    sm: "w-[150px] h-[210px] p-3 text-sm",
    md: "w-[200px] h-[280px] p-5 text-base",
    lg: "w-[280px] h-[380px] p-6 text-xl",
    xl: "w-[360px] h-[480px] p-8 text-2xl leading-snug",
  }[size];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={onClick ? { y: -8, rotate: -1 } : {}}
      whileTap={onClick ? { scale: 0.97 } : {}}
      animate={selected ? { y: -16, rotate: 2 } : { y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`card-paper ${sizeClass} text-left font-medium flex flex-col justify-between relative ${
        onClick ? "cursor-pointer" : "cursor-default"
      } ${selected ? "ring-4 ring-yellow-400" : ""}`}
    >
      {selected && selectedNumber !== undefined && (
        <span className="absolute -top-3 -right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-black font-bold text-lg shadow-lg">
          {selectedNumber}
        </span>
      )}
      {faceDown ? (
        <div className="flex h-full w-full items-center justify-center text-3xl font-black text-black/20">
          ?
        </div>
      ) : (
        <>
          <div className="bangla leading-snug">{card?.text}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-50">
            পবিত্র কার্ড
          </div>
        </>
      )}
    </motion.button>
  );
}
