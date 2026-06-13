"use client";

import { useEffect, useMemo, useState } from "react";
import {
    DEFAULT_TORRENT_SETTINGS,
    normalizeTorrentSettings,
    paletteForSettings,
    TORRENT_SETTING_DEFINITIONS,
    type ColorMode,
    type ColorPresetName,
    type NumericTorrentSettingKey,
    type TorrentSettings,
} from "@/app/lib/torrentSettings";

type SaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

const ASPECT_PRESETS = [
    { label: "4:3", value: 4 / 3 },
    { label: "16:10", value: 16 / 10 },
    { label: "16:9", value: 16 / 9 },
    { label: "21:9", value: 21 / 9 },
];

const COLOR_PRESET_OPTIONS: Array<{ label: string; value: ColorPresetName }> = [
    { label: "Gray", value: "grayscale" },
    { label: "Knicks", value: "knicks" },
    { label: "B/W", value: "highContrast" },
    { label: "Warm", value: "warm" },
    { label: "Cool", value: "cool" },
    { label: "Custom", value: "custom" },
];

const COLOR_KEYS = ["color1", "color2", "color3", "color4"] as const;

function AdminRow({
    definition,
    value,
    onChange,
}: {
    definition: (typeof TORRENT_SETTING_DEFINITIONS)[number];
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="grid grid-cols-[140px_1fr_92px_28px] items-center gap-3 border-t border-white/10 py-2">
            <div>
                <div className="text-[13px] text-neutral-100">{definition.label}</div>
                <div className="text-[10px] leading-tight text-neutral-500">{definition.description}</div>
            </div>
            <input
                className="h-2 w-full accent-white"
                type="range"
                min={definition.min}
                max={definition.max}
                step={definition.step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
            />
            <input
                className="h-8 w-full border border-white/20 bg-black px-2 text-right text-[13px] text-neutral-100 outline-none focus:border-white/60"
                type="number"
                min={definition.min}
                max={definition.max}
                step={definition.step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
            />
            <span className="text-[10px] text-neutral-500">{definition.unit || ""}</span>
        </label>
    );
}

export default function AdminPage() {
    const [settings, setSettings] = useState<TorrentSettings>(DEFAULT_TORRENT_SETTINGS);
    const [source, setSource] = useState("default");
    const [status, setStatus] = useState<SaveStatus>("loading");
    const [message, setMessage] = useState("");
    const [adminToken, setAdminToken] = useState("");
    const [showJson, setShowJson] = useState(false);

    useEffect(() => {
        setAdminToken(window.localStorage.getItem("torrent-admin-token") || "");
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadSettings() {
            setStatus("loading");
            try {
                const response = await fetch("/api/settings", { cache: "no-store" });
                const json = await response.json();
                if (cancelled) return;
                setSettings(normalizeTorrentSettings(json.settings));
                setSource(json.source || "default");
                setStatus("idle");
                setMessage("");
            } catch {
                if (cancelled) return;
                setStatus("error");
                setMessage("Unable to load settings.");
            }
        }

        loadSettings();
        return () => {
            cancelled = true;
        };
    }, []);

    const canSave = status !== "saving";
    const palette = paletteForSettings(settings);

    const groupedDefinitions = useMemo(() => ({
        canvas: TORRENT_SETTING_DEFINITIONS.filter((definition) => definition.group === "canvas"),
        motion: TORRENT_SETTING_DEFINITIONS.filter((definition) => definition.group === "motion"),
        density: TORRENT_SETTING_DEFINITIONS.filter((definition) => definition.group === "density"),
    }), []);

    const serializedSettings = useMemo(
        () => JSON.stringify(settings, null, 2),
        [settings]
    );

    function updateNumericSetting(key: NumericTorrentSettingKey, value: number) {
        setSettings((current) => normalizeTorrentSettings({
            ...current,
            [key]: value,
        }));
    }

    function updateSettings(nextSettings: Partial<TorrentSettings>) {
        setSettings((current) => normalizeTorrentSettings({
            ...current,
            ...nextSettings,
        }));
    }

    async function saveSettings() {
        if (!canSave) return;

        setStatus("saving");
        setMessage("");
        if (adminToken) {
            window.localStorage.setItem("torrent-admin-token", adminToken);
        }

        try {
            const response = await fetch("/api/settings", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...(adminToken ? { "x-admin-token": adminToken } : {}),
                },
                body: JSON.stringify({ settings }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(json.error || `Save failed with HTTP ${response.status}`);
            }
            setSettings(normalizeTorrentSettings(json.settings));
            setSource(json.source || "d1");
            setStatus("saved");
            setMessage(json.realtime ? "Saved. Live update sent." : "Saved. Realtime not configured.");
        } catch (error) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "Unable to save settings.");
        }
    }

    function resetDefaults() {
        setSettings(DEFAULT_TORRENT_SETTINGS);
        setMessage("Defaults loaded locally. Save to persist them.");
        setStatus("idle");
    }

    function applyColorPreset(value: ColorPresetName) {
        updateSettings({ colorPreset: value });
    }

    function setCustomColor(key: typeof COLOR_KEYS[number], value: string) {
        updateSettings({
            colorPreset: "custom",
            [key]: value,
        });
    }

    return (
        <main className="min-h-screen bg-[#111] px-4 py-4 font-mono text-neutral-100">
            <div className="mx-auto max-w-6xl">
                <header className="sticky top-0 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-[#111]/95 pb-3 backdrop-blur">
                    <div className="flex items-baseline gap-4">
                        <h1 className="text-xl uppercase tracking-normal">Torrent Admin</h1>
                        <span className="text-xs text-neutral-500">source: {source}</span>
                        {message && (
                            <span className={status === "error" ? "text-xs text-red-300" : "text-xs text-neutral-400"}>
                                {message}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            className="h-8 w-56 border border-white/20 bg-black px-2 text-xs text-neutral-100 outline-none focus:border-white/60"
                            type="password"
                            value={adminToken}
                            onChange={(event) => setAdminToken(event.target.value)}
                            placeholder="Admin token"
                        />
                        <button
                            type="button"
                            className="h-8 border border-white/25 px-3 text-xs text-neutral-200 hover:border-white/60"
                            onClick={resetDefaults}
                        >
                            Reset
                        </button>
                        <button
                            type="button"
                            className="h-8 border border-white bg-white px-4 text-xs text-black disabled:opacity-50"
                            disabled={!canSave}
                            onClick={saveSettings}
                        >
                            {status === "saving" ? "Saving" : "Save"}
                        </button>
                    </div>
                </header>

                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                    <section className="border border-white/10 bg-black/25 p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-xs uppercase text-neutral-400">Canvas</h2>
                            <div className="flex gap-1">
                                {ASPECT_PRESETS.map((preset) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        className="border border-white/20 px-2 py-1 text-[11px] text-neutral-200 hover:border-white/60"
                                        onClick={() => updateNumericSetting("canvasAspectRatio", preset.value)}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {groupedDefinitions.canvas.map((definition) => (
                            <AdminRow
                                key={definition.key}
                                definition={definition}
                                value={settings[definition.key]}
                                onChange={(value) => updateNumericSetting(definition.key, value)}
                            />
                        ))}
                    </section>

                    <section className="border border-white/10 bg-black/25 p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-xs uppercase text-neutral-400">Color</h2>
                            <select
                                className="h-8 border border-white/20 bg-black px-2 text-xs text-neutral-100 outline-none focus:border-white/60"
                                value={settings.colorPreset}
                                onChange={(event) => applyColorPreset(event.target.value as ColorPresetName)}
                            >
                                {COLOR_PRESET_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mb-3 flex gap-2">
                            {palette.map((color, index) => (
                                <div
                                    key={`${color}-${index}`}
                                    className="h-7 flex-1 border border-white/15"
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                        <div className="mb-3 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                className={`border px-2 py-1 text-xs ${settings.colorMode === "title" ? "border-white bg-white text-black" : "border-white/25 text-neutral-200"}`}
                                onClick={() => updateSettings({ colorMode: "title" as ColorMode })}
                            >
                                Color by title
                            </button>
                            <button
                                type="button"
                                className={`border px-2 py-1 text-xs ${settings.colorMode === "letter" ? "border-white bg-white text-black" : "border-white/25 text-neutral-200"}`}
                                onClick={() => updateSettings({ colorMode: "letter" as ColorMode })}
                            >
                                Color by letter
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {COLOR_KEYS.map((key, index) => (
                                <label key={key} className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-neutral-400">
                                    <input
                                        className="h-8 w-12 border border-white/20 bg-black"
                                        type="color"
                                        value={settings[key]}
                                        onChange={(event) => setCustomColor(key, event.target.value)}
                                    />
                                    <input
                                        className="h-8 border border-white/20 bg-black px-2 text-neutral-100 outline-none focus:border-white/60"
                                        type="text"
                                        value={settings[key]}
                                        aria-label={`Color ${index + 1}`}
                                        onChange={(event) => setCustomColor(key, event.target.value)}
                                    />
                                </label>
                            ))}
                        </div>
                    </section>

                    <section className="border border-white/10 bg-black/25 p-3">
                        <h2 className="mb-2 text-xs uppercase text-neutral-400">Motion</h2>
                        {groupedDefinitions.motion.map((definition) => (
                            <AdminRow
                                key={definition.key}
                                definition={definition}
                                value={settings[definition.key]}
                                onChange={(value) => updateNumericSetting(definition.key, value)}
                            />
                        ))}
                    </section>

                    <section className="border border-white/10 bg-black/25 p-3">
                        <h2 className="mb-2 text-xs uppercase text-neutral-400">Density / Safety</h2>
                        {groupedDefinitions.density.map((definition) => (
                            <AdminRow
                                key={definition.key}
                                definition={definition}
                                value={settings[definition.key]}
                                onChange={(value) => updateNumericSetting(definition.key, value)}
                            />
                        ))}
                        <button
                            type="button"
                            className="mt-3 text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-200"
                            onClick={() => setShowJson((visible) => !visible)}
                        >
                            {showJson ? "Hide JSON" : "Show JSON"}
                        </button>
                    </section>
                </div>

                {showJson && (
                    <section className="mt-3 border border-white/10 bg-black/30 p-3">
                        <pre className="max-h-80 overflow-auto text-xs leading-relaxed text-neutral-400">{serializedSettings}</pre>
                    </section>
                )}
            </div>
        </main>
    );
}
