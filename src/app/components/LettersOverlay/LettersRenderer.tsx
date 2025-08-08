"use client";
import { useEffect, useRef } from "react";
import { Letter } from "@/app/types/index";

interface Props {
  letters: Letter[];                 // provided by parent
  width:   number;
  height:  number;
  segmentationMask: ImageData | null;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  showHitbox: boolean;
  letterDurationMs: number;
  maxResolveSteps: number;
}

export default function LettersRenderer({
  letters,
  width,
  height,
  segmentationMask,
  fontSize,
  fontFamily,
  fontColor,
  showHitbox,
  letterDurationMs,
  maxResolveSteps,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<ImageData | null>(null);
  const lettersRef = useRef<Letter[]>(letters);

  // keep latest references without restarting the RAF loop
  useEffect(() => {
    maskRef.current = segmentationMask;
  }, [segmentationMask]);

  useEffect(() => {
    lettersRef.current = letters;
  }, [letters]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let rafId: number;

    // helper: collision test against segmentation mask
    const collides = (ltr: Letter, testY: number) => {
      const mask = maskRef.current;
      if (!mask) return false;
      const left = Math.floor(ltr.x - ltr.width / 2);
      const right = Math.floor(ltr.x + ltr.width / 2);
      const yPix = Math.floor(testY + fontSize);
      if (yPix < 0 || yPix >= height) return false;

      const data = mask.data;
      const rowBase = yPix * width * 4;
      for (let px = left; px <= right; px += 4) {
        if (px < 0 || px >= width) continue;
        const alphaIdx = rowBase + px * 4 + 3;
        if (data[alphaIdx] > 0) return true;
      }
      return false;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const now = Date.now();

      // set text styles once per frame
      ctx.fillStyle = fontColor;
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // iterate over the letter objects *by reference*
      const list = lettersRef.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const ltr = list[i];

        // remove expired letters (parent may also prune if desired)
        if (now - ltr.createdAt > letterDurationMs) {
          list.splice(i, 1);
          continue;
        }

        /* gravity */
        const nextY = ltr.y + ltr.speed;
        const hitFloor = nextY + fontSize >= height;

        if (!hitFloor && !collides(ltr, nextY)) {
          ltr.y = nextY;
        }

        /* if overlapping the mask, push upward until clear */
        let resolveSteps = 0;
        while (collides(ltr, ltr.y) && ltr.y > 0 && resolveSteps < maxResolveSteps) {
          ltr.y -= 1;
          resolveSteps += 1;
        }

        /* clamp to floor */
        if (ltr.y + fontSize > height) ltr.y = height - fontSize;

        /* draw */
        if (ltr.color) {
          ctx.fillStyle = ltr.color;
        } else {
          ctx.fillStyle = fontColor;
        }
        ctx.fillText(ltr.char, ltr.x, ltr.y);

        if (showHitbox) {
          ctx.strokeStyle = "lime";
          ctx.strokeRect(ltr.x - ltr.width / 2, ltr.y, ltr.width, fontSize);
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
    />
  );
}
