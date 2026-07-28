import {
    Client as DiscordClient,
    GatewayIntentBits,
    TextChannel,
    Message,
    Webhook,
    EmbedBuilder,
    PermissionsBitField,
    ChannelType,
    Partials,
    Typing,
} from "discord.js";
import { DiscordConfig, LimitsConfig } from "../config";
import { Log } from "../util/log";
import { Lock, DelayedPromise } from "../util/lock";
import * as mime from "mime";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuid } from "uuid";
import { EventStore, EventStoreEntry, MappingStore } from "../db/eventstore";

const log = new Log("DiscordBot");

interface IDownloadResult {
    buffer: Buffer;
    mimeType: string;
}

export type DiscordMessageHandler = (msg: Message, mapping: any) => Promise<void>;
export type DiscordTypingHandler = (channelId: string, userId: string, mapping: any) => Promise<void>;

export class DiscordBot {
    private client: DiscordClient;
    private channelLock: Lock;
    private sentMessageIds: Set<string> = new Set();
    private onMessage: DiscordMessageHandler | null = null;
    private onTyping: DiscordTypingHandler | null = null;
    private started = false;
    private reconnectTimer: NodeJS.Timeout | null = null;

    constructor(
        private config: DiscordConfig,
        private limits: LimitsConfig,
        private eventStore: EventStore,
        private mappingStore: MappingStore,
    ) {
        const intents = [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
        ];

        if (config.usePrivilegedIntents) {
            intents.push(
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildPresences,
            );
        }

        this.client = new DiscordClient({
            intents,
            partials: [Partials.Channel, Partials.Message],
        });

        this.channelLock = new Lock(this.limits.discordSendDelay);
    }

    public set onDiscordMessage(handler: DiscordMessageHandler) {
        this.onMessage = handler;
    }

    public set onDiscordTyping(handler: DiscordTypingHandler) {
        this.onTyping = handler;
    }

