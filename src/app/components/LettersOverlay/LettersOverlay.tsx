import { useEffect, useRef, useState } from "react";
import LettersRenderer from "./LettersRenderer";
import { useRedditTitles } from "@/app/hooks/useRedditTitles";
import LetterSpawner from "./LetterSpawner";
import { Letter } from "@/app/types";

const MAX_QUEUE_LENGTH = 300;
const MAX_SEEN_LENGTH = MAX_QUEUE_LENGTH * 3;

const LETTERS_PER_SECOND = 800; // overall emission rate (letters/second)
const LETTER_FALL_SPEED_MIN = 4;
const LETTER_FALL_SPEED_MAX = 6;
const LETTER_FONT_SIZE = 50;
const LETTER_FONT_FAMILY = '"ChicagoKare", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Noto Sans CJK JP", "Noto Sans CJK KR", "Noto Sans CJK SC", "Noto Sans Arabic", "Noto Sans", sans-serif';
const LETTER_FONT_COLOR = "#000000"; // canvas fillStyle-compatible color
const LETTER_DURATION_MS = 5500; // ms each letter lives
const MAX_RESOLVE_STEPS = 14; // cap how many pixels we push up to escape mask
const SHOW_HITBOX = false;


export default function LettersOverlay({
    width,
    height,
    segmentationMask,
    spawnLetters,
    onQueueLengthChange
}: {
    width: number;
    height: number;
    segmentationMask: ImageData | null;
    spawnLetters: boolean;
    onQueueLengthChange: (n: number) => void;
}) {

    // fetchedTitles holds the latest output from the titles API
    const fetchedTitles = useRedditTitles();

    // titlesQueue stores the list of titles waiting to be used. 
    // Only new (unseen) titles are added, ensuring no duplicates, and old ones are pruned to stay within MAX_QUEUE_LENGTH.
    const [titlesQueue, setTitlesQueue] = useState<string[]>([]);

    // seen is a set of titles we saw last time we fetched titles
    const [seen, setSeen] = useState<Set<string>>(new Set());

    // lettersRef is a ref to the current list of individual letters being rendered
    const lettersRef = useRef<Letter[]>([]);

    // Remove a title from the queue after using it (if needed)
    function removeTitle(idx: number) {
        setTitlesQueue(prev => prev.filter((_, i) => i !== idx));
    }

    // After every update to titlesQueue, report length
    useEffect(() => {
        if (onQueueLengthChange) onQueueLengthChange(titlesQueue.length);
    }, [titlesQueue, onQueueLengthChange]);

    // On every fetch, filter out already-seen titles and update queue and seen
    useEffect(() => {
        // filter newTitles to be only titles that are not in seen
        const newTitles = fetchedTitles.filter(t => !seen.has(t));
        // then, if there are new titles...
        if (newTitles.length) {
            // use an updater function, which is good practice when the next state depends on the previous state
            setTitlesQueue(prev => {
                // set next to be the previous queue, plus the new titles, but only keep the last MAX_QUEUE_LENGTH titles
                const next = [...prev, ...newTitles].slice(-MAX_QUEUE_LENGTH);
                // now we set seen in preparation for the next time we fetch titles
                // we want to ensure titles aren't readded to the queue and
                // - they were removed because they were used
                // - they are already in the queue
                setSeen(prevSeen => {
                    // prune seen
                    const next = [...prevSeen, ...newTitles].slice(-MAX_SEEN_LENGTH);
                    return new Set(next);
                });
                return next;
            });
        }
    }, [fetchedTitles]);

    return (
        <>
        <LetterSpawner
            titlesQueue={titlesQueue}
            removeTitle={removeTitle}
            lettersRef={lettersRef}
            spawnLetters={spawnLetters}
            width={width}
            fontSize={LETTER_FONT_SIZE}
            fontFamily={LETTER_FONT_FAMILY}
            letterFallSpeedMin={LETTER_FALL_SPEED_MIN}
            letterFallSpeedMax={LETTER_FALL_SPEED_MAX}
            lettersPerSecond={LETTERS_PER_SECOND}
        />
        <LettersRenderer
            letters={lettersRef.current}
            width={width}
            height={height}
            segmentationMask={segmentationMask}
            fontSize={LETTER_FONT_SIZE}
            fontFamily={LETTER_FONT_FAMILY}
            fontColor={LETTER_FONT_COLOR}
            showHitbox={SHOW_HITBOX}
            letterDurationMs={LETTER_DURATION_MS}
            maxResolveSteps={MAX_RESOLVE_STEPS}
        />
        </>
    );
}
