import { SignalEnvelope, SignalDataMessage } from "./client";
import { Log } from "../util/log";

const log = new Log("SignalMessageProcessor");

export interface ParsedSignalMessage {
    text: string;
    source: string;
    sourceName?: string;
    timestamp: number;
    groupId?: string;
    attachments: SignalAttachmentInfo[];
    quote?: {
        author?: string;
        text?: string;
    };
}

export interface SignalAttachmentInfo {
    contentType: string;
    filename?: string;
    size?: number;
    storedFilename?: string;
}

export class SignalMessageProcessor {
    public parseEnvelope(envelope: SignalEnvelope): ParsedSignalMessage | null {
        const dataMsg = envelope.dataMessage || envelope.syncMessage?.sentMessage;
        if (!dataMsg) {
            log.info("SIGNAL_PARSE: no dataMessage or syncMessage, skipping");
            return null;
        }

        const source = envelope.source || envelope.syncMessage?.sentMessage?.destination || "unknown";
        const sourceName = envelope.sourceName || "";
        const timestamp = envelope.timestamp || dataMsg.timestamp || Date.now();
        const groupId = dataMsg.groupInfo?.groupId;
        const text = dataMsg.message || "";

        log.info(`SIGNAL_PARSE: parsed source=${source} sourceName=${sourceName} groupId=${groupId ? groupId.substring(0, 16) + "..." : "none"} text="${text.substring(0, 100)}"`);

        const attachments: SignalAttachmentInfo[] = (dataMsg.attachments || []).map((a) => ({
            contentType: a.contentType,
            filename: a.filename,
            size: a.size,
            storedFilename: a.storedFilename,
        }));

        return {
            text,
            source,
            sourceName: sourceName || undefined,
            timestamp,
            groupId,
            attachments,
            quote: dataMsg.quote
                ? { author: dataMsg.quote.author, text: dataMsg.quote.text }
                : undefined,
        };
    }

    public formatForDiscord(parsed: ParsedSignalMessage): string {
        let formatted = parsed.text || "";

        if (parsed.attachments.length > 0) {
            if (formatted) formatted += "\n";
            formatted += `[${parsed.attachments.length} attachment(s)]`;
        }

        if (parsed.quote) {
            const quoted = parsed.quote.text ? parsed.quote.text.substring(0, 100) : "";
            formatted = `> ${quoted}\n${formatted}`;
        }

        return formatted;
    }
}
