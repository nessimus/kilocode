import * as fs from "fs/promises";
import * as path from "path";
import { TimeoutError, connect } from "puppeteer-core";
// @ts-ignore
import PCR from "puppeteer-chromium-resolver";
import pWaitFor from "p-wait-for";
import delay from "delay";
import { fileExistsAtPath } from "../../utils/fs";
import { discoverChromeHostUrl, tryChromeHostUrl } from "./browserDiscovery";
import { randomUUID } from "crypto";
// Timeout constants
const BROWSER_NAVIGATION_TIMEOUT = 15_000; // 15 seconds
export class BrowserSession {
    context;
    browser;
    page;
    currentMousePosition;
    lastConnectionAttempt;
    isUsingRemoteBrowser = false;
    screencastSession;
    isStreaming = false;
    streamSubscribers = new Set();
    sessionId;
    lastStreamFrameTs = 0;
    constructor(context) {
        this.context = context;
    }
    onStreamFrame(callback) {
        this.streamSubscribers.add(callback);
        return () => {
            this.streamSubscribers.delete(callback);
        };
    }
    emitStreamFrame(frame) {
        for (const subscriber of this.streamSubscribers) {
            try {
                subscriber(frame);
            }
            catch (error) {
                console.error("Error emitting browser stream frame:", error);
            }
        }
    }
    ensureSessionId() {
        if (!this.sessionId) {
            this.sessionId = randomUUID();
        }
        return this.sessionId;
    }
    async startStreaming(page) {
        try {
            if (this.isStreaming && this.page === page) {
                return;
            }
            await this.stopStreaming({ notify: false });
            this.lastStreamFrameTs = 0;
            const client = await page.target().createCDPSession();
            this.screencastSession = client;
            const { width, height } = this.getViewport();
            const quality = (await this.context.globalState.get("screenshotQuality")) ?? 75;
            const format = "jpeg";
            const sessionId = this.ensureSessionId();
            client.on("Page.screencastFrame", async (event) => {
                const now = Date.now();
                try {
                    if (now - this.lastStreamFrameTs >= 200) {
                        this.lastStreamFrameTs = now;
                        const screenshot = `data:image/${format};base64,${event.data}`;
                        this.emitStreamFrame({
                            sessionId,
                            screenshot,
                            url: this.page?.url(),
                            mousePosition: this.currentMousePosition,
                            timestamp: now,
                        });
                    }
                }
                finally {
                    try {
                        await client.send("Page.screencastFrameAck", { sessionId: event.sessionId });
                    }
                    catch (ackError) {
                        console.error("Failed to ack screencast frame:", ackError);
                    }
                }
            });
            await client.send("Page.startScreencast", {
                format,
                quality,
                maxWidth: width,
                maxHeight: height,
                everyNthFrame: 1,
            });
            this.isStreaming = true;
        }
        catch (error) {
            console.error("Failed to start browser screencast:", error);
        }
    }
    async stopStreaming(options = { notify: true }) {
        if (!this.isStreaming && !this.screencastSession) {
            return;
        }
        try {
            await this.screencastSession?.send("Page.stopScreencast");
        }
        catch (error) {
            console.error("Failed to stop browser screencast:", error);
        }
        try {
            await this.screencastSession?.detach?.();
        }
        catch (error) {
            console.error("Failed to detach screencast session:", error);
        }
        this.screencastSession = undefined;
        this.isStreaming = false;
        this.lastStreamFrameTs = 0;
        if (options.notify !== false) {
            const sessionId = this.sessionId;
            if (sessionId) {
                this.emitStreamFrame({ sessionId, timestamp: Date.now(), ended: true });
            }
        }
    }
    async setActivePage(page) {
        this.page = page;
        try {
            const viewport = this.getViewport();
            await page.setViewport(viewport);
        }
        catch (error) {
            console.warn("Failed to set viewport on page:", error);
        }
        await this.startStreaming(page);
    }
    async ensureChromiumExists() {
        const globalStoragePath = this.context?.globalStorageUri?.fsPath;
        if (!globalStoragePath) {
            throw new Error("Global storage uri is invalid");
        }
        const puppeteerDir = path.join(globalStoragePath, "puppeteer");
        const dirExists = await fileExistsAtPath(puppeteerDir);
        if (!dirExists) {
            await fs.mkdir(puppeteerDir, { recursive: true });
        }
        // if chromium doesn't exist, this will download it to path.join(puppeteerDir, ".chromium-browser-snapshots")
        // if it does exist it will return the path to existing chromium
        const stats = await PCR({
            downloadPath: puppeteerDir,
        });
        return stats;
    }
    /**
     * Gets the viewport size from global state or returns default
     */
    getViewport() {
        const size = this.context.globalState.get("browserViewportSize") || "900x600";
        const [width, height] = size.split("x").map(Number);
        return { width, height };
    }
    /**
     * Launches a local browser instance
     */
    async launchLocalBrowser() {
        console.log("Launching local browser");
        const stats = await this.ensureChromiumExists();
        this.browser = await stats.puppeteer.launch({
            args: [
                "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            ],
            executablePath: stats.executablePath,
            defaultViewport: this.getViewport(),
            // headless: false,
        });
        this.isUsingRemoteBrowser = false;
    }
    /**
     * Connects to a browser using a WebSocket URL
     */
    async connectWithChromeHostUrl(chromeHostUrl) {
        try {
            this.browser = await connect({
                browserURL: chromeHostUrl,
                defaultViewport: this.getViewport(),
            });
            // Cache the successful endpoint
            console.log(`Connected to remote browser at ${chromeHostUrl}`);
            this.context.globalState.update("cachedChromeHostUrl", chromeHostUrl);
            this.lastConnectionAttempt = Date.now();
            this.isUsingRemoteBrowser = true;
            return true;
        }
        catch (error) {
            console.log(`Failed to connect using WebSocket endpoint: ${error}`);
            return false;
        }
    }
    /**
     * Attempts to connect to a remote browser using various methods
     * Returns true if connection was successful, false otherwise
     */
    async connectToRemoteBrowser() {
        let remoteBrowserHost = this.context.globalState.get("remoteBrowserHost");
        let reconnectionAttempted = false;
        // Try to connect with cached endpoint first if it exists and is recent (less than 1 hour old)
        const cachedChromeHostUrl = this.context.globalState.get("cachedChromeHostUrl");
        if (cachedChromeHostUrl && this.lastConnectionAttempt && Date.now() - this.lastConnectionAttempt < 3_600_000) {
            console.log(`Attempting to connect using cached Chrome Host Url: ${cachedChromeHostUrl}`);
            if (await this.connectWithChromeHostUrl(cachedChromeHostUrl)) {
                return true;
            }
            console.log(`Failed to connect using cached Chrome Host Url: ${cachedChromeHostUrl}`);
            // Clear the cached endpoint since it's no longer valid
            this.context.globalState.update("cachedChromeHostUrl", undefined);
            // User wants to give up after one reconnection attempt
            if (remoteBrowserHost) {
                reconnectionAttempted = true;
            }
        }
        // If user provided a remote browser host, try to connect to it
        else if (remoteBrowserHost && !reconnectionAttempted) {
            console.log(`Attempting to connect to remote browser at ${remoteBrowserHost}`);
            try {
                const hostIsValid = await tryChromeHostUrl(remoteBrowserHost);
                if (!hostIsValid) {
                    throw new Error("Could not find chromeHostUrl in the response");
                }
                console.log(`Found WebSocket endpoint: ${remoteBrowserHost}`);
                if (await this.connectWithChromeHostUrl(remoteBrowserHost)) {
                    return true;
                }
            }
            catch (error) {
                console.error(`Failed to connect to remote browser: ${error}`);
                // Fall back to auto-discovery if remote connection fails
            }
        }
        try {
            console.log("Attempting browser auto-discovery...");
            const chromeHostUrl = await discoverChromeHostUrl();
            if (chromeHostUrl && (await this.connectWithChromeHostUrl(chromeHostUrl))) {
                return true;
            }
        }
        catch (error) {
            console.error(`Auto-discovery failed: ${error}`);
            // Fall back to local browser if auto-discovery fails
        }
        return false;
    }
    async launchBrowser() {
        console.log("launch browser called");
        // Check if remote browser connection is enabled
        const remoteBrowserEnabled = this.context.globalState.get("remoteBrowserEnabled");
        if (!remoteBrowserEnabled) {
            console.log("Launching local browser");
            if (this.browser) {
                // throw new Error("Browser already launched")
                await this.closeBrowser(); // this may happen when the model launches a browser again after having used it already before
            }
            else {
                // If browser wasn't open, just reset the state
                this.resetBrowserState();
            }
            await this.launchLocalBrowser();
        }
        else {
            console.log("Connecting to remote browser");
            // Remote browser connection is enabled
            const remoteConnected = await this.connectToRemoteBrowser();
            // If all remote connection attempts fail, fall back to local browser
            if (!remoteConnected) {
                console.log("Falling back to local browser");
                await this.launchLocalBrowser();
            }
        }
    }
    /**
     * Closes the browser and resets browser state
     */
    async closeBrowser() {
        const sessionId = this.sessionId;
        if (this.browser || this.page) {
            console.log("closing browser...");
            await this.stopStreaming();
            if (this.isUsingRemoteBrowser && this.browser) {
                await this.browser.disconnect().catch(() => { });
            }
            else {
                await this.browser?.close().catch(() => { });
            }
            this.resetBrowserState();
        }
        return { sessionId };
    }
    /**
     * Resets all browser state variables
     */
    resetBrowserState() {
        this.stopStreaming({ notify: false }).catch(() => { });
        this.browser = undefined;
        this.page = undefined;
        this.currentMousePosition = undefined;
        this.isUsingRemoteBrowser = false;
        this.screencastSession = undefined;
        this.isStreaming = false;
        this.sessionId = undefined;
    }
    async doAction(action) {
        if (!this.page) {
            throw new Error("Browser is not launched. This may occur if the browser was automatically closed by a non-`browser_action` tool.");
        }
        const logs = [];
        let lastLogTs = Date.now();
        const consoleListener = (msg) => {
            if (msg.type() === "log") {
                logs.push(msg.text());
            }
            else {
                logs.push(`[${msg.type()}] ${msg.text()}`);
            }
            lastLogTs = Date.now();
        };
        const errorListener = (err) => {
            logs.push(`[Page Error] ${err.toString()}`);
            lastLogTs = Date.now();
        };
        // Add the listeners
        this.page.on("console", consoleListener);
        this.page.on("pageerror", errorListener);
        try {
            await action(this.page);
        }
        catch (err) {
            if (!(err instanceof TimeoutError)) {
                logs.push(`[Error] ${err.toString()}`);
            }
        }
        // Wait for console inactivity, with a timeout
        await pWaitFor(() => Date.now() - lastLogTs >= 500, {
            timeout: 3_000,
            interval: 100,
        }).catch(() => { });
        let options = {
            encoding: "base64",
            // clip: {
            // 	x: 0,
            // 	y: 0,
            // 	width: 900,
            // 	height: 600,
            // },
        };
        let screenshotBase64 = await this.page.screenshot({
            ...options,
            type: "webp",
            quality: (await this.context.globalState.get("screenshotQuality")) ?? 75,
        });
        let screenshot = `data:image/webp;base64,${screenshotBase64}`;
        if (!screenshotBase64) {
            console.log("webp screenshot failed, trying png");
            screenshotBase64 = await this.page.screenshot({
                ...options,
                type: "png",
            });
            screenshot = `data:image/png;base64,${screenshotBase64}`;
        }
        if (!screenshotBase64) {
            throw new Error("Failed to take screenshot.");
        }
        // this.page.removeAllListeners() <- causes the page to crash!
        this.page.off("console", consoleListener);
        this.page.off("pageerror", errorListener);
        return {
            screenshot,
            logs: logs.join("\n"),
            currentUrl: this.page.url(),
            currentMousePosition: this.currentMousePosition,
            sessionId: this.ensureSessionId(),
        };
    }
    /**
     * Extract the root domain from a URL
     * e.g., http://localhost:3000/path -> localhost:3000
     * e.g., https://example.com/path -> example.com
     */
    getRootDomain(url) {
        try {
            const urlObj = new URL(url);
            // Remove www. prefix if present
            return urlObj.host.replace(/^www\./, "");
        }
        catch (error) {
            // If URL parsing fails, return the original URL
            return url;
        }
    }
    /**
     * Navigate to a URL with standard loading options
     */
    async navigatePageToUrl(page, url) {
        await page.goto(url, { timeout: BROWSER_NAVIGATION_TIMEOUT, waitUntil: ["domcontentloaded", "networkidle2"] });
        await this.waitTillHTMLStable(page);
    }
    /**
     * Creates a new tab and navigates to the specified URL
     */
    async createNewTab(url) {
        if (!this.browser) {
            throw new Error("Browser is not launched");
        }
        // Create a new page
        const newPage = await this.browser.newPage();
        // Set the new page as the active page
        await this.setActivePage(newPage);
        // Navigate to the URL
        const result = await this.doAction(async (page) => {
            await this.navigatePageToUrl(page, url);
        });
        return result;
    }
    async navigateToUrl(url) {
        if (!this.browser) {
            throw new Error("Browser is not launched");
        }
        // Remove trailing slash for comparison
        const normalizedNewUrl = url.replace(/\/$/, "");
        // Extract the root domain from the URL
        const rootDomain = this.getRootDomain(normalizedNewUrl);
        // Get all current pages
        const pages = await this.browser.pages();
        // Try to find a page with the same root domain
        let existingPage;
        for (const page of pages) {
            try {
                const pageUrl = page.url();
                if (pageUrl && this.getRootDomain(pageUrl) === rootDomain) {
                    existingPage = page;
                    break;
                }
            }
            catch (error) {
                // Skip pages that might have been closed or have errors
                console.log(`Error checking page URL: ${error}`);
                continue;
            }
        }
        if (existingPage) {
            // Tab with the same root domain exists, switch to it
            console.log(`Tab with domain ${rootDomain} already exists, switching to it`);
            // Update the active page
            await this.setActivePage(existingPage);
            existingPage.bringToFront();
            // Navigate to the new URL if it's different]
            const currentUrl = existingPage.url().replace(/\/$/, ""); // Remove trailing / if present
            if (this.getRootDomain(currentUrl) === rootDomain && currentUrl !== normalizedNewUrl) {
                console.log(`Navigating to new URL: ${normalizedNewUrl}`);
                console.log(`Current URL: ${currentUrl}`);
                console.log(`Root domain: ${this.getRootDomain(currentUrl)}`);
                console.log(`New URL: ${normalizedNewUrl}`);
                // Navigate to the new URL
                return this.doAction(async (page) => {
                    await this.navigatePageToUrl(page, normalizedNewUrl);
                });
            }
            else {
                console.log(`Tab with domain ${rootDomain} already exists, and URL is the same: ${normalizedNewUrl}`);
                // URL is the same, just reload the page to ensure it's up to date
                console.log(`Reloading page: ${normalizedNewUrl}`);
                console.log(`Current URL: ${currentUrl}`);
                console.log(`Root domain: ${this.getRootDomain(currentUrl)}`);
                console.log(`New URL: ${normalizedNewUrl}`);
                return this.doAction(async (page) => {
                    await page.reload({
                        timeout: BROWSER_NAVIGATION_TIMEOUT,
                        waitUntil: ["domcontentloaded", "networkidle2"],
                    });
                    await this.waitTillHTMLStable(page);
                });
            }
        }
        else {
            // No tab with this root domain exists, create a new one
            console.log(`No tab with domain ${rootDomain} exists, creating a new one`);
            return this.createNewTab(normalizedNewUrl);
        }
    }
    // page.goto { waitUntil: "networkidle0" } may not ever resolve, and not waiting could return page content too early before js has loaded
    // https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded/61304202#61304202
    async waitTillHTMLStable(page, timeout = 5_000) {
        const checkDurationMsecs = 500; // 1000
        const maxChecks = timeout / checkDurationMsecs;
        let lastHTMLSize = 0;
        let checkCounts = 1;
        let countStableSizeIterations = 0;
        const minStableSizeIterations = 3;
        while (checkCounts++ <= maxChecks) {
            let html = await page.content();
            let currentHTMLSize = html.length;
            // let bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length)
            console.log("last: ", lastHTMLSize, " <> curr: ", currentHTMLSize);
            if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
                countStableSizeIterations++;
            }
            else {
                countStableSizeIterations = 0; //reset the counter
            }
            if (countStableSizeIterations >= minStableSizeIterations) {
                console.log("Page rendered fully...");
                break;
            }
            lastHTMLSize = currentHTMLSize;
            await delay(checkDurationMsecs);
        }
    }
    /**
     * Handles mouse interaction with network activity monitoring
     */
    async handleMouseInteraction(page, coordinate, action) {
        const [x, y] = coordinate.split(",").map(Number);
        // Set up network request monitoring
        let hasNetworkActivity = false;
        const requestListener = () => {
            hasNetworkActivity = true;
        };
        page.on("request", requestListener);
        // Perform the mouse action
        await action(x, y);
        this.currentMousePosition = coordinate;
        // Small delay to check if action triggered any network activity
        await delay(100);
        if (hasNetworkActivity) {
            // If we detected network activity, wait for navigation/loading
            await page
                .waitForNavigation({
                waitUntil: ["domcontentloaded", "networkidle2"],
                timeout: BROWSER_NAVIGATION_TIMEOUT,
            })
                .catch(() => { });
            await this.waitTillHTMLStable(page);
        }
        // Clean up listener
        page.off("request", requestListener);
    }
    async click(coordinate) {
        return this.doAction(async (page) => {
            await this.handleMouseInteraction(page, coordinate, async (x, y) => {
                await page.mouse.click(x, y);
            });
        });
    }
    async type(text) {
        return this.doAction(async (page) => {
            await page.keyboard.type(text);
        });
    }
    /**
     * Scrolls the page by the specified amount
     */
    async scrollPage(page, direction) {
        const { height } = this.getViewport();
        const scrollAmount = direction === "down" ? height : -height;
        await page.evaluate((scrollHeight) => {
            window.scrollBy({
                top: scrollHeight,
                behavior: "auto",
            });
        }, scrollAmount);
        await delay(300);
    }
    async scrollDown() {
        return this.doAction(async (page) => {
            await this.scrollPage(page, "down");
        });
    }
    async scrollUp() {
        return this.doAction(async (page) => {
            await this.scrollPage(page, "up");
        });
    }
    async hover(coordinate) {
        return this.doAction(async (page) => {
            await this.handleMouseInteraction(page, coordinate, async (x, y) => {
                await page.mouse.move(x, y);
                // Small delay to allow any hover effects to appear
                await delay(300);
            });
        });
    }
    async resize(size) {
        return this.doAction(async (page) => {
            const [width, height] = size.split(",").map(Number);
            const session = await page.createCDPSession();
            await page.setViewport({ width, height });
            const { windowId } = await session.send("Browser.getWindowForTarget");
            await session.send("Browser.setWindowBounds", {
                bounds: { width, height },
                windowId,
            });
        });
    }
}
//# sourceMappingURL=BrowserSession.js.map