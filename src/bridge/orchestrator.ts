import * as fs from "fs";
import * as path from "path";
import { Log } from "../util/log";
import { Config } from "../config";
import { SignalClient, SignalEnvelope } from "../signal/client";
import { SignalMessageProcessor, ParsedSignalMessage } from "../signal/messageprocessor";
import { UserProfileCache } from "../signal/profilecache";
import { DiscordBot } from "../discord/bot";
import { DiscordMessageProcessor, ParsedDiscordMessage } from "../discord/messageprocessor";
import { MappingManager, ActiveMapping } from "./mapping";
import { AttachmentHandler, DownloadedFile } from "./attachment";
import { GroupSync } from "./groupsync";
import { Provisioner } from "./provisioner";
import { EventStore, MappingStore, EventStoreEntry } from "../db/eventstore";
import { Message } from "discord.js";

const log = new Log("Orchestrator");

export class Orchestrator {
    private signalClient: SignalClient;
    private signalProcessor: SignalMessageProcessor;
    private discordBot: DiscordBot;
    private discordProcessor: DiscordMessageProcessor;
    private mappingManager: MappingManager;
    private attachmentHandler: AttachmentHandler;
    private groupSync: GroupSync | null = null;
    private provisioner: Provisioner | null = null;
    private eventStore: EventStore;
    private mappingStore: MappingStore;
    private config: Config;
    private profileCache: UserProfileCache;

    constructor(
        config: Config,
        signalClient: SignalClient,
        discordBot: DiscordBot,
        eventStore: EventStore,
        mappingStore: MappingStore,
    ) {
        this.config = config;
        this.signalClient = signalClient;
        this.discordBot = discordBot;
        this.eventStore = eventStore;
        this.mappingStore = mappingStore;
        this.signalProcessor = new SignalMessageProcessor();
        this.discordProcessor = new DiscordMessageProcessor();
        this.mappingManager = new MappingManager();
        this.attachmentHandler = new AttachmentHandler();
        this.profileCache = new UserProfileCache(config.contacts);

        if (config.groupsync.enable) {
            this.groupSync = new GroupSync(signalClient, this.mappingManager, config.groupsync.interval);
        }

        this.provisioner = new Provisioner(config.provisioning, this.mappingManager, mappingStore);

        this.setupHandlers();
    }

    public async init(): Promise<void> {
        this.mappingManager.loadFromConfig(this.config.mappings);

        // Load runtime mappings from DB (created by provisioner)
        const dbMappings = await this.mappingStore.getAll();
        this.mappingManager.loadFromDbMappings(dbMappings);

        // Sync config mappings to DB for runtime lookup
        for (const mapping of this.mappingManager.getAll()) {
            await this.mappingStore.upsert({
                signalId: mapping.signalId,
                discordChannelId: mapping.discordChannelId,
                name: mapping.name,
                direction: mapping.direction,
                attribution: mapping.attribution,
            });
        }

        log.info(`Orchestrator initialized with ${this.mappingManager.getAll().length} mappings`);
    }

    public start(): void {
        this.groupSync?.start();
        this.provisioner?.start();
    }

    public stop(): void {
        this.groupSync?.stop();
        this.provisioner?.stop();
    }

    private setupHandlers(): void {
        this.signalClient.onReceive = async (envelope: SignalEnvelope) => {
            try {
                await this.handleSignalMessage(envelope);
            } catch (err) {
                log.error("Error handling Signal message:", err);
            }
        };

        this.discordBot.onDiscordMessage = async (msg: Message, mapping: any) => {
            try {
                await this.handleDiscordMessage(msg, mapping);
            } catch (err) {
                log.error("Error handling Discord message:", err);
            }
        };

        this.discordBot.onDiscordTyping = async (channelId: string, userId: string, mapping: any) => {
            try {
                await this.handleDiscordTyping(channelId, userId, mapping);
            } catch (err) {
                log.verbose("Error handling Discord typing:", err);
            }
        };
    }

