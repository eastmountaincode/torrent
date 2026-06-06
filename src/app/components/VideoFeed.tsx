import { useEffect, forwardRef } from "react";
import { CameraStatus } from "../types";

export const VideoFeed = forwardRef<HTMLVideoElement, {
    width: number;
    height: number;
    onStatusChange?: (status: CameraStatus) => void;
}>(({ width, height, onStatusChange }, ref) => {
    useEffect(() => {
        let stream: MediaStream | null = null;
        let retryTimer: number | null = null;
        let cancelled = false;

        const clearRetryTimer = () => {
            if (retryTimer !== null) {
                window.clearTimeout(retryTimer);
                retryTimer = null;
            }
        };

        const stopStream = () => {
            stream?.getTracks().forEach((track) => {
                track.onended = null;
                track.stop();
            });
            stream = null;
        };

        const scheduleReconnect = (delayMs: number) => {
            if (cancelled) return;
            clearRetryTimer();
            retryTimer = window.setTimeout(getVideo, delayMs);
        };

        async function getVideo() {
            try {
                clearRetryTimer();
                onStatusChange?.("requesting");
                stopStream();
                const nextStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false,
                });
                if (cancelled) {
                    nextStream.getTracks().forEach((track) => track.stop());
                    return;
                }
                stream = nextStream;
                stream.getVideoTracks().forEach((track) => {
                    track.onended = () => {
                        onStatusChange?.("requesting");
                        scheduleReconnect(1000);
                    };
                });
                if (ref && typeof ref !== "function" && ref.current) {
                    ref.current.srcObject = stream;
                    if (ref.current.readyState >= 1) {
                        onStatusChange?.("ready");
                    } else {
                        ref.current.addEventListener(
                            "loadedmetadata",
                            () => onStatusChange?.("ready"),
                            { once: true }
                        );
                    }
                } else {
                    scheduleReconnect(1000);
                }
            } catch (error) {
                console.error("Error accessing camera:", error);
                onStatusChange?.("error");
                scheduleReconnect(5000);
            }
        }
        getVideo();

        return () => {
            cancelled = true;
            clearRetryTimer();
            stopStream();
        };
    }, [ref, onStatusChange]);

    return (
        <video
            ref={ref}
            className="w-full h-full object-cover -scale-x-100"
            autoPlay
            muted
            playsInline
            loop
            width={width}
            height={height}
        />
    );
});

VideoFeed.displayName = "VideoFeed";
