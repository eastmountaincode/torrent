"use client";
import { useEffect, useRef } from "react";

export interface Letter {
  char: string;
  x: number;        // center-x
  y: number;        // top-y
  width: number;    // measured text width
  createdAt: number;
  speed: number;
}

// Rendering-only constants (tweak as you like)
const FONT_SIZE   = 40;
const SHOW_HITBOX = false;
const LETTER_DURATION  = 4_000;   // ms each letter lives

interface Props {
  letters: Letter[];                 // provided by parent
  width:   number;
  height:  number;
  segmentationMask: ImageData | null;
}

export default function LettersRenderer({
  letters,
  width,
  height,
  segmentationMask,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let rafId: number;

    // helper: collision test against segmentation mask
    const collides = (ltr: Letter, testY: number) => {
      if (!segmentationMask) return false;
      const left  = Math.floor(ltr.x - ltr.width / 2);
      const right = Math.floor(ltr.x + ltr.width / 2);
      const yPix  = Math.floor(testY + FONT_SIZE);
      if (yPix < 0 || yPix >= height) return false;

      for (let px = left; px <= right; px += 4) {
        if (px < 0 || px >= width) continue;
        const alphaIdx = (yPix * width + px) * 4 + 3;
        if (segmentationMask.data[alphaIdx] > 0) return true;
      }
      return false;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const now = Date.now();

      // iterate over the letter objects *by reference*
      for (let i = letters.length - 1; i >= 0; i--) {
        const ltr = letters[i];

        // remove expired letters (parent may also prune if desired)
        if (now - ltr.createdAt > LETTER_DURATION) {
          letters.splice(i, 1);
          continue;
        }

        /* gravity */
        const nextY    = ltr.y + ltr.speed;
        const hitFloor = nextY + FONT_SIZE >= height;

        if (!hitFloor && !collides(ltr, nextY)) {
          ltr.y = nextY;
        }

        /* if overlapping the mask, push upward until clear */
        while (collides(ltr, ltr.y) && ltr.y > 0) {
          ltr.y -= 1;
        }

        /* clamp to floor */
        if (ltr.y + FONT_SIZE > height) ltr.y = height - FONT_SIZE;

        /* draw */
        ctx.fillStyle = "white";
        ctx.font = `${FONT_SIZE}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(ltr.char, ltr.x, ltr.y);

        if (SHOW_HITBOX) {
          ctx.strokeStyle = "lime";
          ctx.strokeRect(ltr.x - ltr.width / 2, ltr.y, ltr.width, FONT_SIZE);
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [letters, width, height, segmentationMask]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
    />
  );
}
