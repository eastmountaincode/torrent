"use client";
import { useEffect, useRef, useState } from "react";
import { VideoFeed } from "./VideoFeed";
import { SegmentationOverlay } from "./SegmentationOverlay";
import LettersOverlay from "./LettersOverlay/LettersOverlay";
import { RedditTitlesFeed } from "./RedditTitlesFeed";

export default function VideoDisplay() {
    // this is the actual video content we're getting from the camera
    const videoRef = useRef<HTMLVideoElement>(null);
    const MARGIN_PX = 24;

    const [width, setWidth] = useState<number>(640);
    const [height, setHeight] = useState<number>(480);
    const videoAspectRef = useRef<number>(640 / 480);

    // Recalculate canvas size to max-fit inside the viewport while preserving webcam aspect ratio
    useEffect(() => {
        function fitToViewport() {
            const availW = Math.max(320, window.innerWidth - MARGIN_PX * 2);
            const availH = Math.max(240, window.innerHeight - MARGIN_PX * 2);
            const aspect = videoAspectRef.current;
            if (availW / availH > aspect) {
                // height-constrained
                const h = availH;
                const w = Math.floor(h * aspect);
                setWidth(w);
                setHeight(h);
            } else {
                // width-constrained
                const w = availW;
                const h = Math.floor(w / aspect);
                setWidth(w);
                setHeight(h);
            }
        }

        // Initial and on resize
        fitToViewport();
        window.addEventListener("resize", fitToViewport);
        return () => window.removeEventListener("resize", fitToViewport);
    }, []);

    // Once the video metadata is available, capture the true webcam aspect ratio and refit
    useEffect(() => {
        function updateAspectAndFit() {
            const v = videoRef.current;
            if (!v) return;
            const vw = v.videoWidth;
            const vh = v.videoHeight;
            if (vw > 0 && vh > 0) {
                videoAspectRef.current = vw / vh;
                // trigger a resize-based recalculation using current viewport
                const evt = new Event("resize");
                window.dispatchEvent(evt);
            }
        }

        const v = videoRef.current;
        if (v && v.readyState >= 1) updateAspectAndFit();
        v?.addEventListener("loadedmetadata", updateAspectAndFit);
        return () => v?.removeEventListener("loadedmetadata", updateAspectAndFit);
    }, []);

    const [segmentationMask, setSegmentationMask] = useState<ImageData | null>(null);

    const [spawnLetters, setSpawnLetters] = useState(true);

    const [queueLength, setQueueLength] = useState(0);



    return (
        <div className="flex flex-col items-center">
            {/* <RedditTitlesFeed /> */}

            <div
                className="relative"
                style={{ width, height, margin: MARGIN_PX }}
            >
                {/* <button
                    className="absolute -top-13 right-2 z-10 border-2 border-white text-white px-4 py-2 cursor-pointer"
                    onClick={() => setSpawnLetters((v) => !v)}
                >
                    {spawnLetters ? "Stop" : "Start"}
                </button> */}
                <VideoFeed ref={videoRef} width={width} height={height} />
                <SegmentationOverlay
                    videoRef={videoRef}
                    width={width}
                    height={height}
                    onUpdateMask={setSegmentationMask}
                />
                <LettersOverlay
                    width={width}
                    height={height}
                    segmentationMask={segmentationMask}
                    spawnLetters={spawnLetters}
                    onQueueLengthChange={setQueueLength}
                />
                {/* <div className="mt-2 text-white">Titles in queue: {queueLength}</div> */}

            </div>
        </div>

    );
}
