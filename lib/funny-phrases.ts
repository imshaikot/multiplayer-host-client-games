// Rotating Bangla quips used across the gameplay UI.
// Pick one with `pickPhrase(pool, seed)` so the same seed (e.g. round number)
// gives the same line for everyone in the room.

export type PhrasePool = readonly string[];

export const PHRASES = {
  // Phone player — waiting after they submitted their card
  playerWaitingAfterSubmit: [
    "কার্ড গেছে। এবার ভাগ্য পরীক্ষা…",
    "জমা পড়েছে। অন্যরা ঘুম থেকে উঠুক…",
    "আপনার অংশ শেষ। চা খেতে পারেন।",
    "কার্ড পাঠানো হয়েছে। দোয়া করেন।",
    "ক্যাপ্টেনের রায় অপেক্ষায়…",
    "জমা ঠিকঠাক। এখন একটু ভাব নেন।",
    "শেষ! এবার বাকিদের লজ্জা দিন।",
    "চিল করুন, কার্ড পৌঁছে গেছে।",
  ],
  // Phone player — Czar is judging
  playerCzarJudging: [
    "ক্যাপ্টেন ভাবছেন… খুব ভাবছেন।",
    "ক্যাপ্টেন এখন বিচারকের চেয়ারে।",
    "শ্রেষ্ঠ অশ্লীলতা বাছাই চলছে…",
    "ক্যাপ্টেনের মাথা ঘুরছে। অপেক্ষা করুন।",
    "জুরির রায়ের অপেক্ষায়…",
    "ক্যাপ্টেন পড়ছেন। ধৈর্য ধরেন।",
  ],
  // Phone player — Czar phase (you ARE the czar, waiting for submissions)
  czarWaiting: [
    "অপেক্ষা করুন — সবাই কার্ড দিচ্ছে…",
    "প্রজারা কার্ড সাজাচ্ছে…",
    "জনগণ ভাবছে, আপনি বিশ্রাম নেন।",
    "ক্যাপ্টেনের কাজ পরে — এখন রিল্যাক্স।",
    "সবার কার্ড আসুক, তারপর মজা।",
  ],
  // Phone player — got picked as winner
  playerWonRound: [
    "🎉 আপনি জিতেছেন!",
    "🏆 বস মুভ!",
    "👑 ভিউ পাল্টে দিলেন!",
    "🔥 ক্যাপ্টেনের মন জয়!",
    "💀 আপনি হারাম, কিন্তু জিতেছেন।",
    "✨ ১ পয়েন্ট, অসীম সম্মান।",
  ],
  // Phone player — lobby waiting
  playerLobby: [
    "হোস্ট খেলা শুরু করলেই আপনি কার্ড পাবেন।",
    "চায়ের কাপ রেডি রাখেন। শুরু হবে এখনই।",
    "একটু অপেক্ষা — হোস্ট ভাব ধরছেন।",
    "মন শক্ত করেন, লজ্জা পাশে রাখেন।",
  ],
  // Host display — submitting phase headers
  hostSubmittingHeader: [
    "অপেক্ষায়...",
    "কার্ড আসছে…",
    "প্লেয়াররা ভাবছে…",
    "নির্লজ্জতার অপেক্ষায়…",
    "সবাই কার্ড সাজাচ্ছে…",
  ],
  // Host display — judging phase header
  hostJudgingHeader: [
    "বিজয়ী বাছছেন…",
    "রায় ঘোষণার অপেক্ষায়…",
    "সবচেয়ে নোংরাটা বাছছেন…",
    "মাথা চুলকাচ্ছেন…",
    "বিচার চলছে…",
  ],
  // Host display — reveal celebration
  hostRevealCelebration: [
    "এই রাউন্ডের বিজয়ী",
    "চ্যাম্পিয়ন এই রাউন্ডে",
    "সেরা নষ্টামি",
    "এই মুহূর্তের তারকা",
    "রাউন্ডের সম্রাট",
  ],
  // Game over — winning announcement
  gameOverTitle: [
    "জিতেছেন!",
    "চ্যাম্পিয়ন!",
    "সেরার সেরা!",
    "অপ্রতিরোধ্য!",
    "ইতিহাস তৈরি হলো!",
  ],
  // Game over — taunts for losers (shown in Host display subline)
  gameOverSubline: [
    "বাকিদের সান্ত্বনা পুরস্কার: লজ্জা।",
    "হারলে কিছু হয় না, শুধু সম্মান কমে।",
    "পরের বার আরও নোংরা হন।",
    "জানতাম এ-ই জিতবে।",
    "বাকিরা চা আনুন।",
  ],
  // Tagline — under the logo on home
  homeTagline: [
    "কালো কার্ড পড়েন। সাদা কার্ড দিয়ে শূন্যস্থান পূরণ করেন। হাসেন।",
    "বন্ধুত্ব ভাঙার সবচেয়ে সহজ গেম।",
    "যত নোংরা, তত পয়েন্ট।",
    "ভদ্রলোকেরা দূরে থাকুন।",
    "চা-পরোটা নিয়ে বসুন। লজ্জা ছেড়ে দিন।",
  ],
  // Connecting splash
  connecting: [
    "কানেক্ট হচ্ছে…",
    "তার জোড়া লাগছে…",
    "সার্ভারকে জাগাচ্ছি…",
    "ইন্টারনেট দয়া করছে…",
  ],
  // Loading splash on host
  hostLoading: [
    "লোড হচ্ছে…",
    "মঞ্চ সাজানো হচ্ছে…",
    "কার্ড শাফল হচ্ছে…",
  ],
  // Empty lobby message on host
  emptyLobby: [
    "এখনো কেউ জয়েন করেনি…",
    "কেউ আসুক, একটু লজ্জা মোছা যাক…",
    "ফোন বের করুন, কোডটা টাইপ করুন।",
  ],
} as const;

// Deterministic-when-seeded picker.
// If seed is undefined, returns a random one.
// Note: when no seed is provided, this is non-deterministic — only safe inside
// effects/state, not during SSR render. Pass a stable number (e.g. round) when
// the call happens in render to avoid hydration mismatch + flicker.
export function pickPhrase(pool: PhrasePool, seed?: number | string): string {
  if (pool.length === 0) return "";
  if (typeof seed === "number") {
    const i = Math.abs(Math.floor(seed)) % pool.length;
    return pool[i];
  }
  if (typeof seed === "string") {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return pool[Math.abs(h) % pool.length];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
