import { ChildProcess, spawn } from "child_process";
import * as net from "net";
import * as path from "path";
import { Log } from "../util/log";
import { SignalConfig } from "../config";

const log = new Log("SignalClient");

export interface SignalEnvelope {
    source: string;
    sourceNumber?: string;
    sourceUuid?: string;
    sourceName?: string;
    sourceDevice?: number;
    timestamp?: number;
    dataMessage?: SignalDataMessage;
    syncMessage?: SignalSyncMessage;
}

export interface SignalDataMessage {
    message?: string;
    timestamp?: number;
    groupInfo?: SignalGroupInfo;
    attachments?: SignalAttachment[];
    quote?: SignalQuote;
}

export interface SignalGroupInfo {
    groupId: string;
    type: "DELIVER" | "UPDATE" | "QUIT";
    name?: string;
}

export interface SignalAttachment {
    contentType: string;
    filename?: string;
    size?: number;
    storedFilename?: string;
}

export interface SignalQuote {
    id?: number;
    author?: string;
    text?: string;
}

export interface SignalSyncMessage {
    sentMessage?: {
        message?: string;
        destination?: string;
        timestamp?: number;
        groupInfo?: SignalGroupInfo;
        attachments?: SignalAttachment[];
        quote?: SignalQuote;
    } & SignalDataMessage;
}

export type SignalMessageHandler = (envelope: SignalEnvelope) => Promise<void>;

export class SignalClient {
    private process: ChildProcess | null = null;
    private socket: net.Socket | null = null;
    private requestId = 0;
    private pendingRequests: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
    private buffer = "";
    private onMessage: SignalMessageHandler | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private shuttingDown = false;

    constructor(private config: SignalConfig) {}

    public set onReceive(handler: SignalMessageHandler) {
        this.onMessage = handler;
    }

    public async start(): Promise<void> {
        log.info(`Starting Signal client in ${this.config.mode} mode`);
        if (this.config.mode === "native") {
            await this.startNativeProcess();
        } else {
            await this.connectSocket();
            try {
                await this.jsonRpcCall("subscribe", { username: this.config.account });
            } catch {
                log.verbose("Subscribe RPC not needed (daemon auto-subscribes)");
            }
            log.info("Signal client connected to daemon");
        }
    }

    private async startNativeProcess(): Promise<void> {
        const socketDir = path.dirname(this.config.socketPath);
        const args = [
            "--dbus", "none",
            "--json-rpc", this.config.socketPath,
            "-u", this.config.account,
        ];

        log.info(`Spawning: ${this.config.cliPath} ${args.join(" ")}`);
        this.process = spawn(this.config.cliPath, args, {
            stdio: ["ignore", "pipe", "pipe"],
            detached: false,
        });

        this.process.stdout?.on("data", (data: Buffer) => {
            log.verbose(`signal-cli stdout: ${data.toString().trim()}`);
        });

        this.process.stderr?.on("data", (data: Buffer) => {
            const msg = data.toString().trim();
            if (msg) log.verbose(`signal-cli stderr: ${msg}`);
        });

        this.process.on("exit", (code, signal) => {
            log.warn(`signal-cli exited with code ${code} signal ${signal}`);
            if (!this.shuttingDown) {
                this.scheduleReconnect();
            }
        });

        this.process.on("error", (err) => {
            log.error(`signal-cli process error: ${err.message}`);
            if (!this.shuttingDown) {
                this.scheduleReconnect();
            }
        });

        // Wait for socket to exist
        await this.waitForSocket();
        await this.connectSocket();

        // Subscribe to incoming messages
        await this.jsonRpcCall("subscribe", { username: this.config.account });
        log.info("Signal client subscribed and ready");
    }

