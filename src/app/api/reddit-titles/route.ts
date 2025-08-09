import { NextResponse } from "next/server";

interface RedditChild {
    data?: {
        title?: string;
    };
}

interface RedditListing {
    data?: {
        children?: RedditChild[];
    };
}

export async function GET() {
    const res = await fetch("https://www.reddit.com/r/all/new.json?limit=100")
    // Defensive: Check if fetch succeeded and content is JSON
    if (!res.ok) {
        return NextResponse.json({ titles: [] }, { status: res.status });
    }
    let data: RedditListing | null = null;
    try {
        data = await res.json();
    } catch {
        // Could not parse JSON (probably an error page)
        return NextResponse.json({ titles: [] }, { status: 500 });
    }
    const titles = Array.isArray(data?.data?.children)
        ? data!.data!.children!
            .map((child) => child?.data?.title)
            .filter((t): t is string => typeof t === "string" && t.length > 0)
        : [];

    return NextResponse.json({ titles });
}