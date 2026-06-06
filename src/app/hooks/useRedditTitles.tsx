import { useEffect, useRef, useState } from "react";
import { TitlesStatus } from "../types";

const POLL_INTERVAL = 2000;
const REQUEST_TIMEOUT_MS = 6000;
const REQUEST_ABORT_GRACE_MS = 2000;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 10000;
const STREAM_HEALTH_INTERVAL_MS = 5000;
const MISSED_POLL_GRACE_MS = 4000;
const API_KEY = process.env.NEXT_PUBLIC_TITLES_API_KEY;
const API_URL = process.env.NEXT_PUBLIC_TITLES_API_URL || "/api/titles-proxy";

// The hooks job is to fetch new titles and offer them to the parent
// It's not responsible for queue mutation, length, or what has been "seen"
// hook should be stateless

export function useRedditTitlesState() {
    const [titles, setTitles] = useState<string[]>([]);
    const [status, setStatus] = useState<TitlesStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const hasLoadedTitlesRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        let retryCount = 0;
        let timerId: number | null = null;
        let activeRequest: AbortController | null = null;
        let requestStartedAt = 0;
        let nextFetchDueAt = 0;
        let lastFinishedAt = Date.now();

        const clearTimer = () => {
            if (timerId !== null) {
                window.clearTimeout(timerId);
                timerId = null;
            }
            nextFetchDueAt = 0;
        };

        const scheduleFetch = (delayMs: number) => {
            if (cancelled) return;
            clearTimer();
            nextFetchDueAt = Date.now() + delayMs;
            timerId = window.setTimeout(fetchTitles, delayMs);
        };

        const retryDelay = () => {
            const delay = RETRY_BASE_DELAY_MS * 2 ** Math.min(retryCount, 4);
            return Math.min(RETRY_MAX_DELAY_MS, delay);
        };

        async function fetchTitles() {
            if (cancelled || activeRequest) return;
            if (!hasLoadedTitlesRef.current) {
                setStatus("loading");
            }
            // Runtime guard: if on HTTPS and the configured URL is HTTP, force the proxy
            let effectiveUrl = API_URL;
            try {
                if (typeof window !== 'undefined' && window.location.protocol === 'https:' && /^http:\/\//i.test(API_URL)) {
                    effectiveUrl = '/api/titles-proxy';
                }
            } catch {}
            const request = new AbortController();
            const timeoutId = window.setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);
            activeRequest = request;
            requestStartedAt = Date.now();
            nextFetchDueAt = 0;

            try {
                const res = await fetch(effectiveUrl, {
                    headers: API_KEY ? { "X-API-Key": API_KEY } : undefined,
                    cache: "no-store",
                    signal: request.signal,
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json().catch(() => ({ titles: [] }));
                const arr = Array.isArray(json.titles) ? json.titles : [];
                setTitles(arr);
                setError(null);
                retryCount = 0;
                if (arr.length > 0) {
                    hasLoadedTitlesRef.current = true;
                    setStatus("ready");
                } else if (!hasLoadedTitlesRef.current) {
                    setStatus("empty");
                } else {
                    setStatus("ready");
                }
                scheduleFetch(POLL_INTERVAL);
            } catch (err) {
                if (cancelled) return;
                retryCount += 1;
                setError(err instanceof Error ? err.message : "Unable to reach title stream");
                setStatus(hasLoadedTitlesRef.current ? "reconnecting" : "reconnecting");
                if (!hasLoadedTitlesRef.current) {
                    setTitles([]);
                }
                scheduleFetch(retryDelay());
            } finally {
                window.clearTimeout(timeoutId);
                if (activeRequest === request) {
                    activeRequest = null;
                }
                requestStartedAt = 0;
                lastFinishedAt = Date.now();
            }
        }

        const fetchSoon = () => {
            if (cancelled) return;
            if (activeRequest) return;
            retryCount = 0;
            scheduleFetch(0);
        };

        fetchTitles();

        // Resume polling immediately when tab regains focus
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchSoon();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener("online", fetchSoon);
        const healthInterval = window.setInterval(() => {
            if (cancelled) return;

            const now = Date.now();
            if (activeRequest) {
                if (requestStartedAt > 0 && now - requestStartedAt > REQUEST_TIMEOUT_MS + REQUEST_ABORT_GRACE_MS) {
                    activeRequest.abort();
                }
                return;
            }

            const missedScheduledPoll = nextFetchDueAt > 0 && now - nextFetchDueAt > MISSED_POLL_GRACE_MS;
            const noScheduledPoll = nextFetchDueAt === 0 && now - lastFinishedAt > POLL_INTERVAL + MISSED_POLL_GRACE_MS;
            if (missedScheduledPoll || noScheduledPoll) {
                setStatus(hasLoadedTitlesRef.current ? "reconnecting" : "reconnecting");
                fetchSoon();
            }
        }, STREAM_HEALTH_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearTimer();
            window.clearInterval(healthInterval);
            activeRequest?.abort();
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener("online", fetchSoon);
        };
    }, []);

    return { titles, status, error };
}

export function useRedditTitles() {
    return useRedditTitlesState().titles;
}