    private async connectSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.config.port) {
                const host = this.config.host || "127.0.0.1";
                this.socket = net.createConnection(this.config.port, host, () => {
                    log.info(`Connected to signal-cli JSON-RPC via TCP ${host}:${this.config.port}`);
                    resolve();
                });
            } else {
                this.socket = net.createConnection(this.config.socketPath, () => {
                    log.info("Connected to signal-cli JSON-RPC socket");
                    resolve();
                });
            }

            this.socket.on("data", (data: Buffer) => {
                this.handleSocketData(data.toString("utf8"));
            });

            this.socket.on("error", (err) => {
                log.error(`Socket error: ${err.message}`);
                if (!this.shuttingDown) {
                    this.scheduleReconnect();
                }
                reject(err);
            });

            this.socket.on("close", () => {
                log.warn("Socket closed");
                if (!this.shuttingDown) {
                    this.scheduleReconnect();
                }
            });

            setTimeout(() => reject(new Error("Socket connection timeout")), 10000);
        });
    }

    private handleSocketData(data: string) {
        this.buffer += data;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                this.handleJsonRpcMessage(msg);
            } catch (err) {
                log.warn(`Failed to parse JSON-RPC message: ${line.substring(0, 200)}`);
            }
        }
    }

    private handleJsonRpcMessage(msg: any) {
        // Response to a request we sent
        if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject } = this.pendingRequests.get(msg.id)!;
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
                reject(new Error(msg.error.message || "JSON-RPC error"));
            } else {
                resolve(msg.result);
            }
            return;
        }

        // Incoming message notification
        if (msg.method === "receive" && msg.params) {
            const envelope = msg.params.envelope as SignalEnvelope;
            if (!envelope) return;
            if (!envelope.dataMessage && !envelope.syncMessage) return;
            log.info(`SIGNAL_RECEIVE: source=${envelope.source} sourceName=${envelope.sourceName} hasData=${!!envelope.dataMessage}`);
            if (this.onMessage) {
                this.onMessage(envelope).catch((err) => {
                    log.error("Error handling Signal message:", err);
                });
            }
            return;
        }

        log.info(`SIGNAL_RECEIVE: unhandled message method=${msg.method} id=${msg.id}`);
    }

    private async jsonRpcCall(method: string, params: any): Promise<any> {
        const id = String(++this.requestId);
        const request = JSON.stringify({ jsonrpc: "2.0", id, method, params });

        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Signal client not connected"));
                return;
            }
            this.pendingRequests.set(id, { resolve, reject });
            this.socket.write(request + "\n");

            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`JSON-RPC call ${method} timed out`));
                }
            }, 30000);
        });
    }

    public async sendMessage(destination: string, message: string): Promise<any> {
        log.info(`Sending Signal message to ${destination}`);
        return this.jsonRpcCall("send", {
            recipient: [destination],
            message,
            username: this.config.account,
        });
    }

    public async sendGroupMessage(groupId: string, message: string): Promise<any> {
        log.info(`Sending Signal message to group ${groupId.substring(0, 16)}...`);
        return this.jsonRpcCall("send", {
            groupId,
            message,
            username: this.config.account,
        });
    }

    public async sendAttachment(destination: string, message: string, filePath: string): Promise<any> {
        return this.jsonRpcCall("send", {
            recipient: [destination],
            message,
            username: this.config.account,
            attachment: filePath,
        });
    }

    public async sendGroupAttachment(groupId: string, message: string, filePath: string): Promise<any> {
        return this.jsonRpcCall("send", {
            groupId,
            message,
            username: this.config.account,
            attachment: filePath,
        });
    }

    public async sendTyping(destination: string): Promise<any> {
        return this.jsonRpcCall("sendTyping", {
            recipient: [destination],
            username: this.config.account,
        });
    }

    public async sendGroupTyping(groupId: string): Promise<any> {
        return this.jsonRpcCall("sendTyping", {
            groupId,
            username: this.config.account,
        });
    }

    public async getProfile(recipient: string): Promise<any> {
        try {
            return await this.jsonRpcCall("getProfile", {
                recipient,
                username: this.config.account,
            });
        } catch {
            return null;
        }
    }

    public async getUserStatus(recipients: string[]): Promise<any[]> {
        try {
            const result = await this.jsonRpcCall("getUserStatus", {
                recipients,
                username: this.config.account,
            });
            return result || [];
        } catch {
            return [];
        }
    }

    public async listGroups(): Promise<any[]> {
        const result = await this.jsonRpcCall("listGroups", { username: this.config.account });
        return result || [];
    }

    public async updateProfile(name?: string): Promise<void> {
        await this.jsonRpcCall("updateProfile", {
            username: this.config.account,
            name,
        });
    }

    public getAttachmentDir(): string {
        return this.config.attachmentDir;
    }

    private async waitForSocket(): Promise<void> {
        const maxWait = 30000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            try {
                await this.jsonRpcCall("ping", { username: this.config.account });
                return;
            } catch {
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
        throw new Error("Timed out waiting for signal-cli socket");
    }

    private scheduleReconnect() {
        if (this.reconnectTimer || this.shuttingDown) return;
        const delay = 5000;
        log.info(`Scheduling reconnect in ${delay}ms`);
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            this.cleanup();
            try {
                await this.start();
                log.info("Reconnected to signal-cli");
            } catch (err) {
                log.error("Reconnect failed:", err);
                this.scheduleReconnect();
            }
        }, delay);
    }

    private cleanup() {
        this.socket?.destroy();
        this.socket = null;
        for (const [, { reject }] of this.pendingRequests) {
            reject(new Error("Signal client disconnected"));
        }
        this.pendingRequests.clear();
    }

    public async stop(): Promise<void> {
        this.shuttingDown = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.cleanup();
        if (this.process) {
            this.process.kill("SIGTERM");
            this.process = null;
        }
        for (const [, { reject }] of this.pendingRequests) {
            reject(new Error("Signal client shutting down"));
        }
        this.pendingRequests.clear();
    }
}
