import { NextResponse } from "next/server";

export async function GET() {
  const upstream = process.env.TITLES_UPSTREAM_URL;
  const apiKey = process.env.TITLES_UPSTREAM_KEY;
  if (!upstream) {
    return NextResponse.json({ titles: [] }, { status: 500 });
  }
  try {
    const res = await fetch(upstream, {
      headers: apiKey ? { "X-API-Key": apiKey } : undefined,
      cache: "no-store",
      // Vercel edge/node can do HTTP even when page is HTTPS
    });
    if (!res.ok) {
      return NextResponse.json({ titles: [] }, { status: res.status });
    }
    // Defensive JSON parse
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return NextResponse.json({ titles: [] }, { status: 502 });
    }
    const titles = Array.isArray((json as any)?.titles)
      ? (json as any).titles.filter((t: unknown) => typeof t === "string" && t.length > 0)
      : [];
    return NextResponse.json({ titles }, { status: 200 });
  } catch {
    return NextResponse.json({ titles: [] }, { status: 502 });
  }
}


