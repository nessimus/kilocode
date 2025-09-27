import { GlamaHandler, AnthropicHandler, AwsBedrockHandler, CerebrasHandler, OpenRouterHandler, VertexHandler, AnthropicVertexHandler, OpenAiHandler, LmStudioHandler, GeminiHandler, OpenAiNativeHandler, DeepSeekHandler, MoonshotHandler, MistralHandler, VsCodeLmHandler, UnboundHandler, RequestyHandler, HumanRelayHandler, FakeAIHandler, XAIHandler, GroqHandler, HuggingFaceHandler, ChutesHandler, LiteLLMHandler, 
// kilocode_change start
VirtualQuotaFallbackHandler, GeminiCliHandler, 
// kilocode_change end
ClaudeCodeHandler, QwenCodeHandler, SambaNovaHandler, IOIntelligenceHandler, DoubaoHandler, ZAiHandler, FireworksHandler, RooHandler, FeatherlessHandler, VercelAiGatewayHandler, DeepInfraHandler, } from "./providers";
// kilocode_change start
import { KilocodeOpenrouterHandler } from "./providers/kilocode-openrouter";
// kilocode_change end
import { NativeOllamaHandler } from "./providers/native-ollama";
export function buildApiHandler(configuration) {
    const { apiProvider, ...options } = configuration;
    switch (apiProvider) {
        // kilocode_change start
        case "kilocode":
            return new KilocodeOpenrouterHandler(options);
        case "gemini-cli":
            return new GeminiCliHandler(options);
        case "virtual-quota-fallback":
            return new VirtualQuotaFallbackHandler(options);
        // kilocode_change end
        case "anthropic":
            return new AnthropicHandler(options);
        case "claude-code":
            return new ClaudeCodeHandler(options);
        case "glama":
            return new GlamaHandler(options);
        case "openrouter":
            return new OpenRouterHandler(options);
        case "bedrock":
            return new AwsBedrockHandler(options);
        case "vertex":
            return options.apiModelId?.startsWith("claude")
                ? new AnthropicVertexHandler(options)
                : new VertexHandler(options);
        case "openai":
            return new OpenAiHandler(options);
        case "ollama":
            return new NativeOllamaHandler(options);
        case "lmstudio":
            return new LmStudioHandler(options);
        case "gemini":
            return new GeminiHandler(options);
        case "openai-native":
            return new OpenAiNativeHandler(options);
        case "deepseek":
            return new DeepSeekHandler(options);
        case "doubao":
            return new DoubaoHandler(options);
        case "qwen-code":
            return new QwenCodeHandler(options);
        case "moonshot":
            return new MoonshotHandler(options);
        case "vscode-lm":
            return new VsCodeLmHandler(options);
        case "mistral":
            return new MistralHandler(options);
        case "unbound":
            return new UnboundHandler(options);
        case "requesty":
            return new RequestyHandler(options);
        case "human-relay":
            return new HumanRelayHandler();
        case "fake-ai":
            return new FakeAIHandler(options);
        case "xai":
            return new XAIHandler(options);
        case "groq":
            return new GroqHandler(options);
        case "deepinfra":
            return new DeepInfraHandler(options);
        case "huggingface":
            return new HuggingFaceHandler(options);
        case "chutes":
            return new ChutesHandler(options);
        case "litellm":
            return new LiteLLMHandler(options);
        case "cerebras":
            return new CerebrasHandler(options);
        case "sambanova":
            return new SambaNovaHandler(options);
        case "zai":
            return new ZAiHandler(options);
        case "fireworks":
            return new FireworksHandler(options);
        case "io-intelligence":
            return new IOIntelligenceHandler(options);
        case "roo":
            // Never throw exceptions from provider constructors
            // The provider-proxy server will handle authentication and return appropriate error codes
            return new RooHandler(options);
        case "featherless":
            return new FeatherlessHandler(options);
        case "vercel-ai-gateway":
            return new VercelAiGatewayHandler(options);
        default:
            apiProvider;
            return new AnthropicHandler(options);
    }
}
//# sourceMappingURL=index.js.map