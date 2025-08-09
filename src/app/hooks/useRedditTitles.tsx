import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 2000;
const API_KEY = process.env.NEXT_PUBLIC_TITLES_API_KEY;
const API_URL = process.env.NEXT_PUBLIC_TITLES_API_URL || "/api/titles-proxy";

// The hooks job is to fetch new titles and offer them to the parent
// It's not responsible for queue mutation, length, or what has been "seen"
// hook should be stateless

export function useRedditTitles() {
    const [titles, setTitles] = useState<string[]>([]);

    useEffect(() => {
        async function fetchTitles() {
            // Runtime guard: if on HTTPS and the configured URL is HTTP, force the proxy
            let effectiveUrl = API_URL;
            try {
                if (typeof window !== 'undefined' && window.location.protocol === 'https:' && /^http:\/\//i.test(API_URL)) {
                    effectiveUrl = '/api/titles-proxy';
                }
            } catch {}
            try {
                const res = await fetch(effectiveUrl, { headers: API_KEY ? { "X-API-Key": API_KEY } : undefined, cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json().catch(() => ({ titles: [] }));
                const arr = Array.isArray(json.titles) ? json.titles : [];
                setTitles(arr);
            } catch {
                setTitles([]);
            }
        }
        fetchTitles();
        const interval = setInterval(fetchTitles, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    return titles;
}
