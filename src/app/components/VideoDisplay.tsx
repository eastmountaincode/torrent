"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoFeed } from "./VideoFeed";
import { SegmentationOverlay } from "./SegmentationOverlay";
import LettersOverlay from "./LettersOverlay/LettersOverlay";
import {
    BodyPixMultiplier,
    BodyPixOutputStride,
    BodyPixSettings,
    CameraStatus,
    LetterFrameMetrics,
    SegmentationFrameMetrics,
    SegmentationStatus,
    TitlesStatus
} from "../types";
import {
    DEFAULT_TORRENT_SETTINGS,
    normalizeTorrentSettings,
    TORRENT_SETTING_DEFINITIONS,
    type TorrentSettings,
} from "../lib/torrentSettings";

const STARTUP_STEP_MIN_MS = 750;
const STARTUP_SEQUENCE = [
    "starting-camera",
    "preparing-body-model",
    "loading-body-model",
    "connecting-text-stream",
    "priming-falling-text",
    "ready",
] as const;

const DEFAULT_BODYPIX_SETTINGS: BodyPixSettings = {
    multiplier: 0.75,
    outputStride: 16,
};

const BODYPIX_MULTIPLIERS: BodyPixMultiplier[] = [0.5, 0.75, 1];
const BODYPIX_OUTPUT_STRIDES: BodyPixOutputStride[] = [8, 16, 32];
const MAX_ACTIVE_LETTERS_DEFINITION = TORRENT_SETTING_DEFINITIONS.find((definition) => definition.key === "maxActiveLetters")!;
const FALL_SPEED_MULTIPLIER_DEFINITION = TORRENT_SETTING_DEFINITIONS.find((definition) => definition.key === "fallSpeedMultiplier")!;
const SETTINGS_POLL_INTERVAL_MS = 3000;
const SEGMENTATION_STALL_MS = 8000;
const LETTER_RENDERER_STALL_MS = 5000;
const WATCHDOG_INTERVAL_MS = 2000;

type StartupStep = typeof STARTUP_SEQUENCE[number] |
    "camera-error" |
    "segmentation-error" |
    "titles-error" |
    "titles-empty";

const STEP_INDEX = new Map<StartupStep, number>(
    STARTUP_SEQUENCE.map((step, index) => [step, index])
);

interface HelperMetrics {
    letterFps: number;
    letterDrawMs: number;
    activeLetters: number;
    segmentationFps: number;
    segmentMs: number;
    maskMs: number;
    segmentationTotalMs: number;
    hasPeople: boolean;
}

interface RollingLetterStats {
    windowStartedAt: number;
    frames: number;
    drawMsTotal: number;
    activeLetters: number;
}

interface RollingSegmentationStats {
    windowStartedAt: number;
    frames: number;
    segmentMsTotal: number;
    maskMsTotal: number;
    totalMsTotal: number;
    hasPeople: boolean;
}

function targetStartupStep(
    cameraStatus: CameraStatus,
    segmentationStatus: SegmentationStatus,
    titlesStatus: TitlesStatus,
    firstLetterSpawned: boolean
): StartupStep {
    if (cameraStatus === "error") return "camera-error";
    if (segmentationStatus === "error") return "segmentation-error";
    if (titlesStatus === "error") return "titles-error";
    if (titlesStatus === "empty") return "titles-empty";
    if (cameraStatus !== "ready") return "starting-camera";
    if (segmentationStatus !== "ready") {
        return segmentationStatus === "loading-model" ? "loading-body-model" : "preparing-body-model";
    }
    if (titlesStatus !== "ready") return "connecting-text-stream";
    if (!firstLetterSpawned) return "priming-falling-text";
    return "ready";
}

function nextDisplayedStep(currentStep: StartupStep, targetStep: StartupStep): StartupStep {
    const currentIndex = STEP_INDEX.get(currentStep);
    const targetIndex = STEP_INDEX.get(targetStep);
    if (currentIndex === undefined || targetIndex === undefined) return targetStep;
    if (currentIndex >= targetIndex) return targetStep;
    return STARTUP_SEQUENCE[currentIndex + 1];
}

