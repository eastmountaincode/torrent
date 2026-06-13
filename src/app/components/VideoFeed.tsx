import { useEffect, forwardRef } from "react";
import { CameraMetrics, CameraStatus } from "../types";

const CAPTURE_WIDTH = 640;
const MIN_CAPTURE_HEIGHT = 270;
const MAX_CAPTURE_HEIGHT = 720;
const MAX_CAPTURE_FPS = 30;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

export const VideoFeed = forwardRef<HTMLVideoElement, {
    width: number;
    height: number;
    captureAspectRatio: number;
    onStatusChange?: (status: CameraStatus) => void;
    onMetricsChange?: (metrics: CameraMetrics) => void;
}>(({ width, height, captureAspectRatio, onStatusChange, onMetricsChange }, ref) => {
    useEffect(() => {
        let stream: MediaStream | null = null;
        let retryTimer: number | null = null;
        let cancelled = false;
        const safeAspectRatio = Number.isFinite(captureAspectRatio) && captureAspectRatio > 0
            ? captureAspectRatio
            : 4 / 3;
        const captureHeight = Math.round(clamp(
            CAPTURE_WIDTH / safeAspectRatio,
            MIN_CAPTURE_HEIGHT,
            MAX_CAPTURE_HEIGHT
        ));

        const reportMetrics = () => {
            if (!stream || !ref || typeof ref === "function" || !ref.current) return;

            const track = stream.getVideoTracks()[0];
            const settings = track?.getSettings?.();
            onMetricsChange?.({
                videoWidth: ref.current.videoWidth || 0,
                videoHeight: ref.current.videoHeight || 0,
                trackWidth: typeof settings?.width === "number" ? settings.width : undefined,
                trackHeight: typeof settings?.height === "number" ? settings.height : undefined,
                frameRate: typeof settings?.frameRate === "number" ? settings.frameRate : undefined,
                aspectRatio: typeof settings?.aspectRatio === "number" ? settings.aspectRatio : undefined,
                label: track?.label,
            });
        };

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
                    video: {
                        width: { ideal: CAPTURE_WIDTH },
                        height: { ideal: captureHeight },
                        aspectRatio: { ideal: safeAspectRatio },
                        frameRate: { ideal: MAX_CAPTURE_FPS, max: MAX_CAPTURE_FPS },
                    },
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
                        reportMetrics();
                    } else {
                        const handleLoadedMetadata = () => {
                            onStatusChange?.("ready");
                            reportMetrics();
                        };
                        ref.current.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
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
    }, [ref, captureAspectRatio, onStatusChange, onMetricsChange]);

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
