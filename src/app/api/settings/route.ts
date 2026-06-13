import { NextRequest, NextResponse } from "next/server";
import {
    DEFAULT_TORRENT_SETTINGS,
    normalizeTorrentSettings,
    TORRENT_SETTINGS_ID,
    type TorrentSettings,
} from "@/app/lib/torrentSettings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const D1_QUERY_ENDPOINT = "https://api.cloudflare.com/client/v4/accounts";

interface D1QueryResult<T = Record<string, unknown>> {
    success: boolean;
    result?: Array<{
        results?: T[];
        success?: boolean;
        error?: string;
    }>;
    errors?: Array<{ message?: string }>;
}

function jsonResponse(settings: TorrentSettings, source: "d1" | "default") {
    return NextResponse.json({
        settings,
        definitionsVersion: 1,
        source,
    });
}

function getD1Config() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
    const token = process.env.CLOUDFLARE_D1_API_TOKEN;

    if (!accountId || !databaseId || !token) return null;

    return { accountId, databaseId, token };
}

async function queryD1<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const config = getD1Config();
    if (!config) {
        throw new Error("D1 is not configured");
    }

    const response = await fetch(
        `${D1_QUERY_ENDPOINT}/${config.accountId}/d1/database/${config.databaseId}/query`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ sql, params }),
            cache: "no-store",
        }
    );

    const body = await response.json().catch(() => null) as D1QueryResult<T> | null;
    if (!response.ok || !body?.success) {
        const message = body?.errors?.map((error) => error.message).filter(Boolean).join("; ");
        throw new Error(message || `D1 query failed with HTTP ${response.status}`);
    }

    const statementResult = body.result?.[0];
    if (statementResult?.success === false) {
        throw new Error(statementResult.error || "D1 statement failed");
    }

    return statementResult?.results || [];
}

async function ensureSettingsTable() {
    await queryD1(`
        CREATE TABLE IF NOT EXISTS torrent_settings (
            id TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    `);
}

async function readSettingsFromD1() {
    await ensureSettingsTable();
    const rows = await queryD1<{ value: string }>(
        "SELECT value FROM torrent_settings WHERE id = ? LIMIT 1",
        [TORRENT_SETTINGS_ID]
    );

    const rawValue = rows[0]?.value;
    if (!rawValue) {
        return null;
    }

    return normalizeTorrentSettings(JSON.parse(rawValue));
}

async function writeSettingsToD1(settings: TorrentSettings) {
    await ensureSettingsTable();
    await queryD1(
        `
            INSERT INTO torrent_settings (id, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        `,
        [TORRENT_SETTINGS_ID, JSON.stringify(settings)]
    );
}

function canWrite(request: NextRequest) {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) return true;
    return request.headers.get("x-admin-token") === adminToken;
}

export async function GET() {
    if (!getD1Config()) {
        return jsonResponse(DEFAULT_TORRENT_SETTINGS, "default");
    }

    try {
        const settings = await readSettingsFromD1();
        return jsonResponse(settings || DEFAULT_TORRENT_SETTINGS, settings ? "d1" : "default");
    } catch (error) {
        console.error("Unable to read Torrent settings:", error);
        return jsonResponse(DEFAULT_TORRENT_SETTINGS, "default");
    }
}

export async function PUT(request: NextRequest) {
    if (!canWrite(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const settings = normalizeTorrentSettings(body?.settings || body);

    if (!getD1Config()) {
        return NextResponse.json(
            {
                error: "D1 is not configured",
                settings,
            },
            { status: 503 }
        );
    }

    try {
        await writeSettingsToD1(settings);
        return jsonResponse(settings, "d1");
    } catch (error) {
        console.error("Unable to write Torrent settings:", error);
        return NextResponse.json({ error: "Unable to save settings" }, { status: 500 });
    }
}