    private async handleSignalMessage(envelope: SignalEnvelope): Promise<void> {
        try {
            const parsed = this.signalProcessor.parseEnvelope(envelope);
            if (!parsed) {
                log.info("SIGNAL_HANDLE: parseEnvelope returned null, dropping");
                return;
            }

            log.info(`SIGNAL_HANDLE: parsed source=${parsed.source.substring(0, 20)} groupId=${parsed.groupId ? parsed.groupId.substring(0, 16)+"..." : "none"}`);

            const signalId = parsed.groupId || parsed.source;
            log.info(`SIGNAL_HANDLE: looking up mappings for signalId=${signalId.substring(0, 20)}`);

            const mappings = this.mappingManager.getMappingsForSignal(signalId);
            log.info(`SIGNAL_HANDLE: found ${mappings.length} mappings`);

            if (mappings.length === 0) {
                log.info(`SIGNAL_HANDLE: no mappings for ${signalId.substring(0, 20)}`);
                return;
            }

            const eligibleMappings = mappings.filter((m) => {
                if (m.direction !== "two-way" && m.direction !== "signal-to-discord") return false;
                if (m.scope === "any") return true;
                if (m.scope === "group") return !!parsed.groupId;
                if (m.scope === "dm") return !parsed.groupId;
                return true;
            });
            if (eligibleMappings.length === 0) return;

            const timestamp = String(parsed.timestamp || Date.now());

            // Dedup: skip if this is an echo of a message we sent (Discord→Signal)
            const echoCheck = await this.eventStore.getBySignalId(timestamp, signalId);
            if (echoCheck) {
                log.info(`SIGNAL_HANDLE: skipping echo (was ${echoCheck.direction}): ts=${timestamp.substring(0, 16)}`);
                return;
            }

            // Skip sync messages from own device (no envelope.source)
            if (!envelope.source) {
                log.verbose("Skipping message with no source (own device sync)");
                return;
            }

            // Display: use sourceName from envelope, else contacts mapping, else last 4 digits
            const rawName = parsed.sourceName
                || await this.profileCache.getUsername(parsed.source)
                || `Signal-${parsed.source.substring(parsed.source.length - 4)}`;
            const displayName = `[Signal] ${rawName}`;

            const attachments = parsed.attachments || [];

            for (const mapping of eligibleMappings) {
                const attributionName = mapping.attribution === "webhook" ? displayName : undefined;

                if (attachments.length > 0 && this.config.signal.attachmentDir) {
                    for (const att of attachments) {
                        if (!att.storedFilename) continue;
                        const filePath = path.join(this.config.signal.attachmentDir, att.storedFilename);
                        try {
                            const buffer = fs.readFileSync(filePath);
                            const filename = att.filename || att.storedFilename;
                            await this.discordBot.sendAttachment(
                                mapping.discordChannelId, buffer, filename,
                                parsed.text, timestamp, displayName, attributionName,
                            );
                        } catch (err) {
                            log.error(`Failed to read attachment ${filePath}:`, err);
                        }
                    }
                } else if (parsed.text) {
                    const formattedText = this.signalProcessor.formatForDiscord(parsed);
                    await this.discordBot.sendText(
                        mapping.discordChannelId, formattedText,
                        timestamp, displayName, attributionName,
                    );
                }

                log.info(
                    `Bridged Signal ${parsed.groupId ? "group" : "DM"} ${signalId.substring(0, 16)}... ` +
                    `→ Discord channel ${mapping.discordChannelId}`,
                );
            }
        } catch (err) {
            log.error("Failed to handle Signal message:", err);
        }
    }

    private async handleDiscordMessage(msg: Message, mapping: any): Promise<void> {
        try {
            const parsed = this.discordProcessor.parseMessage(msg);
            const text = this.discordProcessor.formatForSignal(parsed, mapping.name);
            const attributionTag = this.discordProcessor.getAttributionTag(parsed);

            const signalText = `${attributionTag}\n${text}`;
            let signalTimestamp: string | null = null;

            if (mapping.signalIsGroup) {
                if (parsed.attachments.length > 0) {
                    for (const att of parsed.attachments) {
                        const downloaded = await this.attachmentHandler.downloadFromUrl(att.url, att.name);
                        const tmpPath = await this.attachmentHandler.saveToTemp(downloaded.buffer, downloaded.filename);
                        const result = await this.signalClient.sendGroupAttachment(mapping.signalId, signalText, tmpPath);
                        signalTimestamp = String(result?.timestamp || result || Date.now());
                        this.attachmentHandler.cleanup(tmpPath);
                    }
                } else {
                    const result = await this.signalClient.sendGroupMessage(mapping.signalId, signalText);
                    signalTimestamp = String(result?.timestamp || result || Date.now());
                }
            } else {
                if (parsed.attachments.length > 0) {
                    for (const att of parsed.attachments) {
                        const downloaded = await this.attachmentHandler.downloadFromUrl(att.url, att.name);
                        const tmpPath = await this.attachmentHandler.saveToTemp(downloaded.buffer, downloaded.filename);
                        const result = await this.signalClient.sendAttachment(mapping.signalId, signalText, tmpPath);
                        signalTimestamp = String(result?.timestamp || result || Date.now());
                        this.attachmentHandler.cleanup(tmpPath);
                    }
                } else {
                    const result = await this.signalClient.sendMessage(mapping.signalId, signalText);
                    signalTimestamp = String(result?.timestamp || result || Date.now());
                }
            }

            this.discordBot.markSent(msg.id);

            // Store event to prevent echo loop (sync message coming back)
            if (signalTimestamp) {
                await this.eventStore.insert(new EventStoreEntry(
                    `discord-${msg.id}`,
                    signalTimestamp, mapping.signalId, msg.id, msg.channelId,
                    "discord-to-signal",
                )).catch(() => {});
            }

            log.info(
                `Bridged Discord #${parsed.authorName} → Signal ${mapping.signalIsGroup ? "group" : "DM"} ` +
                `${mapping.signalId.substring(0, 16)}...`,
            );
        } catch (err) {
            log.error("Failed to handle Discord message:", err);
        }
    }

    private async handleDiscordTyping(channelId: string, userId: string, mapping: any): Promise<void> {
        try {
            if (mapping.signalIsGroup) {
                if (this.groupSync) {
                    const groupInfo = this.groupSync.getGroup(mapping.signalId);
                    if (groupInfo) {
                        // Send typing indicator only to group
                        await this.signalClient.sendGroupTyping(mapping.signalId);
                    }
                }
            } else {
                await this.signalClient.sendTyping(mapping.signalId);
            }
        } catch (err) {
            // Typing is best-effort; don't log errors
        }
    }
}
