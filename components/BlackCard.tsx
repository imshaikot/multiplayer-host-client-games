"use client";

import { motion } from "framer-motion";
import type { Card } from "@/lib/types";

export function BlackCard({
  card,
  size = "md",
  filledWith,
}: {
  card: Card;
  size?: "sm" | "md" | "lg" | "xl";
  filledWith?: string[];
}) {
  const sizeClass = {
    sm: "w-[180px] h-[240px] p-4 text-base",
    md: "w-[260px] h-[340px] p-6 text-xl",
    lg: "w-[360px] h-[480px] p-8 text-3xl",
    xl: "w-[480px] h-[620px] p-10 text-4xl leading-snug",
  }[size];

  const parts = card.text.split("____");
  return (
    <motion.div
      initial={{ rotateX: -90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`card-ink ${sizeClass} flex flex-col justify-between font-semibold tracking-tight`}
    >
      <div className="leading-snug bangla">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 &&
              (filledWith?.[i] ? (
                <span className="font-bold underline decoration-2 underline-offset-4">
                  {" "}
                  {filledWith[i]}{" "}
                </span>
              ) : (
                <span className="blank-line" />
              ))}
          </span>
        ))}
      </div>
      <div className="flex items-end justify-between text-xs uppercase tracking-[0.2em] opacity-60">
        <span>পবিত্র কার্ড</span>
        {card.pick && card.pick > 1 ? (
          <span className="flex items-center gap-1">
            পিক <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-black font-bold">{card.pick}</span>
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}
