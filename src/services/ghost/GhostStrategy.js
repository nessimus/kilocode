import { GhostStreamingParser } from "./GhostStreamingParser";
import { PromptStrategyManager } from "./PromptStrategyManager";
export class GhostStrategy {
    streamingParser;
    strategyManager;
    debug;
    constructor(options) {
        this.streamingParser = new GhostStreamingParser();
        this.strategyManager = new PromptStrategyManager(options);
        this.debug = options?.debug ?? false;
    }
    /**
     * Get the system prompt based on context using the new strategy system
     * Overloaded to support both new context-based and legacy string-only calls
     */
    getSystemPrompt(context) {
        const { systemPrompt, strategy } = this.strategyManager.buildPrompt(context);
        if (this.debug) {
            console.log(`[GhostStrategy] Using strategy: ${strategy.name}`);
        }
        return systemPrompt;
    }
    /**
     * Get the user prompt based on context using the new strategy system
     * @param context The suggestion context
     * @returns The user prompt
     */
    getSuggestionPrompt(context) {
        const { userPrompt, strategy } = this.strategyManager.buildPrompt(context);
        if (this.debug) {
            console.log(`[GhostStrategy] Generated prompt with strategy: ${strategy.name}`);
        }
        return userPrompt;
    }
    /**
     * Initialize streaming parser for incremental parsing
     */
    initializeStreamingParser(context) {
        this.streamingParser.initialize(context);
    }
    /**
     * Process a chunk of streaming response and return any newly completed suggestions
     */
    processStreamingChunk(chunk) {
        return this.streamingParser.processChunk(chunk);
    }
    /**
     * Reset the streaming parser for a new parsing session
     */
    resetStreamingParser() {
        this.streamingParser.reset();
    }
    /**
     * Finish the streaming parser and apply sanitization if needed
     */
    finishStreamingParser() {
        return this.streamingParser.finishStream();
    }
    /**
     * Get the current buffer content from the streaming parser (for debugging)
     */
    getStreamingBuffer() {
        return this.streamingParser.getBuffer();
    }
    /**
     * Get completed changes from the streaming parser (for debugging)
     */
    getStreamingCompletedChanges() {
        return this.streamingParser.getCompletedChanges();
    }
}
//# sourceMappingURL=GhostStrategy.js.map