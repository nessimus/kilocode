import { countTokens } from "../../utils/countTokens";
/**
 * Base class for API providers that implements common functionality.
 */
export class BaseProvider {
    /**
     * Default token counting implementation using tiktoken.
     * Providers can override this to use their native token counting endpoints.
     *
     * @param content The content to count tokens for
     * @returns A promise resolving to the token count
     */
    async countTokens(content) {
        if (content.length === 0) {
            return 0;
        }
        return countTokens(content, { useWorker: true });
    }
}
//# sourceMappingURL=base-provider.js.map