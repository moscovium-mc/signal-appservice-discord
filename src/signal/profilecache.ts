import { Log } from "../util/log";

const log = new Log("ProfileCache");

export class UserProfileCache {
    constructor(private contacts: { [phone: string]: string }) {}

    public getUsername(identifier: string): string | null {
        if (!identifier || identifier === "unknown") return null;

        const mapped = this.contacts[identifier] || this.contacts[identifier.replace(/^\+/, "")];
        if (mapped) {
            log.info(`PROFILE: resolved ${identifier.substring(0, 20)} -> ${mapped}`);
            return mapped;
        }

        log.verbose(`PROFILE: no mapping for ${identifier.substring(0, 20)}`);
        return null;
    }
}
