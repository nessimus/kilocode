import { EventEmitter } from "events"

import { v4 as uuidv4 } from "uuid"

import { QueuedMessage } from "@roo-code/types"

const CHAT_HUB_LOG_PREFIX = "[ChatHubInvestigate]"
const isChatHubDebugEnabled = process.env.CHAT_HUB_DEBUG === "true"
const debugLog = (...args: unknown[]) => {
	if (!isChatHubDebugEnabled) {
		return
	}
	if (args.length === 0) {
		console.log(CHAT_HUB_LOG_PREFIX)
		return
	}
	if (typeof args[0] === "string" && args[0].startsWith(CHAT_HUB_LOG_PREFIX)) {
		console.log(...args)
		return
	}
	console.log(CHAT_HUB_LOG_PREFIX, ...args)
}

export interface MessageQueueState {
	messages: QueuedMessage[]
	isProcessing: boolean
	isPaused: boolean
}

export interface QueueEvents {
	stateChanged: [messages: QueuedMessage[]]
}

interface AddMessageOptions {
	silent?: boolean
	clientTurnId?: string
}

export class MessageQueueService extends EventEmitter<QueueEvents> {
	private _messages: QueuedMessage[]

	constructor() {
		super()

		this._messages = []
	}

	private findMessage(id: string) {
		const index = this._messages.findIndex((msg) => msg.id === id)

		if (index === -1) {
			return { index, message: undefined }
		}

		return { index, message: this._messages[index] }
	}

	public addMessage(text: string, images?: string[], options?: AddMessageOptions): QueuedMessage | undefined {
		if (!text && !images?.length) {
			return undefined
		}

		const message: QueuedMessage = {
			timestamp: Date.now(),
			id: uuidv4(),
			text,
			images,
			silent: options?.silent,
			clientTurnId: options?.clientTurnId,
		}

		this._messages.push(message)
		this.emit("stateChanged", this._messages)
		debugLog("messageQueue.addMessage", {
			messageId: message.id,
			textPreview: text.slice(0, 80),
			imageCount: images?.length ?? 0,
			silent: options?.silent ?? false,
			clientTurnId: options?.clientTurnId,
			queueSize: this._messages.length,
		})

		return message
	}

	public removeMessage(id: string): boolean {
		const { index, message } = this.findMessage(id)

		if (!message) {
			debugLog("messageQueue.removeMessage.miss", {
				messageId: id,
				queueSize: this._messages.length,
			})
			return false
		}

		this._messages.splice(index, 1)
		this.emit("stateChanged", this._messages)
		debugLog("messageQueue.removeMessage", {
			messageId: id,
			queueSize: this._messages.length,
			clientTurnId: message.clientTurnId,
		})
		return true
	}

	public updateMessage(id: string, text: string, images?: string[]): boolean {
		const { message } = this.findMessage(id)

		if (!message) {
			debugLog("messageQueue.updateMessage.miss", {
				messageId: id,
				queueSize: this._messages.length,
			})
			return false
		}

		message.timestamp = Date.now()
		message.text = text
		message.images = images
		this.emit("stateChanged", this._messages)
		debugLog("messageQueue.updateMessage", {
			messageId: id,
			textPreview: text.slice(0, 80),
			imageCount: images?.length ?? 0,
			queueSize: this._messages.length,
			clientTurnId: message.clientTurnId,
		})
		return true
	}

	public dequeueMessage(): QueuedMessage | undefined {
		const message = this._messages.shift()
		this.emit("stateChanged", this._messages)
		debugLog("messageQueue.dequeueMessage", {
			dequeuedId: message?.id,
			queueSize: this._messages.length,
			clientTurnId: message?.clientTurnId,
		})
		return message
	}

	public get messages(): QueuedMessage[] {
		return this._messages
	}

	public isEmpty(): boolean {
		return this._messages.length === 0
	}

	public dispose(): void {
		this._messages = []
		this.removeAllListeners()
		debugLog("messageQueue.dispose", { queueSize: this._messages.length })
	}
}
