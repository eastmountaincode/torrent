import { useEffect, forwardRef } from "react";

export const VideoFeed = forwardRef<HTMLVideoElement, { width: number; height: number }>((props, ref) => {
    useEffect(() => {
        async function getVideo() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false,
                });
                if (ref && typeof ref !== "function" && ref.current) {
                    ref.current.srcObject = stream;
                }
            } catch (error) {
                console.error("Error accessing camera:", error);
            }
        }
        getVideo();
    }, [ref]);

    return (
        <video
            ref={ref}
            className="w-full h-full object-cover -scale-x-100 border border-3 border-green-500"
            autoPlay
            muted
            playsInline
            loop
            width={props.width}
            height={props.height}
        />
    );
});

VideoFeed.displayName = "VideoFeed";
