import { fireEvent, render, screen } from "@/utils/test-utils"

import BottomControls from "../BottomControls"
import { vscode } from "@/utils/vscode"

const translations: Record<string, string> = {
	"common:outerGate.title": "Outer Gates",
	"common:hub.title": "Agent Hub",
	"common:brainstorm.title": "Brainstorm Hub",
	"common:actionHub.title": "Action Items Hub",
	"common:feedback.title": "Feedback",
}

vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: { defaultValue?: string }) => translations[key] ?? options?.defaultValue ?? key,
	}),
}))

vi.mock("../rules/KiloRulesToggleModal", () => ({
	__esModule: true,
	default: () => <div data-testid="rules-toggle" />,
}))

vi.mock("../BottomApiConfig", () => ({
	BottomApiConfig: () => <div data-testid="bottom-api-config" />,
}))

describe("BottomControls", () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it("renders navigation buttons with accessible labels and ordering", () => {
		render(<BottomControls />)

		const outerGateButton = screen.getByRole("button", { name: "Outer Gates" })
		const agentButton = screen.getByRole("button", { name: "Agent Hub" })
		const brainstormButton = screen.getByRole("button", { name: "Brainstorm Hub" })
		const actionHubButton = screen.getByRole("button", { name: "Action Items Hub" })

		expect(outerGateButton).toBeInTheDocument()
		expect(agentButton).toBeInTheDocument()
		expect(brainstormButton).toBeInTheDocument()
		expect(actionHubButton).toBeInTheDocument()
		expect(outerGateButton.getAttribute("aria-label")).toBe("Outer Gates")
		expect(agentButton.getAttribute("aria-label")).toBe("Agent Hub")
		expect(brainstormButton.getAttribute("aria-label")).toBe("Brainstorm Hub")
		expect(actionHubButton.getAttribute("aria-label")).toBe("Action Items Hub")
		expect(outerGateButton.nextElementSibling).toBe(agentButton)
		expect(agentButton.nextElementSibling).toBe(brainstormButton)
		expect(brainstormButton.nextElementSibling).toBe(actionHubButton)
	})

	it("requests Brainstorm Hub navigation on click", () => {
		render(<BottomControls />)
		const brainstormButton = screen.getByRole("button", { name: "Brainstorm Hub" })
		const postMessageSpy = vi.spyOn(window, "postMessage")

		fireEvent.click(brainstormButton)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "action",
			action: "switchTab",
			tab: "brainstorm",
		})
		expect(postMessageSpy).toHaveBeenCalledWith({ type: "action", action: "switchTab", tab: "brainstorm" }, "*")

		postMessageSpy.mockRestore()
	})

	it("requests Action Items Hub navigation on click", () => {
		render(<BottomControls />)
		const actionHubButton = screen.getByRole("button", { name: "Action Items Hub" })
		const postMessageSpy = vi.spyOn(window, "postMessage")

		fireEvent.click(actionHubButton)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "action",
			action: "switchTab",
			tab: "workspace",
		})
		expect(postMessageSpy).toHaveBeenCalledWith({ type: "action", action: "switchTab", tab: "workspace" }, "*")

		postMessageSpy.mockRestore()
	})
})
