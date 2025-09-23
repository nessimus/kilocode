import React from "react"
import { render } from "@/utils/test-utils"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { ChatRowContent } from "../ChatRow"

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"chat:slashCommand.wantsToRun": "Roo wants to load an SOP:",
				"chat:slashCommand.didRun": "Roo loaded an SOP:",
				"common:description": "Description",
			}
			return translations[key] || key
		},
	}),
	Trans: ({ i18nKey, children }: { i18nKey: string; children?: React.ReactNode }) => {
		return <>{children || i18nKey}</>
	},
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

// Mock VSCodeBadge
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeBadge: ({ children, ...props }: { children: React.ReactNode }) => <span {...props}>{children}</span>,
}))

const queryClient = new QueryClient()

const renderChatRowWithProviders = (message: any, isExpanded = false) => {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatRowContent
					message={message}
					isExpanded={isExpanded}
					isLast={false}
					isStreaming={false}
					onToggleExpand={mockOnToggleExpand}
					onSuggestionClick={mockOnSuggestionClick}
					onBatchFileResponse={mockOnBatchFileResponse}
					onFollowUpUnmount={mockOnFollowUpUnmount}
					isFollowUpAnswered={false}
				/>
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

const mockOnToggleExpand = vi.fn()
const mockOnSuggestionClick = vi.fn()
const mockOnBatchFileResponse = vi.fn()
const mockOnFollowUpUnmount = vi.fn()

describe("ChatRow - runSlashCommand tool", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should display runSlashCommand ask message with SOP metadata", () => {
		const message: any = {
			type: "ask",
			ask: "tool",
			ts: Date.now(),
			text: JSON.stringify({
				tool: "runSlashCommand",
				command: "init",
				displayName: "init",
				sop_variant: "document",
				source: "built-in",
			}),
			partial: false,
		}

		const { getByText } = renderChatRowWithProviders(message)

		expect(getByText("Roo wants to load an SOP:")).toBeInTheDocument()
		expect(getByText("init")).toBeInTheDocument()
		expect(getByText("Document SOP")).toBeInTheDocument()
		expect(getByText("built-in")).toBeInTheDocument()
	})

	it("should display runSlashCommand ask message with command and args", () => {
		const message: any = {
			type: "ask",
			ask: "tool",
			ts: Date.now(),
			text: JSON.stringify({
				tool: "runSlashCommand",
				command: "test",
				args: "focus on unit tests",
				description: "Run project tests",
				source: "project",
				displayName: "test",
				argumentHint: "test type or focus area",
				sop_variant: "document",
				filePath: ".roo/commands/test.md",
			}),
			partial: false,
		}

		const { getByText } = renderChatRowWithProviders(message, true) // Pass true to expand

		expect(getByText("Roo wants to load an SOP:")).toBeInTheDocument()
		expect(getByText("test")).toBeInTheDocument()
		expect(getByText("Document SOP")).toBeInTheDocument()
		expect(getByText("project")).toBeInTheDocument()
		expect(getByText("/test")).toBeInTheDocument()
		expect(getByText("Usage hint:")).toBeInTheDocument()
		expect(getByText("test type or focus area")).toBeInTheDocument()
		expect(getByText("Context:")).toBeInTheDocument()
		expect(getByText("focus on unit tests")).toBeInTheDocument()
		expect(getByText("Description:")).toBeInTheDocument()
		expect(getByText("Run project tests")).toBeInTheDocument()
		expect(getByText("Path:")).toBeInTheDocument()
		expect(getByText(".roo/commands/test.md")).toBeInTheDocument()
	})

	it("should display runSlashCommand say message", () => {
		const message: any = {
			type: "say",
			say: "tool",
			ts: Date.now(),
			text: JSON.stringify({
				tool: "runSlashCommand",
				command: "deploy",
				source: "global",
				displayName: "deploy",
				sop_variant: "document",
			}),
			partial: false,
		}

		const { getByText } = renderChatRowWithProviders(message)

		expect(getByText("Roo loaded an SOP:")).toBeInTheDocument()
		expect(getByText("deploy")).toBeInTheDocument()
		expect(getByText("Document SOP")).toBeInTheDocument()
		expect(getByText("global")).toBeInTheDocument()
	})

	it("should display upsertSop summary", () => {
		const message: any = {
			type: "say",
			say: "tool",
			ts: Date.now(),
			text: JSON.stringify({
				tool: "upsertSop",
				sop_name: "Release Checklist",
				sop_variant: "document",
				sop_scope: "project",
				target_path: "/workspace/.kilocode/sops/release-checklist.md",
			}),
			partial: false,
		}

		const { getByText } = renderChatRowWithProviders(message)

		expect(getByText("Created SOP")).toBeInTheDocument()
		expect(getByText("Release Checklist")).toBeInTheDocument()
		expect(getByText("Document")).toBeInTheDocument()
		expect(getByText("project")).toBeInTheDocument()
		expect(getByText("/workspace/.kilocode/sops/release-checklist.md")).toBeInTheDocument()
	})
})
