import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Verifies the host PIN entirely on the server — the secret lives in the
// HOST_PIN env var and is never shipped to the client. The browser only learns
// whether it was right (and remembers that "unlocked" flag for the session).
//
// This is still a soft gate (a correct PIN just flips a client-side flag, and
// nothing stops a script from hitting the Socket.IO server directly), but the
// PIN itself is no longer guessable from the bundle.
export async function POST(req: Request) {
  const expected = (process.env.HOST_PIN || "BORA").trim().toUpperCase();

  let pin = "";
  try {
    const body = await req.json();
    pin = typeof body?.pin === "string" ? body.pin : "";
  } catch {
    pin = "";
  }

  const ok = pin.trim().toUpperCase() === expected;
  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
