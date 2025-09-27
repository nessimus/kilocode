export class WebSearchError extends Error {
    attempts;
    constructor(message, attempts) {
        super(message);
        this.attempts = attempts;
        this.name = "WebSearchError";
    }
}
//# sourceMappingURL=types.js.map