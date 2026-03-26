// ---------- CAH ----------

export type Card = { id: number; text: string; pick?: number };

export type CahPublicPlayer = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  handCount: number;
};

export type CahRoomPhase =
  | "lobby"
  | "submitting"
  | "judging"
  | "reveal"
  | "gameOver";

export type CahPublicRoomState = {
  gameType: "cah";
  code: string;
  phase: CahRoomPhase;
  round: number;
  czarId: string | null;
  blackCard: Card | null;
  players: CahPublicPlayer[];
  submissions: { id: string; cards: Card[]; revealed: boolean }[];
  winnerLastRound: {
    playerId: string;
    playerName: string;
    cards: Card[];
  } | null;
  scoreToWin: number;
};

export type CahPlayerView = {
  gameType: "cah";
  you: {
    id: string;
    name: string;
    isCzar: boolean;
    score: number;
    hand: Card[];
  };
  room: CahPublicRoomState;
};

// ---------- Ja Nach ----------

export type JanachWord = {
  word: string;
  modifier?: string;
  // Alternate accepted spellings for words with common variants (e.g. "biryani"
  // for "biriyani", "jalebi" for "jilapi"). Only needed when the alternate is
  // > 1 edit away from `word` — anything closer is already caught by the
  // Levenshtein-≤1 matcher. Accepted at full points.
  aliases?: string[];
  // Common spelling MISTAKES. Accepted but always scored as a `close` hit, so
  // they earn reduced points. Same > 1 edit caveat as aliases.
  typos?: string[];
};

export type JanachPublicPlayer = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
};

export type JanachCorrectGuesser = {
  playerId: string;
  playerName: string;
  points: number;
  close: boolean;
};

export type JanachGuessLogEntry = {
  playerId: string;
  playerName: string;
  text: string;
  ts: number;
};

export type JanachRoundResults = {
  reason: "complete" | "timeout" | "drawerLeft";
  word: JanachWord | null;
  drawerId: string | null;
  drawerName: string | null;
  drawerPoints: number;
  correctGuessers: JanachCorrectGuesser[];
};

export type JanachRoomPhase =
  | "lobby"
  | "choosing"
  | "drawing"
  | "reveal"
  | "gameOver";

export type JanachPublicRoomState = {
  gameType: "janach";
  code: string;
  phase: JanachRoomPhase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  drawSeconds: number;
  chooseSeconds: number;
  chooseEndsAt: number | null;
  roundEndsAt: number | null;
  wordMask: string;
  wordLength: number;
  players: JanachPublicPlayer[];
  correctGuessers: JanachCorrectGuesser[];
  guessLog: JanachGuessLogEntry[];
  roundResults: JanachRoundResults | null;
};

export type JanachPlayerView = {
  gameType: "janach";
  you: {
    id: string;
    name: string;
    score: number;
    isDrawer: boolean;
    hasGuessedCorrectly: boolean;
    sittingOut: boolean;
    secretWord: JanachWord | null;
    wordOptions: JanachWord[] | null;
  };
  room: JanachPublicRoomState;
};

// ---------- Wire shapes for the live drawing channel ----------

export type StrokePoint = { x: number; y: number };

export type StrokePayload = {
  id: string;
  points: StrokePoint[];
  color: string;
  size: number;
  end: boolean;
};

// ---------- Race ----------

export type RaceLaneState = "idle" | "running" | "fallen" | "finished";

export type RaceRoomPhase = "lobby" | "racing" | "finished";

export type RacePrompt = { text: string; score: number };

export type RaceLanePublic = {
  id: string;
  name: string;
  connected: boolean;
  progress: number;
  progressAt: number;
  state: RaceLaneState;
  fallUntil: number | null;
  correctCount: number;
  fallCount: number;
  finishPosition: number | null;
  // Banana-peel sabotage: a peel thrown at this lane is pending until
  // incomingBananaAt elapses, then the runner slips. incomingBananaProgress
  // is the fixed track position where the peel sits.
  incomingBananaAt: number | null;
  incomingBananaProgress: number | null;
  bananaFromName: string | null;
};

export type RaceFinishEntry = {
  playerId: string;
  name: string;
  finishedAt: number | null;
  position: number;
};

export type RacePublicRoomState = {
  gameType: "race";
  code: string;
  phase: RaceRoomPhase;
  trackLength: number;
  baselineRate: number;
  raceSeconds: number;
  startedAt: number | null;
  endsAt: number | null;
  // serverNow is the server's Date.now() at broadcast time. Clients can use
  // it to compute an offset from local Date.now() if wall-clocks drift, but
  // for LAN play it's mostly informational.
  serverNow: number;
  players: RaceLanePublic[];
  finishOrder: RaceFinishEntry[];
  endReason: "timeout" | "all_finished" | "podium" | null;
};

export type RacePlayerView = {
  gameType: "race";
  you: {
    id: string;
    name: string;
    state: RaceLaneState;
    progress: number;
    progressAt: number;
    fallUntil: number | null;
    finishPosition: number | null;
    currentPrompt: RacePrompt | null;
    correctCount: number;
    fallCount: number;
    // Banana sabotage UI bits — incomingBananaAt drives the warning banner;
    // bananaTargetName is the would-be victim (if any), and null means the
    // throw button is disabled (no eligible neighbor).
    incomingBananaAt: number | null;
    bananaFromName: string | null;
    bananaTargetName: string | null;
  };
  room: RacePublicRoomState;
};

// ---------- Unions exposed to clients ----------

export type PublicRoomState =
  | CahPublicRoomState
  | JanachPublicRoomState
  | RacePublicRoomState;
export type PlayerView = CahPlayerView | JanachPlayerView | RacePlayerView;
