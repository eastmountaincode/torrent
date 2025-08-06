import { useEffect, useRef } from "react";
import { Letter } from "@/app/types";

interface LetterSpawnerProps {
  titlesQueue: string[];                    // From Reddit
  lettersRef: React.MutableRefObject<Letter[]>;
  spawnLetters: boolean;
  width: number;
  fontSize: number;
  letterFallSpeed: number;
  lettersPerSecond: number;
  letterSpawnInterval: number;
}

export default function LetterSpawner({
  titlesQueue,
  lettersRef,
  spawnLetters,
  width,
  fontSize,
  letterFallSpeed,
  lettersPerSecond,
  letterSpawnInterval,
}: LetterSpawnerProps) {
  // offscreen canvas for accurate text measurement
  const measureCtx = useRef<CanvasRenderingContext2D | null>(null);
  // pointer to where in the queue we are
  const titleIdx = useRef(0);
  const letterIdx = useRef(0);

  useEffect(() => {
    if (!spawnLetters) return;

    // build offscreen context if needed
    if (!measureCtx.current) {
      const off = document.createElement("canvas");
      measureCtx.current = off.getContext("2d");
      measureCtx.current!.font = `${fontSize}px monospace`;
    }

    function spawn() {
      const now = Date.now();
      const ctx = measureCtx.current;
      if (!ctx) return;

      for (let i = 0; i < lettersPerSecond; i++) {
        // Get the current title and letter index
        const title = titlesQueue[titleIdx.current];
        if (!title) return; // nothing to show

        const char = title[letterIdx.current];
        if (!char) {
          // Move to next title in the queue
          titleIdx.current = (titleIdx.current + 1) % titlesQueue.length;
          letterIdx.current = 0;
          continue;
        }
        ctx.font = `${fontSize}px monospace`;
        const txtWidth = ctx.measureText(char).width;
        const randomX = txtWidth / 2 + Math.random() * (width - txtWidth);

        lettersRef.current.push({
          char,
          x: randomX,
          y: 0,
          width: txtWidth,
          createdAt: now,
          speed: letterFallSpeed,
        });

        letterIdx.current += 1;
        if (letterIdx.current >= title.length) {
          // Move to next title when done
          titleIdx.current = (titleIdx.current + 1) % titlesQueue.length;
          letterIdx.current = 0;
        }
      }
    }

    const id = setInterval(spawn, letterSpawnInterval);
    return () => clearInterval(id);
  }, [
    spawnLetters,
    titlesQueue,
    width,
    fontSize,
    letterFallSpeed,
    lettersPerSecond,
    letterSpawnInterval,
    lettersRef,
  ]);

  return null; // nothing to render
}
