// npx vitest run src/shared/__tests__/ProfileValidator.spec.ts
import { ProfileValidator } from "../ProfileValidator";
describe("ProfileValidator", () => {
    describe("isProfileAllowed", () => {
        it("should allow any profile when allowAll is true", () => {
            const allowList = {
                allowAll: true,
                providers: {},
            };
            const profile = {
                apiProvider: "openai",
                openAiModelId: "gpt-4",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should reject profiles without an apiProvider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    openai: { allowAll: true },
                },
            };
            const profile = {};
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(false);
        });
        it("should reject profiles with provider not in allow list", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    anthropic: { allowAll: true },
                    gemini: { allowAll: false, models: ["gemini-pro"] },
                },
            };
            const profile = {
                apiProvider: "openai",
                openAiModelId: "gpt-4",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(false);
        });
        it("should allow human-relay provider regardless of model", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    "human-relay": { allowAll: false },
                },
            };
            const profile = {
                apiProvider: "human-relay",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should allow providers with allowAll=true regardless of model", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    openai: { allowAll: true },
                },
            };
            const profile = {
                apiProvider: "openai",
                openAiModelId: "any-model-id",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should reject if provider exists but model ID is missing", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    openai: { allowAll: false, models: ["gpt-4"] },
                },
            };
            const profile = {
                apiProvider: "openai",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(false);
        });
        it("should allow if model is in the allowed models list", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    openai: { allowAll: false, models: ["gpt-3.5-turbo", "gpt-4"] },
                },
            };
            const profile = {
                apiProvider: "openai",
                openAiModelId: "gpt-4",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should reject if model is not in the allowed models list", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    openai: { allowAll: false, models: ["gpt-3.5-turbo"] },
                },
            };
            const profile = {
                apiProvider: "openai",
                openAiModelId: "gpt-4",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(false);
        });
        it("should handle undefined models array in provider config", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    openai: { allowAll: false },
                },
            };
            const profile = {
                apiProvider: "openai",
                openAiModelId: "gpt-4",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(false);
        });
        it("should extract openAiModelId for openai provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    openai: { allowAll: false, models: ["gpt-4"] },
                },
            };
            const profile = {
                apiProvider: "openai",
                openAiModelId: "gpt-4",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should extract apiModelId for anthropic provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    anthropic: { allowAll: false, models: ["claude-3-opus"] },
                },
            };
            const profile = {
                apiProvider: "anthropic",
                apiModelId: "claude-3-opus",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should extract ollamaModelId for ollama provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    ollama: { allowAll: false, models: ["llama3"] },
                },
            };
            const profile = {
                apiProvider: "ollama",
                ollamaModelId: "llama3",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        // Test specific providers that use apiModelId
        const apiModelProviders = [
            "anthropic",
            "openai-native",
            "bedrock",
            "vertex",
            "gemini",
            "mistral",
            "deepseek",
            "xai",
            "groq",
            "chutes",
            "sambanova",
            "fireworks",
            "featherless",
        ];
        apiModelProviders.forEach((provider) => {
            it(`should extract apiModelId for ${provider} provider`, () => {
                const allowList = {
                    allowAll: false,
                    providers: {
                        [provider]: { allowAll: false, models: ["test-model"] },
                    },
                };
                const profile = {
                    apiProvider: provider, // Type assertion needed here
                    apiModelId: "test-model",
                };
                expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
            });
        });
        // Test for litellm provider which uses litellmModelId
        it(`should extract litellmModelId for litellm provider`, () => {
            const allowList = {
                allowAll: false,
                providers: {
                    litellm: { allowAll: false, models: ["test-model"] },
                },
            };
            const profile = {
                apiProvider: "litellm",
                litellmModelId: "test-model",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        // Test for io-intelligence provider which uses ioIntelligenceModelId
        it(`should extract ioIntelligenceModelId for io-intelligence provider`, () => {
            const allowList = {
                allowAll: false,
                providers: {
                    "io-intelligence": { allowAll: false, models: ["test-model"] },
                },
            };
            const profile = {
                apiProvider: "io-intelligence",
                ioIntelligenceModelId: "test-model",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should extract vsCodeLmModelSelector.id for vscode-lm provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    "vscode-lm": { allowAll: false, models: ["copilot-gpt-3.5"] },
                },
            };
            const profile = {
                apiProvider: "vscode-lm",
                vsCodeLmModelSelector: { id: "copilot-gpt-3.5" },
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should extract unboundModelId for unbound provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    unbound: { allowAll: false, models: ["unbound-model"] },
                },
            };
            const profile = {
                apiProvider: "unbound",
                unboundModelId: "unbound-model",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should extract lmStudioModelId for lmstudio provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    lmstudio: { allowAll: false, models: ["lmstudio-model"] },
                },
            };
            const profile = {
                apiProvider: "lmstudio",
                lmStudioModelId: "lmstudio-model",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should extract openRouterModelId for openrouter provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    openrouter: { allowAll: false, models: ["openrouter-model"] },
                },
            };
            const profile = {
                apiProvider: "openrouter",
                openRouterModelId: "openrouter-model",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should extract glamaModelId for glama provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    glama: { allowAll: false, models: ["glama-model"] },
                },
            };
            const profile = {
                apiProvider: "glama",
                glamaModelId: "glama-model",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should extract requestyModelId for requesty provider", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    requesty: { allowAll: false, models: ["requesty-model"] },
                },
            };
            const profile = {
                apiProvider: "requesty",
                requestyModelId: "requesty-model",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(true);
        });
        it("should handle providers with undefined models list gracefully", () => {
            const allowList = {
                allowAll: false,
                providers: {
                    "fake-ai": { allowAll: false },
                },
            };
            const profile = {
                apiProvider: "fake-ai",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(false);
        });
        it("should handle empty providers object", () => {
            const allowList = {
                allowAll: false,
                providers: {},
            };
            const profile = {
                apiProvider: "openai",
                openAiModelId: "gpt-4",
            };
            expect(ProfileValidator.isProfileAllowed(profile, allowList)).toBe(false);
        });
    });
});
//# sourceMappingURL=ProfileValidator.spec.js.map