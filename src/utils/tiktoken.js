import { Tiktoken } from "tiktoken/lite";
import o200kBase from "tiktoken/encoders/o200k_base";
const TOKEN_FUDGE_FACTOR = 1.5;
let encoder = null;
export async function tiktoken(content) {
    if (content.length === 0) {
        return 0;
    }
    let totalTokens = 0;
    // Lazily create and cache the encoder if it doesn't exist.
    if (!encoder) {
        encoder = new Tiktoken(o200kBase.bpe_ranks, o200kBase.special_tokens, o200kBase.pat_str);
    }
    // Process each content block using the cached encoder.
    for (const block of content) {
        if (block.type === "text") {
            const text = block.text || "";
            if (text.length > 0) {
                const tokens = encoder.encode(text, undefined, []);
                totalTokens += tokens.length;
            }
        }
        else if (block.type === "image") {
            // For images, calculate based on data size.
            const imageSource = block.source;
            if (imageSource && typeof imageSource === "object" && "data" in imageSource) {
                const base64Data = imageSource.data;
                totalTokens += Math.ceil(Math.sqrt(base64Data.length));
            }
            else {
                totalTokens += 300; // Conservative estimate for unknown images
            }
        }
    }
    // Add a fudge factor to account for the fact that tiktoken is not always
    // accurate.
    return Math.ceil(totalTokens * TOKEN_FUDGE_FACTOR);
}
//# sourceMappingURL=tiktoken.js.map