    public async start(): Promise<void> {
        if (this.started) return;

        this.client.on("ready", () => {
            log.info(`Discord bot logged in as ${this.client.user?.tag}`);
            this.started = true;
        });

        this.client.on("messageCreate", async (msg: Message) => {
            try {
                await this.handleMessage(msg);
            } catch (err) {
                log.error("Error handling messageCreate:", err);
            }
        });

        this.client.on("messageDelete", async (msg) => {
            try {
                await this.handleMessageDelete(msg);
            } catch (err) {
                log.error("Error handling messageDelete:", err);
            }
        });

        this.client.on("messageUpdate", async (oldMsg, newMsg) => {
            try {
                if (newMsg.content && oldMsg.content !== newMsg.content) {
                    await this.handleMessage(newMsg as Message);
                }
            } catch (err) {
                log.error("Error handling messageUpdate:", err);
            }
        });

        if (!this.config.disableTypingNotifications) {
            this.client.on("typingStart", async (typing) => {
                try {
                    await this.handleTypingStart(typing);
                } catch (err) {
                    log.error("Error handling typingStart:", err);
                }
            });
        }

        this.client.on("error", (err) => {
            log.error("Discord client error:", err);
        });

        this.client.on("warn", (msg) => {
            log.warn("Discord client warning:", msg);
        });

        this.client.on("disconnect", () => {
            log.warn("Discord client disconnected");
            this.started = false;
            this.scheduleReconnect();
        });

        await this.client.login(this.config.token);
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        const delay = 5000;
        log.info(`Scheduling Discord reconnect in ${delay}ms`);
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                this.started = false;
                await this.start();
                log.info("Reconnected to Discord");
            } catch (err) {
                log.error("Discord reconnect failed:", err);
                this.scheduleReconnect();
            }
        }, delay);
    }

    private async handleMessage(msg: Message) {
        if (msg.author.bot) { log.verbose("Skipping bot message"); return; }
        if (this.sentMessageIds.has(msg.id)) { log.verbose("Skipping already-sent message"); return; }

        log.info(`DISCORD_MSG: received in channel ${msg.channel.id}: "${msg.content?.substring(0, 100)}"`);

        const mappings = await this.mappingStore.getByDiscordChannel(msg.channel.id);
        log.info(`DISCORD_MSG: DB returned ${mappings.length} mappings`);

        if (mappings.length === 0) return;

        for (const mapping of mappings) {
            log.info(`DISCORD_MSG: mapping signalId="${mapping.signalId?.substring(0, 20)}" isGroup=${mapping.signalIsGroup} direction=${mapping.direction}`);
            if (mapping.direction === "signal-to-discord") { log.verbose("Skipping signal-to-discord only mapping"); continue; }

            if (this.onMessage) {
                await this.onMessage(msg, mapping);
            }
        }
    }

    private async handleMessageDelete(msg: Message | PartialMessage) {
        if (this.config.disableDeletionForwarding) return;

        const entry = await this.eventStore.getByDiscordId(msg.id, msg.channel.id);
        if (!entry) return;

        log.info(`Discord message ${msg.id} was deleted (Signal timestamp: ${entry.signalTimestamp})`);
    }

    private async handleTypingStart(typing: Typing) {
        if (typing.user.bot) return;

        const mappings = await this.mappingStore.getByDiscordChannel(typing.channel.id);
        if (mappings.length === 0) return;

        for (const mapping of mappings) {
            if (mapping.direction === "signal-to-discord") continue;
            if (this.onTyping) {
                await this.onTyping(typing.channel.id, typing.user.id, mapping);
            }
        }
    }

    public async sendText(
        channelId: string,
        text: string,
        signalTimestamp: string,
        signalSource: string,
        attributionName?: string,
        attributionAvatarUrl?: string,
    ): Promise<string | null> {
        const channel = await this.client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
            log.warn(`Channel ${channelId} not found or not a text channel`);
            return null;
        }

        const textChan = channel as TextChannel;

        try {
            await this.channelLock.wait(channelId);
            this.channelLock.set(channelId);

            if (attributionName) {
                const webhooks = await textChan.fetchWebhooks();
                let webhook = webhooks.find((w) => w.name === "_signal");

                if (!webhook) {
                    webhook = await textChan.createWebhook({
                        name: "_signal",
                        avatar: attributionAvatarUrl || undefined,
                        reason: "Signal bridge: user attribution",
                    });
                }

                const msg = await webhook.send({
                    content: text,
                    username: attributionName.substring(0, 80),
                    avatarURL: attributionAvatarUrl,
                });

                const msgId = typeof msg === "string" ? msg : msg.id;
                await this.storeEvent(signalTimestamp, signalSource, msgId, channelId, "signal-to-discord");
                this.channelLock.release(channelId);
                return msgId;
            }

            const displayText = attributionName ? `**${attributionName}:** ${text}` : text;
            const msg = await textChan.send(displayText);
            await this.storeEvent(signalTimestamp, signalSource, msg.id, channelId, "signal-to-discord");
            this.channelLock.release(channelId);
            return msg.id;
        } catch (err) {
            this.channelLock.release(channelId);
            log.error("Failed to send Discord message:", err);
            return null;
        }
    }

    public async sendAttachment(
        channelId: string,
        buffer: Buffer,
        filename: string,
        caption: string,
        signalTimestamp: string,
        signalSource: string,
        attributionName?: string,
    ): Promise<string | null> {
        const channel = await this.client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) return null;
        const textChan = channel as TextChannel;

        try {
            await this.channelLock.wait(channelId);
            this.channelLock.set(channelId);

            const attachmentName = filename || `signal_attachment_${Date.now()}`;
            const msg = await textChan.send({
                content: attributionName ? `**${attributionName}:** ${caption}` : caption,
                files: [{ attachment: buffer, name: attachmentName }],
            });

            await this.storeEvent(signalTimestamp, signalSource, msg.id, channelId, "signal-to-discord");
            this.channelLock.release(channelId);
            return msg.id;
        } catch (err) {
            this.channelLock.release(channelId);
            log.error("Failed to send Discord attachment:", err);
            return null;
        }
    }

    private async storeEvent(
        signalTimestamp: string,
        signalSource: string,
        discordMessageId: string,
        discordChannelId: string,
        direction: "signal-to-discord" | "discord-to-signal",
    ) {
        const entry = new EventStoreEntry(
            uuid(),
            signalTimestamp,
            signalSource,
            discordMessageId,
            discordChannelId,
            direction,
        );
        await this.eventStore.insert(entry);
    }

    public markSent(messageId: string) {
        this.sentMessageIds.add(messageId);
        setTimeout(() => this.sentMessageIds.delete(messageId), 30000);
    }

    public async stop(): Promise<void> {
        this.client.destroy();
    }
}

interface PartialMessage {
    id: string;
    channel: { id: string };
}
