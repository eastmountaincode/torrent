"use client"

import { useEffect, useRef } from "react";

// FUNCTIONS /////////////////////////////////////////////////
// Initialize the segmenter
async function initSegmenter() {
    const { SupportedModels, createSegmenter } = window.bodySegmentation;
    const model = SupportedModels.BodyPix;
    const segmenterConfig = {
        architecture: "ResNet50",
        outputStride: 16,
        multiplier: 1,
        quantBytes: 4,
    };
    return await createSegmenter(model, segmenterConfig);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drawMask(people: any, canvasEl: HTMLCanvasElement, onUpdateMask: (mask: ImageData | null) => void) {
    if (!people || !canvasEl) return;

    const red = { r: 255, g: 0, b: 255, a: 1 };
    const transparent = { r: 0, g: 0, b: 0, a: 0 };

    const binaryMask = await window.bodySegmentation.toBinaryMask(
        people,
        red,
        transparent
    );

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = canvasEl.width;
    tmpCanvas.height = canvasEl.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    if (tmpCtx) {
        tmpCtx.putImageData(binaryMask, 0, 0);
    }

    const ctx = canvasEl.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.save();
        ctx.translate(canvasEl.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(tmpCanvas, 0, 0);
        ctx.restore();
        onUpdateMask(ctx.getImageData(0, 0, canvasEl.width, canvasEl.height));

    }
}


async function runSegmentationLoop(
    segmenter: any,
    videoEl: HTMLVideoElement,
    canvasEl: HTMLCanvasElement,
    stopFlag: { current: boolean },
    onUpdateMask: (mask: ImageData | null) => void
) {
    if (!segmenter || !videoEl || !canvasEl || stopFlag.current) return;

    const segmentationConfig = { multiSegmentation: false, segmentBodyParts: false };
    const people = await segmenter.segmentPeople(videoEl, segmentationConfig);
    if (people.length > 0) {
        await drawMask(people, canvasEl, onUpdateMask);
    } else {
        // Optionally, clear canvas if no person
        const ctx = canvasEl.getContext('2d');
        ctx && ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }
    requestAnimationFrame(() => runSegmentationLoop(segmenter, videoEl, canvasEl, stopFlag, onUpdateMask));
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

    useEffect(() => {
        let segmenter: any = null;
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
            // Once we have all these things, initialize the segmenter
            segmenter = await initSegmenter();
            runSegmentationLoop(segmenter, videoRef.current, canvasRef.current, stopFlag, onUpdateMask);
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
            className="absolute inset-0 pointer-events-none border border-1 border-white"
        />
    );
}
