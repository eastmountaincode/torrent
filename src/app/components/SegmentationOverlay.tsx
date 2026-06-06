"use client"

import { useEffect, useRef } from "react";
import { BodyPixSettings, SegmentationFrameMetrics, SegmentationStatus } from "../types";

const SEGMENTATION_SETUP_TIMEOUT_MS = 45000;
const SEGMENTATION_RETRY_BASE_MS = 1000;
const SEGMENTATION_RETRY_MAX_MS = 10000;

// Minimal runtime types for the CDN-loaded body segmentation API
type Segmenter = {
    segmentPeople: (
        video: HTMLVideoElement,
        options: { multiSegmentation: boolean; segmentBodyParts: boolean }
    ) => Promise<unknown[]>;
    dispose?: () => void;
};

// FUNCTIONS /////////////////////////////////////////////////
// Initialize the segmenter
async function initSegmenter(settings: BodyPixSettings): Promise<Segmenter> {
    const { SupportedModels, createSegmenter } = window.bodySegmentation;
    const model = SupportedModels.BodyPix;
    // For performance, consider MobileNetV1 with lower multiplier.
    // ResNet50 is higher quality but heavier.
    const segmenterConfig = {
        architecture: "MobileNetV1",
        outputStride: settings.outputStride,
        multiplier: settings.multiplier,
        quantBytes: 4,
    } as const;
    return (await createSegmenter(model, segmenterConfig)) as unknown as Segmenter;
}

async function drawMask(
    people: unknown,
    canvasEl: HTMLCanvasElement,
    offscreen: HTMLCanvasElement,
    offCtx: CanvasRenderingContext2D,
    onUpdateMask: (mask: ImageData | null) => void
) {
    if (!people || !canvasEl) return;

    const maskColor = { r: 0, g: 220, b: 255, a: 255 };
    const transparent = { r: 0, g: 0, b: 0, a: 0 };

    const binaryMask = (await window.bodySegmentation.toBinaryMask(
        people,
        maskColor,
        transparent
    )) as ImageData;

    // Draw into a reusable offscreen canvas sized to the mask, then mirror-scale onto the visible canvas
    const maskW = binaryMask.width;
    const maskH = binaryMask.height;
    if (maskW === 0 || maskH === 0) {
        onUpdateMask(null);
        return;
    }
    if (offscreen.width !== maskW || offscreen.height !== maskH) {
        offscreen.width = maskW;
        offscreen.height = maskH;
    }
    offCtx.putImageData(binaryMask, 0, 0);

    const ctx = canvasEl.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.save();
        ctx.translate(canvasEl.width, 0);
        ctx.scale(-1, 1);
        // scale mask to canvas size if needed
        ctx.drawImage(offscreen, 0, 0, maskW, maskH, 0, 0, canvasEl.width, canvasEl.height);
        ctx.restore();
        onUpdateMask(ctx.getImageData(0, 0, canvasEl.width, canvasEl.height));

    }
}


async function runSegmentationLoop(
    segmenter: Segmenter,
    videoEl: HTMLVideoElement,
    canvasEl: HTMLCanvasElement,
    offscreen: HTMLCanvasElement,
    offCtx: CanvasRenderingContext2D,
    stopFlag: { current: boolean },
    onUpdateMask: (mask: ImageData | null) => void,
    onFrameMetrics?: (metrics: SegmentationFrameMetrics) => void
) {
    if (!segmenter || !videoEl || !canvasEl || stopFlag.current) return;

    // Guard against zero-size video frames which can cause 0x0 texture errors
    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
        const ctx = canvasEl.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        onUpdateMask(null);
        requestAnimationFrame(() => runSegmentationLoop(segmenter, videoEl, canvasEl, offscreen, offCtx, stopFlag, onUpdateMask, onFrameMetrics));
        return;
    }

    try {
        const loopStartedAt = performance.now();
        const segmentationConfig = { multiSegmentation: false, segmentBodyParts: false } as const;
        const people = await segmenter.segmentPeople(videoEl, segmentationConfig);
        if (stopFlag.current) return;
        const segmentedAt = performance.now();
        if (people.length > 0) {
            await drawMask(people, canvasEl, offscreen, offCtx, onUpdateMask);
            if (stopFlag.current) return;
        } else {
            // Optionally, clear canvas if no person
            const ctx = canvasEl.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            }
            onUpdateMask(null);
        }
        if (stopFlag.current) return;
        const loopEndedAt = performance.now();
        onFrameMetrics?.({
            segmentMs: segmentedAt - loopStartedAt,
            maskMs: loopEndedAt - segmentedAt,
            totalMs: loopEndedAt - loopStartedAt,
            hasPeople: people.length > 0,
        });
    } catch {
        if (stopFlag.current) return;
        // On any segmentation error, clear and continue
        const ctx = canvasEl.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        onUpdateMask(null);
    }

    if (stopFlag.current) return;
    requestAnimationFrame(() => runSegmentationLoop(segmenter, videoEl, canvasEl, offscreen, offCtx, stopFlag, onUpdateMask, onFrameMetrics));
}
////////////////////////////////////////////////////////////////

