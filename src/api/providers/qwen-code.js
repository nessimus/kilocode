import { promises as fs } from "node:fs";
import OpenAI from "openai";
import * as os from "os";
import * as path from "path";
import { qwenCodeModels, qwenCodeDefaultModelId } from "@roo-code/types";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { BaseProvider } from "./base-provider";
const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai";
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;
const QWEN_OAUTH_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
const QWEN_DIR = ".qwen";
const QWEN_CREDENTIAL_FILENAME = "oauth_creds.json";
function getQwenCachedCredentialPath(customPath) {
    if (customPath) {
        // Support custom path that starts with ~/ or is absolute
        if (customPath.startsWith("~/")) {
            return path.join(os.homedir(), customPath.slice(2));
        }
        return path.resolve(customPath);
    }
    return path.join(os.homedir(), QWEN_DIR, QWEN_CREDENTIAL_FILENAME);
}
function objectToUrlEncoded(data) {
    return Object.keys(data)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
        .join("&");
}
export class QwenCodeHandler extends BaseProvider {
    options;
    credentials = null;
    client;
    refreshPromise = null;
    constructor(options) {
        super();
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            // Create the client instance with dummy key initially
            // The API key will be updated dynamically via ensureAuthenticated
            this.client = new OpenAI({
                apiKey: "dummy-key-will-be-replaced",
                baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            });
        }
        return this.client;
    }
    async loadCachedQwenCredentials() {
        try {
            const keyFile = getQwenCachedCredentialPath(this.options.qwenCodeOauthPath);
            const credsStr = await fs.readFile(keyFile, "utf-8");
            return JSON.parse(credsStr);
        }
        catch (error) {
            console.error(`Error reading or parsing credentials file at ${getQwenCachedCredentialPath(this.options.qwenCodeOauthPath)}`);
            throw new Error(`Failed to load Qwen OAuth credentials: ${error}`);
        }
    }
    async refreshAccessToken(credentials) {
        // If a refresh is already in progress, return the existing promise
        if (this.refreshPromise) {
            return this.refreshPromise;
        }
        // Create a new refresh promise
        this.refreshPromise = this.doRefreshAccessToken(credentials);
        try {
            const result = await this.refreshPromise;
            return result;
        }
        finally {
            // Clear the promise after completion (success or failure)
            this.refreshPromise = null;
        }
    }
    async doRefreshAccessToken(credentials) {
        if (!credentials.refresh_token) {
            throw new Error("No refresh token available in credentials.");
        }
        const bodyData = {
            grant_type: "refresh_token",
            refresh_token: credentials.refresh_token,
            client_id: QWEN_OAUTH_CLIENT_ID,
        };
        const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: objectToUrlEncoded(bodyData),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token refresh failed: ${response.status} ${response.statusText}. Response: ${errorText}`);
        }
        const tokenData = await response.json();
        if (tokenData.error) {
            throw new Error(`Token refresh failed: ${tokenData.error} - ${tokenData.error_description}`);
        }
        const newCredentials = {
            ...credentials,
            access_token: tokenData.access_token,
            token_type: tokenData.token_type,
            refresh_token: tokenData.refresh_token || credentials.refresh_token,
            expiry_date: Date.now() + tokenData.expires_in * 1000,
        };
        const filePath = getQwenCachedCredentialPath(this.options.qwenCodeOauthPath);
        try {
            await fs.writeFile(filePath, JSON.stringify(newCredentials, null, 2));
        }
        catch (error) {
            console.error("Failed to save refreshed credentials:", error);
            // Continue with the refreshed token in memory even if file write fails
        }
        return newCredentials;
    }
    isTokenValid(credentials) {
        const TOKEN_REFRESH_BUFFER_MS = 30 * 1000; // 30s buffer
        if (!credentials.expiry_date) {
            return false;
        }
        return Date.now() < credentials.expiry_date - TOKEN_REFRESH_BUFFER_MS;
    }
    async ensureAuthenticated() {
        if (!this.credentials) {
            this.credentials = await this.loadCachedQwenCredentials();
        }
        if (!this.isTokenValid(this.credentials)) {
            this.credentials = await this.refreshAccessToken(this.credentials);
        }
        // After authentication, update the apiKey and baseURL on the existing client
        const client = this.ensureClient();
        client.apiKey = this.credentials.access_token;
        client.baseURL = this.getBaseUrl(this.credentials);
    }
    getBaseUrl(creds) {
        let baseUrl = creds.resource_url || "https://dashscope.aliyuncs.com/compatible-mode/v1";
        if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
            baseUrl = `https://${baseUrl}`;
        }
        return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    }
    async callApiWithRetry(apiCall) {
        try {
            return await apiCall();
        }
        catch (error) {
            if (error.status === 401) {
                // Token expired, refresh and retry
                this.credentials = await this.refreshAccessToken(this.credentials);
                const client = this.ensureClient();
                client.apiKey = this.credentials.access_token;
                client.baseURL = this.getBaseUrl(this.credentials);
                return await apiCall();
            }
            else {
                throw error;
            }
        }
    }
    async *createMessage(systemPrompt, messages) {
        await this.ensureAuthenticated();
        const client = this.ensureClient();
        const model = this.getModel();
        const systemMessage = {
            role: "system",
            content: systemPrompt,
        };
        const convertedMessages = [systemMessage, ...convertToOpenAiMessages(messages)];
        const requestOptions = {
            model: model.id,
            temperature: 0,
            messages: convertedMessages,
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: model.info.maxTokens,
        };
        const stream = await this.callApiWithRetry(() => client.chat.completions.create(requestOptions));
        let fullContent = "";
        for await (const apiChunk of stream) {
            const delta = apiChunk.choices[0]?.delta ?? {};
            if (delta.content) {
                let newText = delta.content;
                if (newText.startsWith(fullContent)) {
                    newText = newText.substring(fullContent.length);
                }
                fullContent = delta.content;
                if (newText) {
                    // Check for thinking blocks
                    if (newText.includes("<think>") || newText.includes("</think>")) {
                        // Simple parsing for thinking blocks
                        const parts = newText.split(/<\/?think>/g);
                        for (let i = 0; i < parts.length; i++) {
                            if (parts[i]) {
                                if (i % 2 === 0) {
                                    // Outside thinking block
                                    yield {
                                        type: "text",
                                        text: parts[i],
                                    };
                                }
                                else {
                                    // Inside thinking block
                                    yield {
                                        type: "reasoning",
                                        text: parts[i],
                                    };
                                }
                            }
                        }
                    }
                    else {
                        yield {
                            type: "text",
                            text: newText,
                        };
                    }
                }
            }
            if ("reasoning_content" in delta && delta.reasoning_content) {
                yield {
                    type: "reasoning",
                    text: delta.reasoning_content || "",
                };
            }
            if (apiChunk.usage) {
                yield {
                    type: "usage",
                    inputTokens: apiChunk.usage.prompt_tokens || 0,
                    outputTokens: apiChunk.usage.completion_tokens || 0,
                };
            }
        }
    }
    getModel() {
        const id = this.options.apiModelId ?? qwenCodeDefaultModelId;
        const info = qwenCodeModels[id] || qwenCodeModels[qwenCodeDefaultModelId];
        return { id, info };
    }
    async completePrompt(prompt) {
        await this.ensureAuthenticated();
        const client = this.ensureClient();
        const model = this.getModel();
        const requestOptions = {
            model: model.id,
            messages: [{ role: "user", content: prompt }],
            max_completion_tokens: model.info.maxTokens,
        };
        const response = await this.callApiWithRetry(() => client.chat.completions.create(requestOptions));
        return response.choices[0]?.message.content || "";
    }
}
//# sourceMappingURL=qwen-code.js.map