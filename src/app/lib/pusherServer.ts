import Pusher from "pusher";
import {
    PUSHER_SETTINGS_CHANNEL,
    PUSHER_SETTINGS_EVENT,
} from "./realtimeSettings";
import type { TorrentSettings } from "./torrentSettings";

let pusherClient: Pusher | null | undefined;

function getPusherClient() {
    if (pusherClient !== undefined) return pusherClient;

    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!appId || !key || !secret || !cluster) {
        pusherClient = null;
        return null;
    }

    pusherClient = new Pusher({
        appId,
        key,
        secret,
        cluster,
        useTLS: true,
    });

    return pusherClient;
}

export async function publishSettingsUpdated(settings: TorrentSettings) {
    const client = getPusherClient();
    if (!client) return false;

    await client.trigger(PUSHER_SETTINGS_CHANNEL, PUSHER_SETTINGS_EVENT, {
        settings,
    });

    return true;
}

