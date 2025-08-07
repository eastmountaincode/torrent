import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 3000;
const API_KEY = process.env.NEXT_PUBLIC_TITLES_API_KEY;
const API_URL = process.env.NEXT_PUBLIC_TITLES_API_URL;

// The hooks job is to fetch new titles and offer them to the parent
// It's not responsible for queue mutation, length, or what has been "seen"
// hook should be stateless

export function useRedditTitles() {
    const [titles, setTitles] = useState<string[]>([]);

    useEffect(() => {
        async function fetchTitles() {
            const res = await fetch(API_URL!, { headers: { "X-API-Key": API_KEY! }});
            const json = await res.json();
            setTitles(json.titles || []);
        }
        fetchTitles();
        const interval = setInterval(fetchTitles, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    return titles;
}
