import { useEffect, useRef } from "react";
import LettersRenderer from "./LettersRenderer";
import { useRedditTitles } from "@/app/hooks/useRedditTitles";
import LetterSpawner from "./LetterSpawner";
import { Letter } from "@/app/types";

const LETTERS_PER_SECOND = 5;
const LETTER_FALL_SPEED = 3;
const LETTER_FONT_SIZE = 40;
const LETTER_SPAWN_INTERVAL = 100;

export default function LettersOverlay({
    width,
    height,
    segmentationMask,
    spawnLetters
}: {
    width: number;
    height: number;
    segmentationMask: ImageData | null;
    spawnLetters: boolean;
}) {
    const lettersRef = useRef<Letter[]>([]);
    const titlesQueue = useRedditTitles();

    return (
        <>
        <LetterSpawner
            titlesQueue={titlesQueue}
            lettersRef={lettersRef}
            spawnLetters={spawnLetters}
            width={width}
            fontSize={LETTER_FONT_SIZE}
            letterFallSpeed={LETTER_FALL_SPEED}
            lettersPerSecond={LETTERS_PER_SECOND}
            letterSpawnInterval={LETTER_SPAWN_INTERVAL}
        />
        <LettersRenderer
            letters={lettersRef.current}
            width={width}
            height={height}
            segmentationMask={segmentationMask}
        />
        </>
    );
}
