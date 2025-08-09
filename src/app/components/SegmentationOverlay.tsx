"use client"

import { useEffect, useRef } from "react";

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
async function initSegmenter(): Promise<Segmenter> {
    const { SupportedModels, createSegmenter } = window.bodySegmentation;
    const model = SupportedModels.BodyPix;
    // For performance, consider MobileNetV1 with lower multiplier.
    // ResNet50 is higher quality but heavier.
    const segmenterConfig = {
        architecture: "MobileNetV1",
        outputStride: 16,
        multiplier: 0.75,
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

    const red = { r: 255, g: 0, b: 255, a: 1 };
    const transparent = { r: 0, g: 0, b: 0, a: 0 };

    const binaryMask = (await window.bodySegmentation.toBinaryMask(
        people,
        red,
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
    onUpdateMask: (mask: ImageData | null) => void
) {
    if (!segmenter || !videoEl || !canvasEl || stopFlag.current) return;

    // Guard against zero-size video frames which can cause 0x0 texture errors
    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
        const ctx = canvasEl.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        onUpdateMask(null);
        requestAnimationFrame(() => runSegmentationLoop(segmenter, videoEl, canvasEl, offscreen, offCtx, stopFlag, onUpdateMask));
        return;
    }

    try {
        const segmentationConfig = { multiSegmentation: false, segmentBodyParts: false } as const;
        const people = await segmenter.segmentPeople(videoEl, segmentationConfig);
        if (people.length > 0) {
            await drawMask(people, canvasEl, offscreen, offCtx, onUpdateMask);
        } else {
            // Optionally, clear canvas if no person
            const ctx = canvasEl.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            }
            onUpdateMask(null);
        }
    } catch {
        // On any segmentation error, clear and continue
        const ctx = canvasEl.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        onUpdateMask(null);
    }

    requestAnimationFrame(() => runSegmentationLoop(segmenter, videoEl, canvasEl, offscreen, offCtx, stopFlag, onUpdateMask));
}
////////////////////////////////////////////////////////////////

export function SegmentationOverlay({
    videoRef,
    width,
    height,
    onUpdateMask
}: {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    width: number;
    height: number;
    onUpdateMask: (mask: ImageData | null) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);
    const offCtxRef = useRef<CanvasRenderingContext2D | null>(null);

    useEffect(() => {
        let segmenter: Segmenter | null = null;
        const stopFlag = { current: false };

        async function setup() {
            // Wait until we have
            // - window.bodySegmentation, the package we load from CDN in layout.tsx/RootLayout
            // - videoRef.current, the video element we pass in from VideoFeed.tsx
            // - canvasRef.current, which is the canvas defined in THIS component
            while (
                !window.bodySegmentation ||
                !videoRef.current ||
                !canvasRef.current
            ) {
                await new Promise((res) => setTimeout(res, 100));
            }
            // Ensure we have an offscreen canvas/context to reuse
            if (!offscreenRef.current) {
                offscreenRef.current = document.createElement('canvas');
                offCtxRef.current = offscreenRef.current.getContext('2d');
            }
            // Wait until the video has valid dimensions to avoid 0x0 textures
            while (videoRef.current && (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0)) {
                await new Promise((res) => setTimeout(res, 50));
            }
            // Once we have all these things, initialize the segmenter
            segmenter = await initSegmenter();
            if (offscreenRef.current && offCtxRef.current) {
                runSegmentationLoop(
                    segmenter as Segmenter,
                    videoRef.current,
                    canvasRef.current,
                    offscreenRef.current,
                    offCtxRef.current,
                    stopFlag,
                    onUpdateMask
                );
            }
        }

        // I used a console.log to verify that we're not calling setup() repeatedly
        setup();

        return () => {
            stopFlag.current = true;
            segmenter?.dispose?.();
        };
    }, [videoRef, onUpdateMask]);


    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute inset-0 pointer-events-none"
        />
    );
}
