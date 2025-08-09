import { useEffect, useRef } from "react";
import { Letter } from "@/app/types";

interface LetterSpawnerProps {
  titlesQueue: string[];                    // From Reddit
  removeTitle: (idx: number) => void;
  lettersRef: React.MutableRefObject<Letter[]>;
  spawnLetters: boolean;
  width: number;
  fontSize: number;
  fontFamily: string;
  letterFallSpeedMin: number;
  letterFallSpeedMax: number;
  lettersPerSecond: number; // overall emission rate
}

export default function LetterSpawner({
  titlesQueue,
  removeTitle,
  lettersRef,
  spawnLetters,
  width,
  fontSize,
  fontFamily,
  letterFallSpeedMin,
  letterFallSpeedMax,
  lettersPerSecond,
}: LetterSpawnerProps) {
  const MAX_EMIT_PER_FRAME = 16; // cap to prevent bursty spawns on slow frames
  // offscreen canvas for accurate text measurement
  const measureCtx = useRef<CanvasRenderingContext2D | null>(null);
  // pointer to where in the queue we are
  const titleIdx = useRef(0);
  const letterIdx = useRef(0); // number of letters spawned for the current title
  // precomputed layout for the current title so randomly chosen letters still align to a single line
  const currentTitleStartLeft = useRef(0);
  const currentTitleTotalWidth = useRef(0);
  const currentTitleGlyphWidths = useRef<number[]>([]);
  const currentTitleOffsets = useRef<number[]>([]); // center-x for each glyph index
  const currentTitleRemainingIdxs = useRef<number[]>([]);
  const currentTitleGraphemes = useRef<string[]>([]);
  const MAX_GRAPHEMES_PER_TITLE = 4000;
  const currentTitleColor = useRef<string>("#000000");

  function clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function generateRainGrayColor(): string {
    // Gray values in a safe mid-range: avoid near-black and near-white.
    // Tweak these bounds to make the rain darker or lighter.
    const minGray = 60;   // 0 is black
    const maxGray = 210;  // 255 is white
    const base = Math.floor(minGray + Math.random() * (maxGray - minGray));

    // Add a tiny independent jitter per channel to keep very low saturation
    // instead of a perfectly neutral gray, which reads a bit lifeless.
    const jitterRange = 12; // ±6 variation
    const jitter = () => (Math.random() - 0.5) * jitterRange;
    const r = clampByte(base + jitter());
    const g = clampByte(base + jitter());
    const b = clampByte(base + jitter());
    return `rgb(${r}, ${g}, ${b})`;
  }

  function splitGraphemes(input: string): string[] {
    // Use Intl.Segmenter if available for proper grapheme clustering; otherwise fallback
    // to a basic code point split which handles surrogates but not complex ZWJ sequences.
    try {
      type Segment = { segment: string };
      type Segmenter = { segment: (input: string) => Iterable<Segment> };
      type SegmenterCtor = new (
        locales?: string | string[] | undefined,
        options?: { granularity: "grapheme" | "word" | "sentence" }
      ) => Segmenter;
      const intlWithSeg = Intl as unknown as { Segmenter?: SegmenterCtor };
      const Ctor = intlWithSeg.Segmenter;
      const seg = Ctor ? new Ctor(undefined, { granularity: "grapheme" }) : null;
      if (seg) {
        const out: string[] = [];
        for (const s of seg.segment(input)) out.push(s.segment);
        return out;
      }
      return Array.from(input);
    } catch {
      return Array.from(input);
    }
  }

  useEffect(() => {
    if (!spawnLetters) return;

    // build offscreen context if needed
    if (!measureCtx.current) {
      const off = document.createElement("canvas");
      measureCtx.current = off.getContext("2d");
      measureCtx.current!.font = `bold ${fontSize}px ${fontFamily}`;
    }

    let rafId: number | null = null;
    let lastTime = performance.now();
    let carry = 0; // fractional accumulator for emissions

    function spawnFrame(frameNow: number) {
      const dtSec = Math.max(0, (frameNow - lastTime) / 1000);
      lastTime = frameNow;
      carry += lettersPerSecond * dtSec;
      let emitCount = Math.floor(carry);
      if (emitCount > 0) carry -= emitCount;
      // clamp to smooth out large frame hitches
      if (emitCount > MAX_EMIT_PER_FRAME) {
        carry += emitCount - MAX_EMIT_PER_FRAME;
        emitCount = MAX_EMIT_PER_FRAME;
      }

      const createdAt = Date.now();
      const ctx = measureCtx.current;
      if (!ctx) return;

      for (let i = 0; i < emitCount; i++) {
        // Get the current title and letter index
        const title = titlesQueue[titleIdx.current];
        if (!title) return; // nothing to show
        if (typeof title !== "string" || title.length === 0) {
          // drop invalid/empty titles
          removeTitle(titleIdx.current);
          titleIdx.current = 0;
          letterIdx.current = 0;
          currentTitleStartLeft.current = 0;
          currentTitleTotalWidth.current = 0;
          currentTitleGlyphWidths.current = [];
          currentTitleOffsets.current = [];
          currentTitleRemainingIdxs.current = [];
          continue;
        }
        ctx.font = `bold ${fontSize}px ${fontFamily}`;

        // If starting a new title or finished previous, precompute layout
        if (letterIdx.current === 0 && currentTitleRemainingIdxs.current.length === 0) {
          // Build a line-wrapped layout by words so long bodies fit the canvas width.
          // 1) Tokenize by whitespace (preserve spaces as separate tokens)
          const tokens = title.split(/(\s+)/);

          // 2) Quick word-level line breaking using token widths
          type Line = { tokens: { text: string; width: number; isSpace: boolean }[]; width: number };
          const lines: Line[] = [];
          let current: Line = { tokens: [], width: 0 };
          for (const t of tokens) {
            const isSpace = /^\s+$/.test(t);
            // Skip leading spaces on a line
            if (isSpace && current.tokens.length === 0) continue;
            const w = ctx.measureText(t).width;
            if (!isSpace && current.width + w > width && current.tokens.length > 0) {
              lines.push(current);
              current = { tokens: [], width: 0 };
            }
            current.tokens.push({ text: t, width: w, isSpace });
            current.width += w;
          }
          if (current.tokens.length > 0) lines.push(current);

          // 3) Convert lines into per-grapheme arrays with randomized line start X so each line fits
          const graphemes: string[] = [];
          const widths: number[] = [];
          const offsets: number[] = [];

          for (const line of lines) {
            const lineWidth = line.width;
            const startX = Math.random() * Math.max(0, width - lineWidth);
            let acc = 0;
            for (const tok of line.tokens) {
              if (tok.isSpace) {
                // advance by space width but do not spawn a space glyph
                acc += tok.width;
                continue;
              }
              const gs = splitGraphemes(tok.text);
              for (const g of gs) {
                const gw = ctx.measureText(g).width;
                const cx = startX + acc + gw / 2;
                graphemes.push(g);
                widths.push(gw);
                offsets.push(cx);
                acc += gw;
                if (graphemes.length >= MAX_GRAPHEMES_PER_TITLE) break;
              }
              if (graphemes.length >= MAX_GRAPHEMES_PER_TITLE) break;
            }
            if (graphemes.length >= MAX_GRAPHEMES_PER_TITLE) break;
          }

          currentTitleGraphemes.current = graphemes;
          currentTitleGlyphWidths.current = widths;
          currentTitleOffsets.current = offsets;
          currentTitleTotalWidth.current = width; // not used anymore but keep populated
          currentTitleStartLeft.current = 0;
          currentTitleRemainingIdxs.current = Array.from({ length: graphemes.length }, (_, k) => k);
          currentTitleColor.current = generateRainGrayColor();
        }

        // If nothing remains for this title, finalize and move on
        if (currentTitleRemainingIdxs.current.length === 0) {
          removeTitle(titleIdx.current);
          titleIdx.current = 0;
          letterIdx.current = 0;
          currentTitleStartLeft.current = 0;
          currentTitleTotalWidth.current = 0;
          currentTitleGlyphWidths.current = [];
          currentTitleOffsets.current = [];
          currentTitleRemainingIdxs.current = [];
          continue;
        }

        // Pick a random remaining glyph index for this title
        const pool = currentTitleRemainingIdxs.current;
        const pickIdx = Math.floor(Math.random() * pool.length);
        const glyphIdx = pool[pickIdx];
        // remove picked index (swap with last for O(1) splice-like removal)
        const last = pool.length - 1;
        [pool[pickIdx], pool[last]] = [pool[last], pool[pickIdx]];
        pool.pop();

        // sanity guards
        const graphemes = currentTitleGraphemes.current;
        if (glyphIdx < 0 || glyphIdx >= graphemes.length) {
          continue;
        }
        const char = graphemes[glyphIdx];
        if (typeof char !== "string") {
          continue;
        }
        const glyphWidth = currentTitleGlyphWidths.current[glyphIdx];
        const xCenter = currentTitleOffsets.current[glyphIdx];
        if (!isFinite(glyphWidth) || !isFinite(xCenter)) {
          continue;
        }

        // pick a random speed within the configured range (order-agnostic)
        const sMin = Math.min(letterFallSpeedMin, letterFallSpeedMax);
        const sMax = Math.max(letterFallSpeedMin, letterFallSpeedMax);
        const speed = sMin + Math.random() * Math.max(0, sMax - sMin);
        lettersRef.current.push({
          char: char ?? "",
          x: xCenter,
          y: 0,
          width: glyphWidth,
          createdAt,
          speed,
          color: currentTitleColor.current,
          vx: 0,
          vy: 0,
        });

        letterIdx.current += 1;

        // If we just spawned the last remaining letter of this title, finalize now
        if (currentTitleRemainingIdxs.current.length === 0) {
          removeTitle(titleIdx.current);
          titleIdx.current = 0;
          letterIdx.current = 0;
          currentTitleStartLeft.current = 0;
          currentTitleTotalWidth.current = 0;
          currentTitleGlyphWidths.current = [];
          currentTitleOffsets.current = [];
          currentTitleRemainingIdxs.current = [];
          currentTitleGraphemes.current = [];
        }
      }
      rafId = requestAnimationFrame(spawnFrame);
    }

    rafId = requestAnimationFrame(spawnFrame);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    spawnLetters,
    titlesQueue,
    width,
    fontSize,
    letterFallSpeedMin,
    letterFallSpeedMax,
    lettersPerSecond,
    lettersRef,
  ]);

  return null; // nothing to render
}
