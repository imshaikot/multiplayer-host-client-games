"use client";

import { QRCodeSVG } from "qrcode.react";

// Bengali numeral conversion — host view feels more native with ১,২,৩.
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const bn = (n: number | string) =>
  String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-lime-500",
  "bg-sky-500",
  "bg-fuchsia-500",
  "bg-teal-500",
  "bg-red-500",
];

export function hashIdx(s: string, mod: number) {
  let h = 0;
  for (const c of s || "?") h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % mod;
}

export function Avatar({
  name,
  size = "md",
  dim = false,
  crowned = false,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  dim?: boolean;
  crowned?: boolean;
}) {
  const initial = (name?.trim()[0] || "?").toUpperCase();
  const bg = AVATAR_COLORS[hashIdx(name, AVATAR_COLORS.length)];
  const dims = {
    sm: "w-8 h-8 text-base",
    md: "w-12 h-12 text-xl",
    lg: "w-16 h-16 text-2xl",
    xl: "w-24 h-24 text-4xl",
  }[size];
  return (
    <div className="relative inline-flex">
      <div
        className={`${dims} ${bg} ${
          dim ? "opacity-40" : ""
        } rounded-full flex items-center justify-center font-black text-white shadow-md ring-2 ring-black/40`}
      >
        {initial}
      </div>
      {crowned && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl">
          👑
        </div>
      )}
    </div>
  );
}

// Small persistent chip in the corner so onlookers always see what room
// this Host display is for (helps a curious bystander find the right URL).
export function RoomCornerChip({
  code,
  joinUrl,
}: {
  code: string;
  joinUrl: string;
}) {
  return (
    <div className="fixed bottom-4 left-4 z-20 bg-white/5 backdrop-blur rounded-xl p-2 flex items-center gap-3 ring-1 ring-white/10">
      {joinUrl && (
        <div className="bg-white p-1 rounded-md">
          <QRCodeSVG value={joinUrl} size={56} />
        </div>
      )}
      <div className="pr-2">
        <div className="text-[10px] uppercase tracking-widest text-white/40">
          রুম
        </div>
        <div className="text-2xl font-black tracking-[0.2em] text-yellow-400 leading-none">
          {code}
        </div>
      </div>
    </div>
  );
}
