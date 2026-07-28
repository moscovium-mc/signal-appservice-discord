import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuid } from "uuid";
import { Log } from "../util/log";
import { URL } from "url";

const log = new Log("AttachmentHandler");

export interface DownloadedFile {
    buffer: Buffer;
    mimeType: string;
    filename: string;
}

export class AttachmentHandler {
    private tempDir: string;

    constructor(tempDir?: string) {
        this.tempDir = tempDir || path.join(__dirname, "..", "..", "tmp");
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    public async downloadFromUrl(url: string, defaultName?: string): Promise<DownloadedFile> {
        return new Promise((resolve, reject) => {
            const get = url.startsWith("https") ? https.get : http.get;
            const chunks: Buffer[] = [];
            let mimeType = "application/octet-stream";

            get(url, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    // Follow redirect
                    return this.downloadFromUrl(res.headers.location, defaultName).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
                    return;
                }
                mimeType = res.headers["content-type"] || mimeType;
                res.on("data", (chunk: Buffer) => chunks.push(chunk));
                res.on("end", () => {
                    const buffer = Buffer.concat(chunks);
                    const ext = path.extname(url) || mimeToExtension(mimeType);
                    const filename = defaultName || `attachment_${uuid()}${ext}`;
                    resolve({ buffer, mimeType, filename });
                });
            }).on("error", reject);
        });
    }

    public async saveToTemp(buffer: Buffer, filename: string): Promise<string> {
        const filePath = path.join(this.tempDir, filename);
        fs.writeFileSync(filePath, buffer);
        return filePath;
    }

    public cleanup(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch { /* best effort */ }
    }
}

function mimeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "audio/mpeg": ".mp3",
        "audio/ogg": ".ogg",
        "application/pdf": ".pdf",
        "text/plain": ".txt",
    };
    return map[mimeType] || ".bin";
}