export function SegmentationOverlay({
    videoRef,
    width,
    height,
    settings,
    showMask,
    onUpdateMask,
    onStatusChange,
    onFrameMetrics
}: {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    width: number;
    height: number;
    settings: BodyPixSettings;
    showMask: boolean;
    onUpdateMask: (mask: ImageData | null) => void;
    onStatusChange?: (status: SegmentationStatus) => void;
    onFrameMetrics?: (metrics: SegmentationFrameMetrics) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);
    const offCtxRef = useRef<CanvasRenderingContext2D | null>(null);

    useEffect(() => {
        let segmenter: Segmenter | null = null;
        const stopFlag = { current: false };

        const retryDelay = (attempt: number) => {
            const delay = SEGMENTATION_RETRY_BASE_MS * 2 ** Math.min(attempt, 4);
            return Math.min(SEGMENTATION_RETRY_MAX_MS, delay);
        };

        const sleep = (delayMs: number) => new Promise((resolve) => {
            window.setTimeout(resolve, delayMs);
        });

        async function setup() {
            let attempt = 0;

            while (!stopFlag.current) {
                try {
                    onStatusChange?.(attempt > 0 ? "restarting" : "waiting");
                    const waitStartedAt = Date.now();
                    // Wait until we have
                    // - window.bodySegmentation, the package we load from CDN in layout.tsx/RootLayout
                    // - videoRef.current, the video element we pass in from VideoFeed.tsx
                    // - canvasRef.current, which is the canvas defined in THIS component
                    while (
                        !window.bodySegmentation ||
                        !videoRef.current ||
                        !canvasRef.current
                    ) {
                        if (stopFlag.current) return;
                        if (Date.now() - waitStartedAt > SEGMENTATION_SETUP_TIMEOUT_MS) {
                            throw new Error("Timed out waiting for segmentation dependencies");
                        }
                        await sleep(100);
                    }
                    // Ensure we have an offscreen canvas/context to reuse
                    if (!offscreenRef.current) {
                        offscreenRef.current = document.createElement('canvas');
                        offCtxRef.current = offscreenRef.current.getContext('2d');
                    }
                    // Wait until the video has valid dimensions to avoid 0x0 textures
                    while (videoRef.current && (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0)) {
                        if (stopFlag.current) return;
                        if (Date.now() - waitStartedAt > SEGMENTATION_SETUP_TIMEOUT_MS) {
                            throw new Error("Timed out waiting for video dimensions");
                        }
                        await sleep(50);
                    }
                    // Once we have all these things, initialize the segmenter
                    onStatusChange?.("loading-model");
                    segmenter = await initSegmenter(settings);
                    if (stopFlag.current) return;
                    onStatusChange?.("ready");
                    if (offscreenRef.current && offCtxRef.current) {
                        runSegmentationLoop(
                            segmenter as Segmenter,
                            videoRef.current,
                            canvasRef.current,
                            offscreenRef.current,
                            offCtxRef.current,
                            stopFlag,
                            onUpdateMask,
                            onFrameMetrics
                        );
                    }
                    return;
                } catch (error) {
                    if (stopFlag.current) return;
                    console.error("Error initializing segmentation:", error);
                    onStatusChange?.("restarting");
                    onUpdateMask(null);
                    segmenter?.dispose?.();
                    segmenter = null;
                    await sleep(retryDelay(attempt));
                    attempt += 1;
                }
            }
        }

        // I used a console.log to verify that we're not calling setup() repeatedly
        setup();

        return () => {
            stopFlag.current = true;
            segmenter?.dispose?.();
        };
    }, [videoRef, onUpdateMask, onStatusChange, onFrameMetrics, settings]);


    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={`absolute inset-0 pointer-events-none transition-opacity duration-150 ${showMask ? "opacity-50 mix-blend-screen" : "opacity-0"}`}
        />
    );
}
