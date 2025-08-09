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

    // helper: collision test against segmentation mask at arbitrary x/y
    const collides = (ltr: Letter, testX: number, testY: number) => {
      const mask = maskRef.current;
      if (!mask) return false;
      const halfW = Math.floor(ltr.width / 2);
      const left = Math.floor(testX - halfW);
      const right = Math.floor(testX + halfW);
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

    // Try to find the nearest non-colliding spot around (x,y) within a small radius
    function resolveCollisionMultiDir(ltr: Letter): void {
      // Limit search radius by maxResolveSteps to keep performance bounded
      const maxStep = Math.max(0, maxResolveSteps);
      const minX = ltr.width / 2;
      const maxX = width - ltr.width / 2;
      const minY = 0;
      const maxY = height - fontSize;

      for (let step = 1; step <= maxStep; step++) {
        // Check cardinal directions first, then diagonals for this radius
        const candidates: Array<[number, number]> = [
          [ltr.x, ltr.y - step], // up
          [ltr.x + step, ltr.y], // right
          [ltr.x - step, ltr.y], // left
          [ltr.x, ltr.y + step], // down
          [ltr.x + step, ltr.y - step], // up-right
          [ltr.x - step, ltr.y - step], // up-left
          [ltr.x + step, ltr.y + step], // down-right
          [ltr.x - step, ltr.y + step], // down-left
        ];
        for (const [nx, ny] of candidates) {
          // clamp into bounds before testing
          const cx = Math.min(maxX, Math.max(minX, nx));
          const cy = Math.min(maxY, Math.max(minY, ny));
          if (!collides(ltr, cx, cy)) {
            ltr.x = cx;
            ltr.y = cy;
            return;
          }
        }
      }
      // If unresolved, try nudging up minimally as a last resort while clamped
      const cy = Math.max(minY, Math.min(maxY, ltr.y - 1));
      if (!collides(ltr, ltr.x, cy)) {
        ltr.y = cy;
      }
    }

    // When gravity is blocked but the letter is not currently overlapping the mask,
    // try to slide around it by preferring lateral and downward moves first.
    function resolveAroundPreferLateral(ltr: Letter, preferDir: -1 | 0 | 1): void {
      const maxStep = Math.max(0, maxResolveSteps);
      const minX = ltr.width / 2;
      const maxX = width - ltr.width / 2;
      const minY = 0;
      const maxY = height - fontSize;

      for (let step = 1; step <= maxStep; step++) {
        const rightFirst = preferDir >= 1;
        const candidates: Array<[number, number]> = rightFirst
          ? [
              [ltr.x + step, ltr.y], // right
              [ltr.x + step, ltr.y + step], // down-right
              [ltr.x, ltr.y + step], // down
              [ltr.x - step, ltr.y], // left
              [ltr.x - step, ltr.y + step], // down-left
              [ltr.x + step, ltr.y - step], // up-right (fallback)
              [ltr.x - step, ltr.y - step], // up-left (fallback)
              [ltr.x, ltr.y - step], // up (fallback)
            ]
          : [
              [ltr.x - step, ltr.y], // left
              [ltr.x - step, ltr.y + step], // down-left
              [ltr.x, ltr.y + step], // down
              [ltr.x + step, ltr.y], // right
              [ltr.x + step, ltr.y + step], // down-right
              [ltr.x - step, ltr.y - step], // up-left (fallback)
              [ltr.x + step, ltr.y - step], // up-right (fallback)
              [ltr.x, ltr.y - step], // up (fallback)
            ];
        for (const [nx, ny] of candidates) {
          const cx = Math.min(maxX, Math.max(minX, nx));
          const cy = Math.min(maxY, Math.max(minY, ny));
          if (!collides(ltr, cx, cy)) {
            ltr.x = cx;
            ltr.y = cy;
            return;
          }
        }
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const now = Date.now();

      // set text styles once per frame
      ctx.fillStyle = fontColor;
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
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

        /* physics: ensure velocities exist */
        if (typeof ltr.vx !== "number") ltr.vx = 0;
        if (typeof ltr.vy !== "number") ltr.vy = 0;

        const GRAVITY = 0.6; // px/frame^2
        const TERMINAL_VEL = ltr.speed; // px/frame
        const FRICTION_AIR = 0.96;
        const FRICTION_GROUND = 0.85;

        // integrate vertical velocity with gravity and clamp to terminal velocity
        ltr.vy = Math.min(ltr.vy + GRAVITY, TERMINAL_VEL);
        const nextY = ltr.y + ltr.vy;
        const hitFloor = nextY + fontSize >= height;

        // Try natural gravity move if we won't collide
        if (!hitFloor && !collides(ltr, ltr.x, nextY)) {
          ltr.y = nextY;
        } else if (
          // Only attempt lateral/downward slide when gravity is blocked by the mask beneath,
          // NOT when blocked by the flat floor.
          !hitFloor &&
          !collides(ltr, ltr.x, ltr.y) &&
          collides(ltr, ltr.x, nextY)
        ) {
          // Determine preferred lateral slide direction and strength from local mask slope beneath the letter
          const dx = Math.max(2, Math.floor(fontSize / 6));
          const SAMPLE_ROWS = 6;
          let rightHits = 0;
          let leftHits = 0;
          for (let dy = 0; dy < SAMPLE_ROWS; dy++) {
            if (collides(ltr, ltr.x + dx, nextY + dy)) rightHits++;
            if (collides(ltr, ltr.x - dx, nextY + dy)) leftHits++;
          }
          const diff = Math.abs(rightHits - leftHits);
          let prefer: -1 | 0 | 1 = 0;
          if (rightHits > leftHits) prefer = -1; // more mask on right => slide left
          else if (leftHits > rightHits) prefer = 1; // more mask on left => slide right

          if (prefer !== 0 && diff > 0) {
            // Map slope strength to lateral pixels per frame
            const MIN_SLIDE = 0.5;
            const MAX_SLIDE = 4; // allow faster slide on steep slopes
            const strength = Math.min(1, diff / SAMPLE_ROWS);
            const slidePixels = MIN_SLIDE + (MAX_SLIDE - MIN_SLIDE) * strength;
            const dir = prefer;

            // Impart lateral momentum instead of only discrete sliding
            const IMPULSE_MIN = 0.25;
            const IMPULSE_MAX = 1.5;
            const impulse = IMPULSE_MIN + (IMPULSE_MAX - IMPULSE_MIN) * strength;
            ltr.vx += dir * impulse;

            // Blocked vertically: zero vertical velocity
            ltr.vy = 0;
          }
        }

        // If currently overlapping the mask, first push upward until clear (original behavior)
        if (collides(ltr, ltr.x, ltr.y)) {
          let steps = 0;
          while (collides(ltr, ltr.x, ltr.y) && ltr.y > 0 && steps < maxResolveSteps) {
            ltr.y -= 1;
            steps += 1;
          }
          // If still colliding after upward resolution, try multi-directional resolve
          if (collides(ltr, ltr.x, ltr.y)) {
            resolveCollisionMultiDir(ltr);
          }
          // Give a small upward impulse so it keeps moving briefly after clearing
          if (ltr.vy > -2) ltr.vy = -2;
        }

        /* clamp to floor */
        const onFloor = ltr.y + fontSize >= height - 0.5;
        if (onFloor) {
          ltr.y = height - fontSize;
          if (ltr.vy > 0) ltr.vy = 0;
        }

        /* horizontal movement from momentum with friction */
        const friction = onFloor ? FRICTION_GROUND : FRICTION_AIR;
        ltr.vx *= friction;
        if (Math.abs(ltr.vx) < 0.05) ltr.vx = 0;
        if (ltr.vx !== 0) {
          const step = ltr.vx > 0 ? 1 : -1;
          const steps = Math.min(6, Math.ceil(Math.abs(ltr.vx)));
          for (let s = 0; s < steps; s++) {
            const testX = ltr.x + step;
            if (!collides(ltr, testX, ltr.y)) {
              ltr.x = testX;
            } else {
              ltr.vx = 0;
              break;
            }
          }
        }

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
