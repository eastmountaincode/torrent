export interface TorrentSettings {
    canvasAspectRatio: number;
    letterFontSize: number;
    lettersPerSecond: number;
    letterFallSpeedMin: number;
    letterFallSpeedMax: number;
    fallSpeedMultiplier: number;
    letterDurationMs: number;
    maxActiveLetters: number;
    letterColorGrayMin: number;
    letterColorGrayMax: number;
}

export type TorrentSettingKey = keyof TorrentSettings;

export interface TorrentSettingDefinition {
    key: TorrentSettingKey;
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    unit?: string;
}

export const TORRENT_SETTINGS_ID = "active";

export const DEFAULT_TORRENT_SETTINGS: TorrentSettings = {
    canvasAspectRatio: 4 / 3,
    letterFontSize: 50,
    lettersPerSecond: 800,
    letterFallSpeedMin: 4,
    letterFallSpeedMax: 6,
    fallSpeedMultiplier: 1,
    letterDurationMs: 5500,
    maxActiveLetters: 1750,
    letterColorGrayMin: 60,
    letterColorGrayMax: 210,
};

export const TORRENT_SETTING_DEFINITIONS: TorrentSettingDefinition[] = [
    {
        key: "canvasAspectRatio",
        label: "Canvas aspect ratio",
        description: "Stage width divided by stage height. Use 1.777 for 16:9.",
        min: 0.75,
        max: 3,
        step: 0.001,
    },
    {
        key: "letterFontSize",
        label: "Letter size",
        description: "Canvas font size in pixels.",
        min: 12,
        max: 140,
        step: 1,
        unit: "px",
    },
    {
        key: "lettersPerSecond",
        label: "Letter frequency",
        description: "Target number of new letters emitted per second.",
        min: 0,
        max: 2000,
        step: 25,
        unit: "/s",
    },
    {
        key: "letterFallSpeedMin",
        label: "Fall speed min",
        description: "Minimum base fall speed for newly spawned letters.",
        min: 0,
        max: 30,
        step: 0.25,
    },
    {
        key: "letterFallSpeedMax",
        label: "Fall speed max",
        description: "Maximum base fall speed for newly spawned letters.",
        min: 0,
        max: 30,
        step: 0.25,
    },
    {
        key: "fallSpeedMultiplier",
        label: "Fall speed multiplier",
        description: "Multiplies the base fall speed range for newly spawned letters.",
        min: 0.25,
        max: 3,
        step: 0.25,
        unit: "x",
    },
    {
        key: "letterDurationMs",
        label: "Letter lifetime",
        description: "How long each letter stays alive before being removed.",
        min: 500,
        max: 30000,
        step: 250,
        unit: "ms",
    },
    {
        key: "maxActiveLetters",
        label: "Letter cap",
        description: "Maximum number of active letters on screen.",
        min: 250,
        max: 8000,
        step: 250,
    },
    {
        key: "letterColorGrayMin",
        label: "Color gray min",
        description: "Darkest generated gray value. 0 is black, 255 is white.",
        min: 0,
        max: 255,
        step: 1,
    },
    {
        key: "letterColorGrayMax",
        label: "Color gray max",
        description: "Lightest generated gray value. 0 is black, 255 is white.",
        min: 0,
        max: 255,
        step: 1,
    },
];

const definitionByKey = new Map<TorrentSettingKey, TorrentSettingDefinition>(
    TORRENT_SETTING_DEFINITIONS.map((definition) => [definition.key, definition])
);

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function normalizeNumber(key: TorrentSettingKey, value: unknown): number {
    const definition = definitionByKey.get(key);
    const fallback = DEFAULT_TORRENT_SETTINGS[key];
    if (!definition) return fallback;

    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;

    const stepped = Math.round(numeric / definition.step) * definition.step;
    const clamped = clamp(stepped, definition.min, definition.max);
    return Number(clamped.toFixed(4));
}

export function normalizeTorrentSettings(input: unknown): TorrentSettings {
    const source = input && typeof input === "object"
        ? input as Partial<Record<TorrentSettingKey, unknown>>
        : {};

    const settings = { ...DEFAULT_TORRENT_SETTINGS };
    for (const definition of TORRENT_SETTING_DEFINITIONS) {
        settings[definition.key] = normalizeNumber(definition.key, source[definition.key]);
    }

    if (settings.letterFallSpeedMax < settings.letterFallSpeedMin) {
        settings.letterFallSpeedMax = settings.letterFallSpeedMin;
    }

    if (settings.letterColorGrayMax < settings.letterColorGrayMin) {
        settings.letterColorGrayMax = settings.letterColorGrayMin;
    }

    return settings;
}
