import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxy to Giphy's random endpoint so the API key stays on the server.
// Returns 204 when no key is configured — the UI falls back to an emoji.
export async function GET(req: Request) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return new NextResponse(null, { status: 204 });
  }

  const { searchParams } = new URL(req.url);
  const tag = searchParams.get("tag") || "funny";

  const url = new URL("https://api.giphy.com/v1/gifs/random");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("tag", tag);
  url.searchParams.set("rating", "pg-13");

  try {
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) return new NextResponse(null, { status: 204 });
    const json = await r.json();
    const data = json?.data;
    const img = data?.images?.fixed_height || data?.images?.original;
    if (!img?.url) return new NextResponse(null, { status: 204 });
    return NextResponse.json({
      url: img.url,
      width: Number(img.width) || 240,
      height: Number(img.height) || 200,
      title: data?.title || "",
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
