import { ContextProxy } from "../core/config/ContextProxy";
const USAGE_STORAGE_KEY = "kilocode.virtualQuotaFallbackProvider.usage.v1";
const COOLDOWNS_STORAGE_KEY = "kilocode.virtualQuotaFallbackProvider.cooldowns.v1";
const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
export class UsageTracker {
    static _instance;
    memento;
    constructor(context) {
        this.memento = context.globalState;
    }
    static initialize(context) {
        if (!UsageTracker._instance) {
            UsageTracker._instance = new UsageTracker(context);
        }
        return UsageTracker._instance;
    }
    static getInstance() {
        if (!UsageTracker._instance) {
            UsageTracker.initialize(ContextProxy.instance.rawContext);
        }
        return UsageTracker._instance;
    }
    async consume(providerId, type, count) {
        const newEvent = {
            timestamp: Date.now(),
            providerId,
            type,
            count,
        };
        const allEvents = this.getPrunedEvents();
        allEvents.push(newEvent);
        await this.memento.update(USAGE_STORAGE_KEY, allEvents);
    }
    getUsage(providerId, window) {
        const now = Date.now();
        let startTime;
        switch (window) {
            case "minute":
                startTime = now - ONE_MINUTE_MS;
                break;
            case "hour":
                startTime = now - ONE_HOUR_MS;
                break;
            case "day":
                startTime = now - ONE_DAY_MS;
                break;
        }
        const allEvents = this.getPrunedEvents();
        const relevantEvents = allEvents.filter((event) => event.providerId === providerId && event.timestamp >= startTime);
        const result = relevantEvents.reduce((acc, event) => {
            if (event.type === "tokens") {
                acc.tokens += event.count;
            }
            else if (event.type === "requests") {
                acc.requests += event.count;
            }
            return acc;
        }, { tokens: 0, requests: 0 });
        return result;
    }
    getAllUsage(providerId) {
        return {
            minute: this.getUsage(providerId, "minute"),
            hour: this.getUsage(providerId, "hour"),
            day: this.getUsage(providerId, "day"),
        };
    }
    getPrunedEvents() {
        const allEvents = this.memento.get(USAGE_STORAGE_KEY, []);
        const cutoff = Date.now() - ONE_DAY_MS;
        const prunedEvents = allEvents.filter((event) => event.timestamp >= cutoff);
        return prunedEvents;
    }
    async clearAllUsageData() {
        await this.memento.update(USAGE_STORAGE_KEY, undefined);
        await this.memento.update(COOLDOWNS_STORAGE_KEY, undefined);
    }
    async setCooldown(providerId, durationMs) {
        const cooldownUntil = Date.now() + durationMs;
        const allCooldowns = await this.getPrunedCooldowns();
        allCooldowns[providerId] = cooldownUntil;
        await this.memento.update(COOLDOWNS_STORAGE_KEY, allCooldowns);
    }
    async isUnderCooldown(providerId) {
        const allCooldowns = await this.getPrunedCooldowns();
        const cooldownUntil = allCooldowns[providerId];
        if (cooldownUntil && Date.now() < cooldownUntil) {
            return true;
        }
        return false;
    }
    async getPrunedCooldowns() {
        const now = Date.now();
        const allCooldowns = this.memento.get(COOLDOWNS_STORAGE_KEY, {});
        const prunedCooldowns = {};
        for (const [providerId, cooldownUntil] of Object.entries(allCooldowns)) {
            if (cooldownUntil > now) {
                prunedCooldowns[providerId] = cooldownUntil;
            }
        }
        if (Object.keys(prunedCooldowns).length !== Object.keys(allCooldowns).length) {
            this.memento.update(COOLDOWNS_STORAGE_KEY, prunedCooldowns);
        }
        return prunedCooldowns;
    }
}
//# sourceMappingURL=usage-tracker.js.map