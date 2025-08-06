"use client";
import { useRef, useState } from "react";
import { VideoFeed } from "./VideoFeed";
import { SegmentationOverlay } from "./SegmentationOverlay";
import LettersOverlay from "./LettersOverlay/LettersOverlay";
import { RedditTitlesFeed } from "./RedditTitlesFeed";

export default function VideoDisplay() {
    // this is the actual video content we're getting from the camera
    const videoRef = useRef<HTMLVideoElement>(null);
    const width = 1024;
    const height = 768;

    const [segmentationMask, setSegmentationMask] = useState<ImageData | null>(null);

    const [spawnLetters, setSpawnLetters] = useState(false);


    return (
        <div className="flex flex-col items-center">
            <h2 className="text-2xl text-center">Video Display</h2>
            <RedditTitlesFeed />

            <div
                className="relative"
                style={{ width, height }}
            >
                <button
                    className="absolute -top-13 right-2 z-10 border-2 border-white text-white px-4 py-2 cursor-pointer"
                    onClick={() => setSpawnLetters((v) => !v)}
                >
                    {spawnLetters ? "Stop" : "Start"}
                </button>
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
                />
            </div>
        </div>

    );
}
