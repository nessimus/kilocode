import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"

import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

const templates = [
	{ id: "idea", name: "Idea", description: "Capture a new concept to explore.", searchValue: "Idea" },
	{ id: "note-sheet", name: "Note sheet", description: "Create a rich sheet.", searchValue: "Note sheet" },
]

describe("Brainstorm node menu", () => {
	it("shows multiple idea templates", () => {
		render(
			<Command value="" onValueChange={() => {}}>
				<CommandInput value="" onValueChange={() => {}} />
				<CommandList>
					<CommandGroup heading="Ideas">
						{templates.map((template) => (
							<CommandItem key={template.id} value={template.searchValue}>
								{template.name}
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</Command>,
		)

		expect(screen.getByText("Idea")).toBeInTheDocument()
		expect(screen.getByText("Note sheet")).toBeInTheDocument()
	})
})
