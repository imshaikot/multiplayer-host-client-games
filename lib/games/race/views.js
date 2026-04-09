// Race view builders. Critical: a player's currentPrompt is NEVER in the
// public (host) view. The Host display only sees lanes — that's the whole point of
// the game. Only the owning player's playerView includes their prompt.

const logic = require("./logic");

function lanePublic(room, player) {
  const ps = room.playerState[player.id];
  const fromId = ps?.bananaFromId ?? null;
  const fromName = fromId
    ? (room.players.find((p) => p.id === fromId)?.name ?? null)
    : null;
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    progress: ps?.progress ?? 0,
    progressAt: ps?.progressAt ?? room.startedAt ?? 0,
    state: ps?.state ?? "idle",
    fallUntil: ps?.fallUntil ?? null,
    correctCount: ps?.correctCount ?? 0,
    fallCount: ps?.fallCount ?? 0,
    finishPosition: ps?.finishPosition ?? null,
    incomingBananaAt: ps?.incomingBananaAt ?? null,
    incomingBananaProgress: ps?.incomingBananaProgress ?? null,
    bananaFromName: fromName,
  };
}

function publicRoomState(room) {
  return {
    gameType: "race",
    code: room.code,
    phase: room.phase,
    trackLength: room.trackLength,
    baselineRate: room.baselineRate,
    raceSeconds: room.raceSeconds,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    serverNow: Date.now(),
    players: room.players.map((p) => lanePublic(room, p)),
    finishOrder: room.finishOrder || [],
    endReason: room.endReason || null,
  };
}

function playerView(room, socketId) {
  const player = room.players.find((p) => p.id === socketId);
  if (!player) return null;
  const ps = room.playerState[socketId];
  const fromId = ps?.bananaFromId ?? null;
  const fromName = fromId
    ? (room.players.find((p) => p.id === fromId)?.name ?? null)
    : null;
  // Resolve the would-be banana target once on the server so the play UI
  // can decide whether to enable the throw button — and show whose name
  // is currently in the crosshairs.
  let bananaTargetName = null;
  if (room.phase === "racing" && ps?.state === "running") {
    const target = logic.findBananaTarget(room, socketId);
    if (target) bananaTargetName = target.name;
  }
  const you = {
    id: player.id,
    name: player.name,
    state: ps?.state ?? "idle",
    progress: ps?.progress ?? 0,
    progressAt: ps?.progressAt ?? room.startedAt ?? 0,
    fallUntil: ps?.fallUntil ?? null,
    finishPosition: ps?.finishPosition ?? null,
    currentPrompt: ps?.currentPrompt ?? null,
    correctCount: ps?.correctCount ?? 0,
    fallCount: ps?.fallCount ?? 0,
    incomingBananaAt: ps?.incomingBananaAt ?? null,
    bananaFromName: fromName,
    bananaTargetName,
  };
  return {
    gameType: "race",
    you,
    room: publicRoomState(room),
  };
}

module.exports = { publicRoomState, playerView };
