import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 3000;
const MAX_QUEUE_LENGTH = 200;
const API_KEY = process.env.NEXT_PUBLIC_TITLES_API_KEY;
const API_URL = process.env.NEXT_PUBLIC_TITLES_API_URL;

export function useRedditTitles() {
    const [queue, setQueue] = useState<string[]>([]);
    const seen = useRef<Set<string>>(new Set());

    useEffect(() => {
        async function fetchTitles() {
            const res = await fetch(API_URL!, {
                headers: { "X-API-Key": API_KEY! }
            });
            const json = await res.json();
            // Only push titles not already seen
            const newTitles = (json.titles || []).filter((t: string) => !seen.current.has(t));
            if (newTitles.length) {
                setQueue(prev => {
                    // add new titles to the queue, but keep the queue at most MAX_QUEUE_LENGTH, remove the oldest titles
                    // new titles get added to the end of the set, because we're concatenating the previous queue with the new titles
                    // so -MAX_QUEUE_LENGTH gets us the last MAX_QUEUE_LENGTH titles
                    const nextQueue = [...prev, ...newTitles].slice(-MAX_QUEUE_LENGTH);

                    // make sure 'seen' does not grow indefinitely—keep only items currently in the queue
                    seen.current = new Set(nextQueue);

                    return nextQueue;
                });
            }
        }
        fetchTitles();
        const interval = setInterval(fetchTitles, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    return queue;
}
