import { MappingConfig } from "../config";
import { Log } from "../util/log";

const log = new Log("MappingManager");

export interface ActiveMapping {
    name: string;
    signalId: string;
    discordChannelId: string;
    direction: "two-way" | "signal-to-discord" | "discord-to-signal";
    attribution: "username" | "webhook";
    signalIsGroup: boolean;
    scope: "any" | "group" | "dm";
}

export class MappingManager {
    private mappings: ActiveMapping[] = [];

    public loadFromConfig(configMappings: MappingConfig[]): void {
        this.mappings = configMappings.map((m) => ({
            name: m.name,
            signalId: m.signal,
            discordChannelId: m.discord,
            direction: m.direction,
            attribution: m.attribution,
            signalIsGroup: this.isBase64GroupId(m.signal),
            scope: m.scope || "any",
        }));
        log.info(`Loaded ${this.mappings.length} mappings from config`);
    }

    public loadFromDbMappings(dbMappings: any[]): void {
        // Collect Discord channels already claimed by config mappings
        const configChannels = new Set(this.mappings.map((m) => m.discordChannelId));
        for (const m of dbMappings) {
            // Skip exact duplicate
            const exists = this.mappings.some(
                (em) => em.signalId === m.signal_id && em.discordChannelId === m.discord_channel_id,
            );
            if (exists) continue;
            // Skip if config already has a mapping for this Discord channel (stale/overridden)
            if (configChannels.has(m.discord_channel_id)) continue;
            this.mappings.push({
                name: m.name || "Unnamed",
                signalId: m.signal_id,
                discordChannelId: m.discord_channel_id,
                direction: m.direction || "two-way",
                attribution: m.attribution || "username",
                signalIsGroup: this.isBase64GroupId(m.signal_id),
                scope: m.scope || "any",
            });
        }
        log.info(`Total mappings after DB load: ${this.mappings.length}`);
    }

    public getMappingsForSignal(signalId: string): ActiveMapping[] {
        return this.mappings.filter((m) => m.signalId === signalId);
    }

    public getMappingsForDiscordChannel(channelId: string): ActiveMapping[] {
        return this.mappings.filter((m) => m.discordChannelId === channelId);
    }

    public getMapBySignalAndDiscord(signalId: string, channelId: string): ActiveMapping | undefined {
        return this.mappings.find((m) => m.signalId === signalId && m.discordChannelId === channelId);
    }

    public getAll(): ActiveMapping[] {
        return this.mappings;
    }

    private isBase64GroupId(id: string): boolean {
        // Signal group IDs are base64-encoded strings (typically 24+ chars)
        // Phone numbers start with +
        return !id.startsWith("+");
    }
}
