import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REDDIT_TIMEOUT_MS = 5000;

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REDDIT_TIMEOUT_MS);

    try {
        const res = await fetch("https://www.reddit.com/r/all/new.json?limit=100", {
            cache: "no-store",
            signal: controller.signal,
        });
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
    } catch (error) {
        const status = error instanceof Error && error.name === "AbortError" ? 504 : 502;
        return NextResponse.json({ titles: [] }, { status });
    } finally {
        clearTimeout(timeoutId);
    }
}
