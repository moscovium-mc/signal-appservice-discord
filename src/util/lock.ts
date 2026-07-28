export class Lock {
    private locked: Set<string> = new Set();
    private queue: Map<string, Array<() => void>> = new Map();

    constructor(private timeoutMs: number) {}

    public set(key: string): void {
        this.locked.add(key);
    }

    public release(key: string): void {
        this.locked.delete(key);
        const q = this.queue.get(key);
        if (q && q.length > 0) {
            const resolve = q.shift()!;
            resolve();
        }
    }

    public async wait(key: string): Promise<void> {
        if (!this.locked.has(key)) {
            return;
        }
        return new Promise((resolve) => {
            if (!this.queue.has(key)) {
                this.queue.set(key, []);
            }
            this.queue.get(key)!.push(resolve);
        });
    }
}

export async function DelayedPromise(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
