import * as vscode from "vscode";
import { describe, it, expect } from "vitest";
import { GhostStrategy } from "../GhostStrategy";
import { MockWorkspace } from "./MockWorkspace";
import { buildApiHandler } from "../../../api";
import { GhostModel } from "../GhostModel";
import { allowNetConnect } from "../../../vitest.setup";
const KEYS = {
    KILOCODE: null,
    OPENROUTER: null,
    MISTRAL: null,
};
describe("GhostModelPerformance", () => {
    const generatePrompt = (userInput) => {
        const strategy = new GhostStrategy();
        const mockWorkspace = new MockWorkspace();
        const testUri = vscode.Uri.parse("file:///example.ts");
        const document = mockWorkspace.addDocument(testUri, "");
        const context = {
            userInput,
            document: document,
        };
        const systemPrompt = strategy.getSystemPrompt(context);
        const suggestionPrompt = strategy.getSuggestionPrompt(context);
        return { systemPrompt, suggestionPrompt };
    };
    const performTest = async (apiHandler, prompt) => {
        const model = new GhostModel(apiHandler);
        const startTime = performance.now();
        let fullResponse = "";
        const onChunk = (chunk) => {
            if (chunk.type === "text") {
                fullResponse += chunk.text;
            }
        };
        const usageInfo = await model.generateResponse(prompt.systemPrompt, prompt.suggestionPrompt, onChunk);
        const endTime = performance.now();
        const duration = endTime - startTime;
        expect(usageInfo).toBeDefined();
        expect(fullResponse).toContain("```diff");
        console.log(`Response time: ${duration}ms`);
    };
    const performTestBattery = async (apiHandler) => {
        const prompts = [
            generatePrompt("create a react hook to get the mouse position"),
            generatePrompt("create a react hook to get the viewport size"),
        ];
        for (const prompt of prompts) {
            await performTest(apiHandler, prompt);
        }
    };
    describe("Kilo Code", () => {
        it("google/gemini-2.5-flash", async () => {
            if (!KEYS.KILOCODE) {
                return;
            }
            allowNetConnect("api.kilocode.ai");
            const apiHandler = buildApiHandler({
                apiProvider: "kilocode",
                kilocodeModel: "google/gemini-2.5-flash",
                kilocodeToken: KEYS.KILOCODE,
            });
            await performTestBattery(apiHandler);
        });
        it("mistralai/codestral-2501", async () => {
            if (!KEYS.KILOCODE) {
                return;
            }
            allowNetConnect("api.kilocode.ai");
            const apiHandler = buildApiHandler({
                apiProvider: "kilocode",
                kilocodeModel: "mistralai/codestral-2501",
                kilocodeToken: KEYS.KILOCODE,
            });
            await performTestBattery(apiHandler);
        });
    });
    describe("Openrouter", () => {
        it("google/gemini-2.5-flash", async () => {
            if (!KEYS.OPENROUTER) {
                return;
            }
            allowNetConnect("openrouter.ai");
            const apiHandler = buildApiHandler({
                apiProvider: "openrouter",
                apiModelId: "google/gemini-2.5-flash",
                openRouterApiKey: KEYS.OPENROUTER,
            });
            await performTestBattery(apiHandler);
        });
        it("mistralai/codestral-2501", async () => {
            if (!KEYS.OPENROUTER) {
                return;
            }
            allowNetConnect("openrouter.ai");
            const apiHandler = buildApiHandler({
                apiProvider: "openrouter",
                apiModelId: "mistralai/codestral-2501",
                openRouterApiKey: KEYS.OPENROUTER,
            });
            await performTestBattery(apiHandler);
        });
    });
    describe("Mistral", () => {
        it("mistralai/codestral-2501", async () => {
            if (!KEYS.MISTRAL) {
                return;
            }
            allowNetConnect("codestral.mistral.ai");
            const apiHandler = buildApiHandler({
                apiProvider: "mistral",
                apiModelId: "codestral-2501",
                mistralApiKey: KEYS.MISTRAL,
            });
            await performTestBattery(apiHandler);
        });
    });
});
//# sourceMappingURL=GhostModelPerformance.spec.js.map