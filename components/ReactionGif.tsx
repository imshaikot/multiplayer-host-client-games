"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { tagsFor, type GifData, type GifMoment } from "@/lib/giphy";

type Props = {
  moment: GifMoment;
  // Re-fetch when this key changes (e.g. round number, winner id)
  refreshKey?: string | number;
  // Fallback emoji shown when the API has no key or fails
  fallbackEmoji?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const SIZE_PX = { sm: 140, md: 220, lg: 320 };

export function ReactionGif({
  moment,
  refreshKey,
  fallbackEmoji = "🎉",
  className = "",
  size = "md",
}: Props) {
  const [gif, setGif] = useState<GifData | null>(null);
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];

  useEffect(() => {
    let cancelled = false;
    setGif(null);
    setFailed(false);
    const tag = tagsFor(moment);
    fetch(`/api/giphy?tag=${encodeURIComponent(tag)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status !== 200) {
          setFailed(true);
          return;
        }
        const data = (await r.json()) as GifData;
        setGif(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [moment, refreshKey]);

  if (failed) {
    return (
      <motion.div
        key={`emoji-${refreshKey ?? ""}`}
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
        transition={{ type: "spring", damping: 8 }}
        className={`text-7xl ${className}`}
        aria-hidden
      >
        {fallbackEmoji}
      </motion.div>
    );
  }

  if (!gif) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ width: px, height: Math.round(px * 0.8) }}
      >
        <div className="text-3xl opacity-30">…</div>
      </div>
    );
  }

  const ratio = gif.height && gif.width ? gif.height / gif.width : 0.8;
  return (
    <motion.img
      key={gif.url}
      src={gif.url}
      alt={gif.title}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", damping: 14 }}
      style={{ width: px, height: Math.round(px * ratio) }}
      className={`rounded-2xl shadow-card ${className}`}
    />
  );
}
