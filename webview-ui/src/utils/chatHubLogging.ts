const CHAT_HUB_LOG_PREFIX = "[ChatHubInvestigate]"

const isChatHubDebugEnabled =
	(typeof globalThis !== "undefined" &&
		(globalThis as Record<string, unknown>).process?.env?.CHAT_HUB_DEBUG === "true") ||
	(typeof import.meta !== "undefined" && (import.meta as Record<string, any>).env?.VITE_CHAT_HUB_DEBUG === "true")

const formatArgsWithPrefix = (args: unknown[]): unknown[] => {
	if (args.length === 0) {
		return [CHAT_HUB_LOG_PREFIX]
	}
	if (typeof args[0] === "string" && args[0].startsWith(CHAT_HUB_LOG_PREFIX)) {
		return args
	}
	return [CHAT_HUB_LOG_PREFIX, ...args]
}

const safeSerialize = (value: unknown) => {
	if (typeof value === "string") {
		return value
	}
	try {
		return JSON.stringify(value, (_key, nested) => {
			if (typeof nested === "bigint") {
				return Number(nested)
			}
			if (nested instanceof Map) {
				return {
					type: "Map",
					entries: Array.from(nested.entries()),
				}
			}
			if (nested instanceof Set) {
				return {
					type: "Set",
					values: Array.from(nested.values()),
				}
			}
			return nested
		})
	} catch (_error) {
		return String(value)
	}
}

const computeLogKey = (args: unknown[]) => args.map((arg) => safeSerialize(arg)).join("|")

let lastLogKey: string | undefined
let repeatCount = 0

const flushRepeats = () => {
	if (!isChatHubDebugEnabled) {
		return
	}
	if (repeatCount > 0 && lastLogKey) {
		console.log(...formatArgsWithPrefix(["repeat", { count: repeatCount }]))
		repeatCount = 0
	}
}

export const chatHubDebugLog = (...args: unknown[]) => {
	if (!isChatHubDebugEnabled) {
		return
	}
	const key = computeLogKey(args)
	if (key === lastLogKey) {
		repeatCount += 1
		return
	}
	flushRepeats()
	lastLogKey = key
	console.log(...formatArgsWithPrefix(args))
}

export const chatHubDebugWarn = (...args: unknown[]) => {
	if (!isChatHubDebugEnabled) {
		return
	}
	const key = computeLogKey(["warn", ...args])
	if (key === lastLogKey) {
		repeatCount += 1
		return
	}
	flushRepeats()
	lastLogKey = key
	console.warn(...formatArgsWithPrefix(args))
}

if (typeof window !== "undefined") {
	window.addEventListener("beforeunload", flushRepeats)
}

export { CHAT_HUB_LOG_PREFIX, isChatHubDebugEnabled }
