import { NextResponse } from "next/server";

export async function GET() {
    const res = await fetch("https://www.reddit.com/r/all/new.json?limit=100")
    // Defensive: Check if fetch succeeded and content is JSON
    if (!res.ok) {
        return NextResponse.json({ titles: [] }, { status: res.status });
    }
    let data;
    try {
        data = await res.json();
    } catch (e) {
        // Could not parse JSON (probably an error page)
        return NextResponse.json({ titles: [] }, { status: 500 });
    }
    const titles = Array.isArray(data?.data?.children)
        ? data.data.children.map((child: any) => child.data.title)
        : [];

    return NextResponse.json({ titles });
}