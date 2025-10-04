import { Anthropic } from "@anthropic-ai/sdk"

import { buildApiHandler } from "../../api"
import type { HubParticipant, HubRoom, HubMessage } from "../../shared/hub"
import { ClineProvider } from "../webview/ClineProvider"
import type { ClineProviderState } from "../webview/ClineProvider"

export interface AgentTurnContext {
	room: HubRoom
	messages: HubMessage[]
	participants: HubParticipant[]
}

export interface AgentTurnUpdate {
	content: string
	status: "streaming" | "final" | "error"
	error?: string
}

export class HubAgentSession {
	constructor(
		private readonly participant: HubParticipant,
		private readonly provider: ClineProvider,
	) {}

	get id(): string {
		return this.participant.id
	}

	get displayName(): string {
		return this.participant.displayName
	}

	private cancelRequested = false

	public requestStop(): void {
		this.cancelRequested = true
	}

	private buildSystemPrompt(context: AgentTurnContext, state: ClineProviderState): string {
		const others = context.participants.filter((p) => p.id !== this.participant.id)
		const teammateDescription = others
			.map((participant) => `- ${participant.displayName}${participant.mode ? ` (${participant.mode})` : ""}`)
			.join("\n")

		const persona = this.participant.persona
		const personaSections: string[] = []
		if (persona?.summary) {
			personaSections.push(`Role Summary for ${this.participant.displayName}: ${persona.summary}`)
		}
		if (persona?.instructions) {
			personaSections.push(
				`Role Instructions for ${this.participant.displayName} (follow carefully):\n${persona.instructions}`,
			)
		}
		if (persona?.role) {
			personaSections.push(`Official Role Title: ${persona.role}`)
		}
		if (persona?.mbtiType) {
			personaSections.push(`${this.participant.displayName}'s MBTI type: ${persona.mbtiType}`)
		}
		if (persona?.personality) {
			personaSections.push(`Personality Notes: ${persona.personality}`)
		}
		if (persona?.customAttributes && Object.keys(persona.customAttributes).length) {
			const attributes = Object.entries(persona.customAttributes)
				.map(([key, value]) => `- ${key}: ${value}`)
				.join("\n")
			personaSections.push(`Custom Attributes:\n${attributes}`)
		}

		const collaborationGuidance = `You are ${this.participant.displayName}, an AI teammate collaborating inside a live engineering hub. Work with the other agents and the human to solve problems with focus and kindness. Build on the latest messages, cite teammates by name when referencing their ideas, keep replies concise and actionable, and ask clarifying questions when needed.`

		const identityBoundary = `Respond strictly as ${this.participant.displayName}. Do not speak on behalf of other participants, do not impersonate them, and do not use phrases like "we" unless you are summarising collective agreement. Stay within your own expertise.`

		const participationGuidance = others.length
			? `The other active participants are:\n${teammateDescription}`
			: "You are currently the only autonomous agent in this space. Provide thoughtful scaffolding so the human can react or invite more perspectives."

		const autonomyGuidance = context.room.settings.autonomous
			? "Autonomous mode is ON. Continue the discussion proactively until the human intervenes or you reach a clear resolution."
			: "Autonomous mode is OFF. Provide a single high-quality response, then wait for new input before speaking again."

		const companySections: string[] = []
		const workplaceState = state.workplaceState
		if (workplaceState) {
			const activeCompany =
				workplaceState.companies.find((company) => company.id === workplaceState.activeCompanyId) ??
				workplaceState.companies[0]
			if (activeCompany) {
				const profileLines = [`Name: ${activeCompany.name}`]
				if (activeCompany.mission) {
					profileLines.push(`Mission: ${activeCompany.mission}`)
				}
				if (activeCompany.vision) {
					profileLines.push(`Vision: ${activeCompany.vision}`)
				}
				if (activeCompany.actionItems?.length) {
					profileLines.push(
						`Active Initiatives: ${activeCompany.actionItems.length} tracked objectives/projects.`,
					)
				}
				companySections.push(`Company Profile:\n${profileLines.join("\n")}`)

				const ownerProfile = activeCompany.ownerProfile ?? workplaceState.ownerProfileDefaults
				if (ownerProfile) {
					const name = ownerProfile.firstName ?? ownerProfile.name ?? "the user"
					const ownerLines = [`Preferred human partner: ${name}`]
					if (ownerProfile.role) {
						ownerLines.push(`Role: ${ownerProfile.role}`)
					}
					if (ownerProfile.personalityTraits?.length) {
						ownerLines.push(`Traits: ${ownerProfile.personalityTraits.join(", ")}`)
					}
					companySections.push(ownerLines.join("\n"))
				}

				if (persona?.employeeId) {
					const employee = activeCompany.employees.find((emp) => emp.id === persona.employeeId)
					if (employee) {
						const employeeLines = [`Internal profile for ${this.participant.displayName}:`]
						if (employee.role) employeeLines.push(`- Role: ${employee.role}`)
						if (employee.personality) employeeLines.push(`- Persona Traits: ${employee.personality}`)
						if (employee.mbtiType) employeeLines.push(`- MBTI: ${employee.mbtiType}`)
						if (employee.personalityTraits?.length)
							employeeLines.push(`- Key traits: ${employee.personalityTraits.join(", ")}`)
						companySections.push(employeeLines.join("\n"))
					}
				}
			}
		}

		return [
			collaborationGuidance,
			identityBoundary,
			participationGuidance,
			autonomyGuidance,
			...companySections,
			...personaSections,
		]
			.filter(Boolean)
			.join("\n\n")
	}

