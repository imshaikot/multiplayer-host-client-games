// Tag pools used to request reaction GIFs for different game moments.
// The actual fetch is proxied through /api/giphy so the API key stays
// server-side. If GIPHY_API_KEY is not set, the route returns 204 and the UI
// falls back to a big emoji.

export type GifMoment =
  | "winner"
  | "loser"
  | "submit"
  | "judging"
  | "gameWin";

const TAGS: Record<GifMoment, string[]> = {
  winner: ["celebrate", "winning", "yes", "trophy", "victory dance"],
  loser: ["disappointed", "facepalm", "sad", "shame"],
  submit: ["finger crossed", "praying", "waiting"],
  judging: ["thinking", "hmm", "judging"],
  gameWin: ["champion", "trophy", "crown", "epic win"],
};

export function tagsFor(moment: GifMoment): string {
  const pool = TAGS[moment];
  return pool[Math.floor(Math.random() * pool.length)];
}

export type GifData = {
  url: string;
  width: number;
  height: number;
  title: string;
};
