import { fireEvent, render, screen } from "@/utils/test-utils"

import BottomControls from "../BottomControls"
import { vscode } from "@/utils/vscode"

const translations: Record<string, string> = {
	"common:outerGate.title": "Outer Gates",
	"common:chatsHub.title": "Chats Hub",
	"common:brainstorm.title": "Brainstorm Hub",
	"common:fileCabinet.title": "File Cabinet",
	"common:workforceHub.title": "Workforce Hub",
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
		const chatsHubButton = screen.getByRole("button", { name: "Chats Hub" })
		const brainstormButton = screen.getByRole("button", { name: "Brainstorm Hub" })
		const fileCabinetButton = screen.getByRole("button", { name: "File Cabinet" })
		const workforceHubButton = screen.getByRole("button", { name: "Workforce Hub" })
		const actionHubButton = screen.getByRole("button", { name: "Action Items Hub" })

		expect(outerGateButton).toBeInTheDocument()
		expect(chatsHubButton).toBeInTheDocument()
		expect(brainstormButton).toBeInTheDocument()
		expect(fileCabinetButton).toBeInTheDocument()
		expect(workforceHubButton).toBeInTheDocument()
		expect(actionHubButton).toBeInTheDocument()
		expect(outerGateButton.getAttribute("aria-label")).toBe("Outer Gates")
		expect(chatsHubButton.getAttribute("aria-label")).toBe("Chats Hub")
		expect(brainstormButton.getAttribute("aria-label")).toBe("Brainstorm Hub")
		expect(fileCabinetButton.getAttribute("aria-label")).toBe("File Cabinet")
		expect(workforceHubButton.getAttribute("aria-label")).toBe("Workforce Hub")
		expect(actionHubButton.getAttribute("aria-label")).toBe("Action Items Hub")
		expect(outerGateButton.nextElementSibling).toBe(chatsHubButton)
		expect(chatsHubButton.nextElementSibling).toBe(brainstormButton)
		expect(brainstormButton.nextElementSibling).toBe(fileCabinetButton)
		expect(fileCabinetButton.nextElementSibling).toBe(workforceHubButton)
		expect(workforceHubButton.nextElementSibling).toBe(actionHubButton)
	})

	it("requests Chats Hub navigation on click", () => {
		render(<BottomControls />)
		const chatsHubButton = screen.getByRole("button", { name: "Chats Hub" })
		const postMessageSpy = vi.spyOn(window, "postMessage")

		fireEvent.click(chatsHubButton)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "action",
			action: "switchTab",
			tab: "chatsHub",
		})
		expect(postMessageSpy).toHaveBeenCalledWith({ type: "action", action: "switchTab", tab: "chatsHub" }, "*")

		postMessageSpy.mockRestore()
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

	it("requests Workforce Hub navigation on click", () => {
		render(<BottomControls />)
		const workforceHubButton = screen.getByRole("button", { name: "Workforce Hub" })
		const postMessageSpy = vi.spyOn(window, "postMessage")

		fireEvent.click(workforceHubButton)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "action",
			action: "switchTab",
			tab: "workforceHub",
		})
		expect(postMessageSpy).toHaveBeenCalledWith({ type: "action", action: "switchTab", tab: "workforceHub" }, "*")

		postMessageSpy.mockRestore()
	})

	it("requests File Cabinet navigation on click", () => {
		render(<BottomControls />)
		const fileCabinetButton = screen.getByRole("button", { name: "File Cabinet" })
		const postMessageSpy = vi.spyOn(window, "postMessage")

		fireEvent.click(fileCabinetButton)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "action",
			action: "switchTab",
			tab: "fileCabinet",
		})
		expect(postMessageSpy).toHaveBeenCalledWith({ type: "action", action: "switchTab", tab: "fileCabinet" }, "*")

		postMessageSpy.mockRestore()
	})

})
