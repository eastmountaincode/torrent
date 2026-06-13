"use client";

import { useEffect, useMemo, useState } from "react";
import {
    DEFAULT_TORRENT_SETTINGS,
    normalizeTorrentSettings,
    TORRENT_SETTING_DEFINITIONS,
    type TorrentSettingKey,
    type TorrentSettings,
} from "@/app/lib/torrentSettings";

type SaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

const ASPECT_PRESETS = [
    { label: "4:3", value: 4 / 3 },
    { label: "16:10", value: 16 / 10 },
    { label: "16:9", value: 16 / 9 },
    { label: "21:9", value: 21 / 9 },
];

export default function AdminPage() {
    const [settings, setSettings] = useState<TorrentSettings>(DEFAULT_TORRENT_SETTINGS);
    const [source, setSource] = useState("default");
    const [status, setStatus] = useState<SaveStatus>("loading");
    const [message, setMessage] = useState("");
    const [adminToken, setAdminToken] = useState("");

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

    const serializedSettings = useMemo(
        () => JSON.stringify(settings, null, 2),
        [settings]
    );

    function updateSetting(key: TorrentSettingKey, value: number) {
        setSettings((current) => normalizeTorrentSettings({
            ...current,
            [key]: value,
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
            setMessage("Saved.");
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

    return (
        <main className="min-h-screen bg-[#111] px-5 py-6 font-mono text-neutral-100">
            <div className="mx-auto max-w-5xl">
                <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-white/15 pb-4">
                    <div>
                        <h1 className="text-2xl uppercase tracking-normal">Torrent Admin</h1>
                        <p className="mt-2 text-sm text-neutral-400">Source: {source}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="border border-white/25 px-3 py-2 text-sm text-neutral-200 hover:border-white/60"
                            onClick={resetDefaults}
                        >
                            Reset defaults
                        </button>
                        <button
                            type="button"
                            className="border border-white bg-white px-3 py-2 text-sm text-black disabled:opacity-50"
                            disabled={!canSave}
                            onClick={saveSettings}
                        >
                            {status === "saving" ? "Saving" : "Save"}
                        </button>
                    </div>
                </header>

                <section className="mb-5 grid gap-3 border-b border-white/15 pb-5 md:grid-cols-[1fr_2fr]">
                    <label className="text-sm text-neutral-400" htmlFor="admin-token">
                        Admin token
                    </label>
                    <input
                        id="admin-token"
                        className="w-full border border-white/20 bg-black px-3 py-2 text-neutral-100 outline-none focus:border-white/60"
                        type="password"
                        value={adminToken}
                        onChange={(event) => setAdminToken(event.target.value)}
                        placeholder="Only needed when ADMIN_TOKEN is set"
                    />
                </section>

                {message && (
                    <div className={`mb-5 border px-3 py-2 text-sm ${status === "error" ? "border-red-500 text-red-200" : "border-white/20 text-neutral-300"}`}>
                        {message}
                    </div>
                )}

                <section className="mb-5 border-b border-white/15 pb-5">
                    <div className="mb-3 text-sm uppercase text-neutral-400">Canvas presets</div>
                    <div className="flex flex-wrap gap-2">
                        {ASPECT_PRESETS.map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                className="border border-white/25 px-3 py-2 text-sm text-neutral-200 hover:border-white/60"
                                onClick={() => updateSetting("canvasAspectRatio", preset.value)}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="grid gap-3">
                    {TORRENT_SETTING_DEFINITIONS.map((definition) => (
                        <label
                            key={definition.key}
                            className="grid gap-2 border border-white/10 bg-black/30 p-3 md:grid-cols-[220px_1fr_110px]"
                        >
                            <div>
                                <div className="text-sm text-neutral-100">{definition.label}</div>
                                <div className="mt-1 text-xs leading-relaxed text-neutral-500">{definition.description}</div>
                            </div>
                            <input
                                className="w-full accent-white"
                                type="range"
                                min={definition.min}
                                max={definition.max}
                                step={definition.step}
                                value={settings[definition.key]}
                                onChange={(event) => updateSetting(definition.key, Number(event.target.value))}
                            />
                            <div className="flex items-center gap-2">
                                <input
                                    className="w-full border border-white/20 bg-black px-2 py-1 text-right text-neutral-100 outline-none focus:border-white/60"
                                    type="number"
                                    min={definition.min}
                                    max={definition.max}
                                    step={definition.step}
                                    value={settings[definition.key]}
                                    onChange={(event) => updateSetting(definition.key, Number(event.target.value))}
                                />
                                {definition.unit && (
                                    <span className="w-8 text-xs text-neutral-500">{definition.unit}</span>
                                )}
                            </div>
                        </label>
                    ))}
                </section>

                <section className="mt-5 border border-white/10 bg-black/30 p-3">
                    <div className="mb-2 text-sm uppercase text-neutral-400">Current JSON</div>
                    <pre className="overflow-auto text-xs leading-relaxed text-neutral-400">{serializedSettings}</pre>
                </section>
            </div>
        </main>
    );
}
