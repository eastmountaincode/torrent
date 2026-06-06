export interface Letter {
    char: string;
    x: number;
    y: number;
    width: number;
    createdAt: number;
    speed: number;
    color?: string;
    vx?: number; // horizontal velocity (px/frame)
    vy?: number; // vertical velocity (px/frame)
}

export type CameraStatus = "idle" | "requesting" | "ready" | "error";
export type SegmentationStatus = "idle" | "waiting" | "loading-model" | "ready" | "restarting" | "error";
export type TitlesStatus = "idle" | "loading" | "ready" | "empty" | "reconnecting" | "error";

export type BodyPixMultiplier = 0.5 | 0.75 | 1;
export type BodyPixOutputStride = 8 | 16 | 32;

export interface BodyPixSettings {
    multiplier: BodyPixMultiplier;
    outputStride: BodyPixOutputStride;
}

export interface SegmentationFrameMetrics {
    segmentMs: number;
    maskMs: number;
    totalMs: number;
    hasPeople: boolean;
}

export interface LetterFrameMetrics {
    activeLetters: number;
    drawMs: number;
}
