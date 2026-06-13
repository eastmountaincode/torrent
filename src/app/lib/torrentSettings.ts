const colorPresets = {
    grayscale: ["#3c3c3c", "#d2d2d2"],
    knicks: ["#006bb6", "#f58426", "#ffffff"],
    highContrast: ["#000000", "#ffffff"],
    warm: ["#f6d365", "#fda085", "#ffffff"],
    cool: ["#63d2ff", "#7b61ff", "#f4f8ff"],
} as const;

type BuiltInColorPresetName = keyof typeof colorPresets;

export const COLOR_PRESETS: Record<BuiltInColorPresetName, readonly string[]> = colorPresets;

export type ColorPresetName = BuiltInColorPresetName | "custom";
export type ColorMode = "title" | "letter";

export interface TorrentSettings {
    canvasAspectRatio: number;
    letterFontSize: number;
    lettersPerSecond: number;
    letterFallSpeedMin: number;
    letterFallSpeedMax: number;
    fallSpeedMultiplier: number;
    letterDurationMs: number;
    maxActiveLetters: number;
    colorPreset: ColorPresetName;
    colorMode: ColorMode;
    color1: string;
    color2: string;
    color3: string;
    color4: string;
}

export type NumericTorrentSettingKey = {
    [Key in keyof TorrentSettings]: TorrentSettings[Key] extends number ? Key : never
}[keyof TorrentSettings];

export interface TorrentSettingDefinition {
    key: NumericTorrentSettingKey;
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    unit?: string;
    group: "canvas" | "motion" | "density";
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
    colorPreset: "grayscale",
    colorMode: "title",
    color1: COLOR_PRESETS.grayscale[0],
    color2: COLOR_PRESETS.grayscale[1],
    color3: "#808080",
    color4: "#ffffff",
};

export const TORRENT_SETTING_DEFINITIONS: TorrentSettingDefinition[] = [
    {
        key: "canvasAspectRatio",
        label: "Aspect ratio",
        description: "Stage width divided by height.",
        min: 0.75,
        max: 3,
        step: 0.001,
        group: "canvas",
    },
    {
        key: "letterFontSize",
        label: "Size",
        description: "Canvas font size.",
        min: 12,
        max: 140,
        step: 1,
        unit: "px",
        group: "motion",
    },
    {
        key: "lettersPerSecond",
        label: "Frequency",
        description: "New letters per second.",
        min: 0,
        max: 2000,
        step: 25,
        unit: "/s",
        group: "motion",
    },
    {
        key: "letterFallSpeedMin",
        label: "Speed min",
        description: "Minimum base fall speed.",
        min: 0,
        max: 30,
        step: 0.25,
        group: "motion",
    },
    {
        key: "letterFallSpeedMax",
        label: "Speed max",
        description: "Maximum base fall speed.",
        min: 0,
        max: 30,
        step: 0.25,
        group: "motion",
    },
    {
        key: "fallSpeedMultiplier",
        label: "Speed multiplier",
        description: "Multiplies new-letter speed.",
        min: 0.25,
        max: 3,
        step: 0.25,
        unit: "x",
        group: "motion",
    },
    {
        key: "letterDurationMs",
        label: "Lifetime",
        description: "How long letters remain.",
        min: 500,
        max: 30000,
        step: 250,
        unit: "ms",
        group: "density",
    },
    {
        key: "maxActiveLetters",
        label: "Max active letters",
        description: "Performance safety cap.",
        min: 250,
        max: 8000,
        step: 250,
        group: "density",
    },
];

const definitionByKey = new Map<NumericTorrentSettingKey, TorrentSettingDefinition>(
    TORRENT_SETTING_DEFINITIONS.map((definition) => [definition.key, definition])
);

const hexPattern = /^#[0-9a-f]{6}$/i;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function normalizeNumber(key: NumericTorrentSettingKey, value: unknown): number {
    const definition = definitionByKey.get(key);
    const fallback = DEFAULT_TORRENT_SETTINGS[key];
    if (!definition) return fallback;

    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;

    const stepped = Math.round(numeric / definition.step) * definition.step;
    const clamped = clamp(stepped, definition.min, definition.max);
    return Number(clamped.toFixed(4));
}

function normalizeHex(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!hexPattern.test(trimmed)) return fallback;
    return trimmed.toLowerCase();
}

function normalizeColorPreset(value: unknown): ColorPresetName {
    if (typeof value === "string" && (value === "custom" || value in COLOR_PRESETS)) {
        return value as ColorPresetName;
    }
    return DEFAULT_TORRENT_SETTINGS.colorPreset;
}

function normalizeColorMode(value: unknown): ColorMode {
    return value === "letter" ? "letter" : "title";
}

function legacyGrayToHex(value: unknown, fallback: number) {
    const numeric = clamp(Number(value), 0, 255);
    const safe = Number.isFinite(numeric) ? Math.round(numeric) : fallback;
    const hex = safe.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
}

export function paletteForSettings(settings: TorrentSettings): string[] {
    const colors = [
        settings.color1,
        settings.color2,
        settings.color3,
        settings.color4,
    ].filter((color) => hexPattern.test(color));

    return colors.length > 0 ? colors : [...COLOR_PRESETS.grayscale];
}

export function normalizeTorrentSettings(input: unknown): TorrentSettings {
    const source = input && typeof input === "object"
        ? input as Partial<Record<keyof TorrentSettings | "letterColorGrayMin" | "letterColorGrayMax", unknown>>
        : {};

    const settings = { ...DEFAULT_TORRENT_SETTINGS };
    for (const definition of TORRENT_SETTING_DEFINITIONS) {
        settings[definition.key] = normalizeNumber(definition.key, source[definition.key]);
    }

    if (settings.letterFallSpeedMax < settings.letterFallSpeedMin) {
        settings.letterFallSpeedMax = settings.letterFallSpeedMin;
    }

    const legacyGrayMin = source.letterColorGrayMin;
    const legacyGrayMax = source.letterColorGrayMax;
    const hasLegacyGray = legacyGrayMin !== undefined || legacyGrayMax !== undefined;

    settings.colorPreset = normalizeColorPreset(source.colorPreset);
    settings.colorMode = normalizeColorMode(source.colorMode);

    if (hasLegacyGray && source.color1 === undefined && source.color2 === undefined) {
        settings.colorPreset = "grayscale";
        settings.color1 = legacyGrayToHex(legacyGrayMin, 60);
        settings.color2 = legacyGrayToHex(legacyGrayMax, 210);
    } else if (settings.colorPreset !== "custom") {
        const preset: readonly string[] = COLOR_PRESETS[settings.colorPreset];
        settings.color1 = preset[0] || DEFAULT_TORRENT_SETTINGS.color1;
        settings.color2 = preset[1] || DEFAULT_TORRENT_SETTINGS.color2;
        settings.color3 = preset[2] || DEFAULT_TORRENT_SETTINGS.color3;
        settings.color4 = preset[3] || DEFAULT_TORRENT_SETTINGS.color4;
    } else {
        settings.color1 = normalizeHex(source.color1, DEFAULT_TORRENT_SETTINGS.color1);
        settings.color2 = normalizeHex(source.color2, DEFAULT_TORRENT_SETTINGS.color2);
        settings.color3 = normalizeHex(source.color3, DEFAULT_TORRENT_SETTINGS.color3);
        settings.color4 = normalizeHex(source.color4, DEFAULT_TORRENT_SETTINGS.color4);
    }

    return settings;
}