	private toMessageParams(context: AgentTurnContext): Anthropic.Messages.MessageParam[] {
		const participantMap = new Map(context.participants.map((p) => [p.id, p]))

		return context.messages.map<Anthropic.Messages.MessageParam>((message) => {
			const participant = participantMap.get(message.participantId)
			const role: Anthropic.Messages.MessageParam["role"] = participant?.type === "agent" ? "assistant" : "user"

			const prefix = participant ? `${participant.displayName}: ` : ""
			return {
				role,
				content: [
					{
						type: "text",
						text: `${prefix}${message.content}`,
					},
				],
			}
		})
	}

	async respond(context: AgentTurnContext, onUpdate: (update: AgentTurnUpdate) => void): Promise<void> {
		const state = await this.provider.getState()
		const apiConfiguration = state.apiConfiguration
		const apiHandler = buildApiHandler(apiConfiguration)
		const systemPrompt = this.buildSystemPrompt(context, state)
		const messages = this.toMessageParams(context)
		const mode = this.participant.mode || this.participant.persona?.baseModeSlug || undefined

		let accumulated = ""
		this.cancelRequested = false

		let wasCancelled = false

		try {
			const stream = apiHandler.createMessage(systemPrompt, messages, {
				mode,
				taskId: `hub-${context.room.id}-${this.participant.id}`,
				store: false,
			})

			for await (const chunk of stream) {
				if (this.cancelRequested) {
					wasCancelled = true
					break
				}

				switch (chunk.type) {
					case "text":
						accumulated += chunk.text
						onUpdate({ content: accumulated, status: "streaming" })
						break
					case "reasoning":
						// Ignore hidden reasoning tokens for now
						break
					case "grounding":
						// Grounding metadata is not surfaced in the hub yet
						break
					case "usage":
						// Usage is tracked centrally; nothing to do
						break
					case "error":
						onUpdate({ content: accumulated, status: "error", error: chunk.error || chunk.message })
						return
				}
			}

			if (!wasCancelled) {
				onUpdate({ content: accumulated.trim(), status: "final" })
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			onUpdate({ content: accumulated, status: "error", error: message })
		}

		if (this.cancelRequested) {
			const note = accumulated.trim().length ? `${accumulated.trim()}\n\n[Stopped by user]` : "[Stopped by user]"
			onUpdate({ content: note, status: "final" })
		}

		this.cancelRequested = false
	}
}
