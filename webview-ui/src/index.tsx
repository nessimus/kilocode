import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App"
import "../node_modules/@vscode/codicons/dist/codicon.css"
import "./codicon-custom.css" // kilocode_change

import { getHighlighter } from "./utils/highlighter"
import { CHAT_HUB_LOG_PREFIX } from "./utils/chatHubLogging"

type PatchedConsole = Console & { __chatHubLogFilterApplied?: boolean }

const ensureChatHubConsoleFilter = () => {
	const patchedConsole = console as PatchedConsole
	if (patchedConsole.__chatHubLogFilterApplied) {
		return
	}
	patchedConsole.__chatHubLogFilterApplied = true

	const shouldAllow = (args: unknown[]) =>
		args.some((arg) => typeof arg === "string" && arg.includes(CHAT_HUB_LOG_PREFIX))

	;(["log", "info", "debug", "warn"] as const).forEach((method) => {
		const original = console[method].bind(console)
		console[method] = (...args: unknown[]) => {
			if (shouldAllow(args)) {
				original(...args)
			}
		}
	})
}

ensureChatHubConsoleFilter()

// Initialize Shiki early to hide initialization latency (async)
getHighlighter().catch((error: Error) => console.error("Failed to initialize Shiki highlighter:", error))

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