function startupMessage(step: StartupStep) {
    switch (step) {
        case "camera-error":
            return "Camera unavailable";
        case "segmentation-error":
            return "Body model unavailable";
        case "titles-error":
            return "Text stream unavailable";
        case "titles-empty":
            return "Waiting for text stream";
        case "starting-camera":
            return "Starting camera";
        case "preparing-body-model":
            return "Preparing body model";
        case "loading-body-model":
            return "Loading body model";
        case "connecting-text-stream":
            return "Connecting text stream";
        case "priming-falling-text":
            return "Priming falling text";
        case "ready":
            return "Ready";
    }
}

function startupProgress(step: StartupStep) {
    switch (step) {
        case "camera-error":
        case "segmentation-error":
        case "titles-error":
        case "titles-empty":
            return 100;
        case "starting-camera":
            return 20;
        case "preparing-body-model":
            return 45;
        case "loading-body-model":
            return 62;
        case "connecting-text-stream":
            return 78;
        case "priming-falling-text":
            return 92;
        case "ready":
            return 100;
    }
}

function StartupOverlay({
    message,
    progress,
    queueLength,
    hasError,
}: {
    message: string;
    progress: number;
    queueLength: number;
    hasError: boolean;
}) {
    return (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black text-white">
            <div className="w-[min(420px,80%)]">
                <div className="mb-5 flex items-center gap-4">
                    <div
                        className={`h-8 w-8 shrink-0 rounded-full border-2 border-white/25 border-t-white ${hasError ? "" : "animate-spin"}`}
                    />
                    <div>
                        <div className="font-[ChicagoKare] text-2xl leading-none tracking-normal">
                            {message}
                        </div>
                        <div className="mt-2 font-mono text-xs uppercase text-white/55">
                            {queueLength > 0 ? `${queueLength} titles queued` : "Startup sequence"}
                        </div>
                    </div>
                </div>
                <div className="h-2 w-full overflow-hidden bg-white/15">
                    <div
                        className="h-full bg-white transition-[width] duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

function formatNumber(value: number, digits = 1) {
    if (!Number.isFinite(value)) return "0.0";
    return value.toFixed(digits);
}

function HelperPanel({
    metrics,
    cameraStatus,
    segmentationStatus,
    titlesStatus,
    queueLength,
    width,
    height,
    bodyPixSettings,
    showSegmentationMask,
    letterSettings,
    onBodyPixSettingsChange,
    onResetBodyPixSettings,
    onShowSegmentationMaskChange,
    onMaxActiveLettersChange,
    onResetMaxActiveLetters,
    onFallSpeedMultiplierChange,
    onResetFallSpeedMultiplier,
}: {
    metrics: HelperMetrics;
    cameraStatus: CameraStatus;
    segmentationStatus: SegmentationStatus;
    titlesStatus: TitlesStatus;
    queueLength: number;
    width: number;
    height: number;
    bodyPixSettings: BodyPixSettings;
    showSegmentationMask: boolean;
    letterSettings: TorrentSettings;
    onBodyPixSettingsChange: (settings: BodyPixSettings) => void;
    onResetBodyPixSettings: () => void;
    onShowSegmentationMaskChange: (show: boolean) => void;
    onMaxActiveLettersChange: (value: number) => void;
    onResetMaxActiveLetters: () => void;
    onFallSpeedMultiplierChange: (value: number) => void;
    onResetFallSpeedMultiplier: () => void;
}) {
    const rows = [
        ["Letters FPS", formatNumber(metrics.letterFps)],
        ["Letter draw", `${formatNumber(metrics.letterDrawMs)} ms`],
        ["Active letters", String(metrics.activeLetters)],
        ["Letter cap", String(letterSettings.maxActiveLetters)],
        ["Fall speed", `${formatNumber(letterSettings.fallSpeedMultiplier, 2)}x`],
        ["Font size", `${formatNumber(letterSettings.letterFontSize, 0)} px`],
        ["Frequency", `${formatNumber(letterSettings.lettersPerSecond, 0)} /s`],
        ["Canvas ratio", formatNumber(letterSettings.canvasAspectRatio, 3)],
        ["Color range", `${letterSettings.letterColorGrayMin}-${letterSettings.letterColorGrayMax}`],
        ["BodyPix FPS", formatNumber(metrics.segmentationFps)],
        ["BodyPix inference", `${formatNumber(metrics.segmentMs)} ms`],
        ["Mask update", `${formatNumber(metrics.maskMs)} ms`],
        ["Mask total", `${formatNumber(metrics.segmentationTotalMs)} ms`],
        ["Mask visible", showSegmentationMask ? "on" : "off"],
        ["Multiplier", String(bodyPixSettings.multiplier)],
        ["Output stride", String(bodyPixSettings.outputStride)],
        ["Person detected", metrics.hasPeople ? "yes" : "no"],
        ["Titles queued", String(queueLength)],
        ["Stage", `${width} x ${height}`],
        ["Camera", cameraStatus],
        ["Body model", segmentationStatus],
        ["Titles", titlesStatus],
    ];

    return (
        <div className="absolute left-3 top-3 z-30 w-[min(360px,calc(100%-24px))] bg-black/80 p-3 font-mono text-[11px] leading-tight text-white shadow-lg backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/20 pb-2">
                <div className="text-xs uppercase">Torrent helper</div>
                <div className="text-white/55">H</div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1">
                {rows.map(([label, value]) => (
                    <div key={label} className="contents">
                        <div className="text-white/55">{label}</div>
                        <div className="text-right tabular-nums">{value}</div>
                    </div>
                ))}
            </div>
            <div className="mt-3 border-t border-white/20 pt-2">
                <label className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-white/55">Show mask</span>
                    <input
                        className="h-4 w-4 accent-white"
                        type="checkbox"
                        checked={showSegmentationMask}
                        onChange={(event) => onShowSegmentationMaskChange(event.target.checked)}
                    />
                </label>
                <label className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3">
                    <span className="text-white/55">Multiplier</span>
                    <select
                        className="w-20 bg-black/70 px-1 py-0.5 text-right text-white outline outline-1 outline-white/25"
                        value={bodyPixSettings.multiplier}
                        onChange={(event) => {
                            onBodyPixSettingsChange({
                                ...bodyPixSettings,
                                multiplier: Number(event.target.value) as BodyPixMultiplier,
                            });
                        }}
                    >
                        {BODYPIX_MULTIPLIERS.map((value) => (
                            <option key={value} value={value}>{value}</option>
                        ))}
                    </select>
                </label>
                <label className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3">
                    <span className="text-white/55">Output stride</span>
                    <select
                        className="w-20 bg-black/70 px-1 py-0.5 text-right text-white outline outline-1 outline-white/25"
                        value={bodyPixSettings.outputStride}
                        onChange={(event) => {
                            onBodyPixSettingsChange({
                                ...bodyPixSettings,
                                outputStride: Number(event.target.value) as BodyPixOutputStride,
                            });
                        }}
                    >
                        {BODYPIX_OUTPUT_STRIDES.map((value) => (
                            <option key={value} value={value}>{value}</option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    className="mt-1 w-full border border-white/25 px-2 py-1 text-white/75 hover:border-white/60 hover:text-white"
                    onClick={onResetBodyPixSettings}
                >
                    Reset BodyPix defaults
                </button>
            </div>
            <div className="mt-3 border-t border-white/20 pt-2">
                <label className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3">
                    <span className="text-white/55">Fall speed</span>
                    <input
                        className="w-24 bg-black/70 px-1 py-0.5 text-right text-white outline outline-1 outline-white/25"
                        type="number"
                        min={FALL_SPEED_MULTIPLIER_DEFINITION.min}
                        max={FALL_SPEED_MULTIPLIER_DEFINITION.max}
                        step={FALL_SPEED_MULTIPLIER_DEFINITION.step}
                        value={letterSettings.fallSpeedMultiplier}
                        onChange={(event) => onFallSpeedMultiplierChange(Number(event.target.value))}
                    />
                </label>
                <div className="grid grid-cols-3 gap-1">
                    <button
                        type="button"
                        className="border border-white/25 px-2 py-1 text-white/75 hover:border-white/60 hover:text-white"
                        onClick={() => onFallSpeedMultiplierChange(letterSettings.fallSpeedMultiplier - FALL_SPEED_MULTIPLIER_DEFINITION.step)}
                    >
                        -0.25
                    </button>
                    <button
                        type="button"
                        className="border border-white/25 px-2 py-1 text-white/75 hover:border-white/60 hover:text-white"
                        onClick={onResetFallSpeedMultiplier}
                    >
                        Reset
                    </button>
                    <button
                        type="button"
                        className="border border-white/25 px-2 py-1 text-white/75 hover:border-white/60 hover:text-white"
                        onClick={() => onFallSpeedMultiplierChange(letterSettings.fallSpeedMultiplier + FALL_SPEED_MULTIPLIER_DEFINITION.step)}
                    >
                        +0.25
                    </button>
                </div>
            </div>
            <div className="mt-3 border-t border-white/20 pt-2">
                <label className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3">
                    <span className="text-white/55">Letter cap</span>
                    <input
                        className="w-24 bg-black/70 px-1 py-0.5 text-right text-white outline outline-1 outline-white/25"
                        type="number"
                        min={MAX_ACTIVE_LETTERS_DEFINITION.min}
                        max={MAX_ACTIVE_LETTERS_DEFINITION.max}
                        step={MAX_ACTIVE_LETTERS_DEFINITION.step}
                        value={letterSettings.maxActiveLetters}
                        onChange={(event) => onMaxActiveLettersChange(Number(event.target.value))}
                    />
                </label>
                <div className="grid grid-cols-3 gap-1">
                    <button
                        type="button"
                        className="border border-white/25 px-2 py-1 text-white/75 hover:border-white/60 hover:text-white"
                        onClick={() => onMaxActiveLettersChange(letterSettings.maxActiveLetters - MAX_ACTIVE_LETTERS_DEFINITION.step)}
                    >
                        -250
                    </button>
                    <button
                        type="button"
                        className="border border-white/25 px-2 py-1 text-white/75 hover:border-white/60 hover:text-white"
                        onClick={onResetMaxActiveLetters}
                    >
                        Reset
                    </button>
                    <button
                        type="button"
                        className="border border-white/25 px-2 py-1 text-white/75 hover:border-white/60 hover:text-white"
                        onClick={() => onMaxActiveLettersChange(letterSettings.maxActiveLetters + MAX_ACTIVE_LETTERS_DEFINITION.step)}
                    >
                        +250
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function VideoDisplay() {
    // this is the actual video content we're getting from the camera
    const videoRef = useRef<HTMLVideoElement>(null);
    const MARGIN_PX = 24;

    const [torrentSettings, setTorrentSettings] = useState<TorrentSettings>(DEFAULT_TORRENT_SETTINGS);
    const [width, setWidth] = useState<number>(640);
    const [height, setHeight] = useState<number>(480);

    // Recalculate canvas size to max-fit inside the viewport using the configured stage aspect ratio.
    useEffect(() => {
        function fitToViewport() {
            const availW = Math.max(320, window.innerWidth - MARGIN_PX * 2);
            const availH = Math.max(240, window.innerHeight - MARGIN_PX * 2);
            const aspect = torrentSettings.canvasAspectRatio;
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
    }, [torrentSettings.canvasAspectRatio]);

    const [segmentationMask, setSegmentationMask] = useState<ImageData | null>(null);

    const spawnLetters = true;

    const [queueLength, setQueueLength] = useState(0);
    const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
    const [segmentationStatus, setSegmentationStatus] = useState<SegmentationStatus>("idle");
    const [titlesStatus, setTitlesStatus] = useState<TitlesStatus>("idle");
    const [firstLetterSpawned, setFirstLetterSpawned] = useState(false);
    const [displayedStep, setDisplayedStep] = useState<StartupStep>("starting-camera");
    const [hasShownLiveStage, setHasShownLiveStage] = useState(false);
    const [showHelperPanel, setShowHelperPanel] = useState(false);
    const [showSegmentationMask, setShowSegmentationMask] = useState(false);
    const [bodyPixSettings, setBodyPixSettings] = useState<BodyPixSettings>(DEFAULT_BODYPIX_SETTINGS);
    const [segmentationRestartKey, setSegmentationRestartKey] = useState(0);
    const [lettersRestartKey, setLettersRestartKey] = useState(0);
    const [helperMetrics, setHelperMetrics] = useState<HelperMetrics>({
        letterFps: 0,
        letterDrawMs: 0,
        activeLetters: 0,
        segmentationFps: 0,
        segmentMs: 0,
        maskMs: 0,
        segmentationTotalMs: 0,
        hasPeople: false,
    });
    const stepShownAtRef = useRef(Date.now());
    const letterStatsRef = useRef<RollingLetterStats>({
        windowStartedAt: 0,
        frames: 0,
        drawMsTotal: 0,
        activeLetters: 0,
    });
    const segmentationStatsRef = useRef<RollingSegmentationStats>({
        windowStartedAt: 0,
        frames: 0,
        segmentMsTotal: 0,
        maskMsTotal: 0,
        totalMsTotal: 0,
        hasPeople: false,
    });
    const lastSegmentationFrameAtRef = useRef(0);
    const lastLetterFrameAtRef = useRef(0);

    useEffect(() => {
        let cancelled = false;

        async function loadSettings() {
            try {
                const response = await fetch("/api/settings", { cache: "no-store" });
                if (!response.ok) return;
                const json = await response.json();
                if (cancelled) return;
                setTorrentSettings(normalizeTorrentSettings(json.settings));
            } catch {
                // Keep current in-memory settings if the settings service is temporarily unavailable.
            }
        }

        loadSettings();
        const intervalId = window.setInterval(loadSettings, SETTINGS_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    const handleCameraStatus = useCallback((status: CameraStatus) => {
        setCameraStatus(status);
    }, []);

    const handleSegmentationStatus = useCallback((status: SegmentationStatus) => {
        setSegmentationStatus(status);
    }, []);

    const handleTitlesStatus = useCallback((status: TitlesStatus) => {
        setTitlesStatus(status);
    }, []);

    const handleFirstLetterSpawned = useCallback(() => {
        setFirstLetterSpawned(true);
    }, []);

    const handleBodyPixSettingsChange = useCallback((settings: BodyPixSettings) => {
        setBodyPixSettings(settings);
    }, []);

    const handleResetBodyPixSettings = useCallback(() => {
        setBodyPixSettings(DEFAULT_BODYPIX_SETTINGS);
    }, []);

    const handleShowSegmentationMaskChange = useCallback((show: boolean) => {
        setShowSegmentationMask(show);
    }, []);

    const handleMaxActiveLettersChange = useCallback((value: number) => {
        setTorrentSettings((current) => normalizeTorrentSettings({
            ...current,
            maxActiveLetters: value,
        }));
    }, []);

    const handleResetMaxActiveLetters = useCallback(() => {
        setTorrentSettings((current) => ({
            ...current,
            maxActiveLetters: DEFAULT_TORRENT_SETTINGS.maxActiveLetters,
        }));
    }, []);

    const handleFallSpeedMultiplierChange = useCallback((value: number) => {
        setTorrentSettings((current) => normalizeTorrentSettings({
            ...current,
            fallSpeedMultiplier: value,
        }));
    }, []);

    const handleResetFallSpeedMultiplier = useCallback(() => {
        setTorrentSettings((current) => ({
            ...current,
            fallSpeedMultiplier: DEFAULT_TORRENT_SETTINGS.fallSpeedMultiplier,
        }));
    }, []);

    const handleLetterFrameMetrics = useCallback((metrics: LetterFrameMetrics) => {
        const now = performance.now();
        lastLetterFrameAtRef.current = now;
        const stats = letterStatsRef.current;
        if (stats.windowStartedAt === 0) {
            stats.windowStartedAt = now;
        }
        stats.frames += 1;
        stats.drawMsTotal += metrics.drawMs;
        stats.activeLetters = metrics.activeLetters;

        const elapsed = now - stats.windowStartedAt;
        if (elapsed >= 1000) {
            const frameCount = stats.frames;
            const letterFps = frameCount * 1000 / elapsed;
            const letterDrawMs = stats.drawMsTotal / Math.max(1, frameCount);
            const activeLetters = stats.activeLetters;
            setHelperMetrics((current) => ({
                ...current,
                letterFps,
                letterDrawMs,
                activeLetters,
            }));
            stats.windowStartedAt = now;
            stats.frames = 0;
            stats.drawMsTotal = 0;
        }
    }, []);

    const handleSegmentationFrameMetrics = useCallback((metrics: SegmentationFrameMetrics) => {
        const now = performance.now();
        lastSegmentationFrameAtRef.current = now;
        const stats = segmentationStatsRef.current;
        if (stats.windowStartedAt === 0) {
            stats.windowStartedAt = now;
        }
        stats.frames += 1;
        stats.segmentMsTotal += metrics.segmentMs;
        stats.maskMsTotal += metrics.maskMs;
        stats.totalMsTotal += metrics.totalMs;
        stats.hasPeople = metrics.hasPeople;

        const elapsed = now - stats.windowStartedAt;
        if (elapsed >= 1000) {
            const frameCount = stats.frames;
            const segmentationFps = frameCount * 1000 / elapsed;
            const segmentMs = stats.segmentMsTotal / Math.max(1, frameCount);
            const maskMs = stats.maskMsTotal / Math.max(1, frameCount);
            const segmentationTotalMs = stats.totalMsTotal / Math.max(1, frameCount);
            const hasPeople = stats.hasPeople;
            setHelperMetrics((current) => ({
                ...current,
                segmentationFps,
                segmentMs,
                maskMs,
                segmentationTotalMs,
                hasPeople,
            }));
            stats.windowStartedAt = now;
            stats.frames = 0;
            stats.segmentMsTotal = 0;
            stats.maskMsTotal = 0;
            stats.totalMsTotal = 0;
        }
    }, []);

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key.toLowerCase() !== "h" || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            const tagName = target?.tagName;
            if (target?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
                return;
            }
            event.preventDefault();
            setShowHelperPanel((visible) => !visible);
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        segmentationStatsRef.current = {
            windowStartedAt: 0,
            frames: 0,
            segmentMsTotal: 0,
            maskMsTotal: 0,
            totalMsTotal: 0,
            hasPeople: false,
        };
        setHelperMetrics((current) => ({
            ...current,
            segmentationFps: 0,
            segmentMs: 0,
            maskMs: 0,
            segmentationTotalMs: 0,
            hasPeople: false,
        }));
    }, [bodyPixSettings]);

    useEffect(() => {
        if (displayedStep === "ready") {
            setHasShownLiveStage(true);
        }
    }, [displayedStep]);

    useEffect(() => {
        if (cameraStatus !== "ready" || segmentationStatus !== "ready") return;
        lastSegmentationFrameAtRef.current = performance.now();

        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            const lastFrameAt = lastSegmentationFrameAtRef.current;
            if (lastFrameAt > 0 && performance.now() - lastFrameAt > SEGMENTATION_STALL_MS) {
                lastSegmentationFrameAtRef.current = performance.now();
                setSegmentationStatus("restarting");
                setSegmentationRestartKey((key) => key + 1);
            }
        }, WATCHDOG_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [cameraStatus, segmentationStatus, bodyPixSettings]);

    useEffect(() => {
        if (!hasShownLiveStage) return;
        lastLetterFrameAtRef.current = performance.now();

        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            const lastFrameAt = lastLetterFrameAtRef.current;
            if (lastFrameAt > 0 && performance.now() - lastFrameAt > LETTER_RENDERER_STALL_MS) {
                lastLetterFrameAtRef.current = performance.now();
                setLettersRestartKey((key) => key + 1);
            }
        }, WATCHDOG_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [hasShownLiveStage]);

    const textStreamAvailable = titlesStatus === "ready" || queueLength > 0;

    const lettersCanSpawn = spawnLetters &&
        cameraStatus === "ready" &&
        segmentationStatus === "ready" &&
        textStreamAvailable;

    const hasStartupError = cameraStatus === "error" ||
        segmentationStatus === "error" ||
        titlesStatus === "error";

    const targetStep = useMemo(
        () => targetStartupStep(cameraStatus, segmentationStatus, titlesStatus, firstLetterSpawned),
        [cameraStatus, segmentationStatus, titlesStatus, firstLetterSpawned]
    );

    useEffect(() => {
        if (displayedStep === targetStep) return;

        const elapsed = Date.now() - stepShownAtRef.current;
        const waitMs = Math.max(0, STARTUP_STEP_MIN_MS - elapsed);
        const timeoutId = window.setTimeout(() => {
            setDisplayedStep((currentStep) => {
                const nextStep = nextDisplayedStep(currentStep, targetStep);
                if (nextStep !== currentStep) {
                    stepShownAtRef.current = Date.now();
                }
                return nextStep;
            });
        }, waitMs);

        return () => window.clearTimeout(timeoutId);
    }, [displayedStep, targetStep]);

    const displayReady = displayedStep === "ready" || hasShownLiveStage;

    const loadingMessage = startupMessage(displayedStep);

    const loadingProgress = startupProgress(displayedStep);



    return (
        <div className="flex flex-col items-center">
            {/* <RedditTitlesFeed /> */}

            <div
                className="relative overflow-hidden bg-black"
                style={{ width, height, margin: MARGIN_PX }}
            >
                {/* <button
                    className="absolute -top-13 right-2 z-10 border-2 border-white text-white px-4 py-2 cursor-pointer"
                    onClick={() => setSpawnLetters((v) => !v)}
                >
                    {spawnLetters ? "Stop" : "Start"}
                </button> */}
                <div
                    className={`absolute inset-0 transition-opacity duration-500 ${displayReady ? "opacity-100" : "opacity-0"}`}
                    aria-hidden={!displayReady}
                >
                    <VideoFeed
                        ref={videoRef}
                        width={width}
                        height={height}
                        onStatusChange={handleCameraStatus}
                    />
                    {cameraStatus === "ready" && (
                        <SegmentationOverlay
                            key={segmentationRestartKey}
                            videoRef={videoRef}
                            width={width}
                            height={height}
                            settings={bodyPixSettings}
                            showMask={showSegmentationMask}
                            onUpdateMask={setSegmentationMask}
                            onStatusChange={handleSegmentationStatus}
                            onFrameMetrics={handleSegmentationFrameMetrics}
                        />
                    )}
                    <LettersOverlay
                        key={lettersRestartKey}
                        width={width}
                        height={height}
                        segmentationMask={segmentationMask}
                        spawnLetters={lettersCanSpawn}
                        letterSettings={torrentSettings}
                        onQueueLengthChange={setQueueLength}
                        onTitlesStatusChange={handleTitlesStatus}
                        onFirstLetterSpawned={handleFirstLetterSpawned}
                        onFrameMetrics={handleLetterFrameMetrics}
                    />
                </div>
                {!displayReady && (
                    <StartupOverlay
                        message={loadingMessage}
                        progress={loadingProgress}
                        queueLength={queueLength}
                        hasError={hasStartupError}
                    />
                )}
                {showHelperPanel && (
                    <HelperPanel
                        metrics={helperMetrics}
                        cameraStatus={cameraStatus}
                        segmentationStatus={segmentationStatus}
                        titlesStatus={titlesStatus}
                        queueLength={queueLength}
                        width={width}
                        height={height}
                        bodyPixSettings={bodyPixSettings}
                        showSegmentationMask={showSegmentationMask}
                        letterSettings={torrentSettings}
                        onBodyPixSettingsChange={handleBodyPixSettingsChange}
                        onResetBodyPixSettings={handleResetBodyPixSettings}
                        onShowSegmentationMaskChange={handleShowSegmentationMaskChange}
                        onMaxActiveLettersChange={handleMaxActiveLettersChange}
                        onResetMaxActiveLetters={handleResetMaxActiveLetters}
                        onFallSpeedMultiplierChange={handleFallSpeedMultiplierChange}
                        onResetFallSpeedMultiplier={handleResetFallSpeedMultiplier}
                    />
                )}
                {/* <div className="mt-2 text-white">Titles in queue: {queueLength}</div> */}

            </div>
        </div>

    );
}
