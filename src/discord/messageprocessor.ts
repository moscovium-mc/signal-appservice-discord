import { Message, ChannelType, Attachment } from "discord.js";
import { Log } from "../util/log";

const log = new Log("DiscordMessageProcessor");

export interface ParsedDiscordMessage {
    text: string;
    authorId: string;
    authorName: string;
    authorAvatarUrl?: string;
    channelId: string;
    guildId?: string;
    attachments: DiscordAttachmentInfo[];
    replyTo?: {
        messageId: string;
        authorId?: string;
        text?: string;
    };
    timestamp: number;
}

export interface DiscordAttachmentInfo {
    url: string;
    name: string;
    contentType: string;
    size: number;
}

export class DiscordMessageProcessor {
    public parseMessage(msg: Message): ParsedDiscordMessage {
        const attachments: DiscordAttachmentInfo[] = msg.attachments.map((a: Attachment) => ({
            url: a.url,
            name: a.name || "file",
            contentType: a.contentType || "application/octet-stream",
            size: a.size,
        }));

        let replyTo: ParsedDiscordMessage["replyTo"] = undefined;
        const ref = msg.reference;
        if (ref?.messageId) {
            replyTo = {
                messageId: ref.messageId,
            };
        }

        return {
            text: msg.content || "",
            authorId: msg.author.id,
            authorName: msg.member?.displayName || msg.author.username,
            authorAvatarUrl: msg.author.avatarURL() || undefined,
            channelId: msg.channel.id,
            guildId: msg.guild?.id,
            attachments,
            replyTo,
            timestamp: msg.createdTimestamp,
        };
    }

    public formatForSignal(parsed: ParsedDiscordMessage, bridgeName?: string): string {
        let formatted = parsed.text || "";

        if (parsed.attachments.length > 0) {
            const attachmentLines = parsed.attachments.map((a) => `[${a.name}](${a.url})`);
            if (formatted) formatted += "\n";
            formatted += attachmentLines.join("\n");
        }

        return formatted;
    }

    public getAttributionTag(parsed: ParsedDiscordMessage): string {
        return `[Discord] ${parsed.authorName}`;
    }
}
