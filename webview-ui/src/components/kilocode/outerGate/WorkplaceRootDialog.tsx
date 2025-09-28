import React, { useEffect, useMemo, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useExtensionState } from "@/context/ExtensionStateContext"

interface WorkplaceRootDialogProps {
	open: boolean
	onDismiss?: () => void
}

const formatFolderName = (ownerName?: string): string => {
	const trimmed = ownerName?.trim()
	if (!trimmed) {
		return "Golden Workplace"
	}
	return `Golden Workplace - ${trimmed}`
}

const WorkplaceRootDialog: React.FC<WorkplaceRootDialogProps> = ({ open, onDismiss }) => {
	const { workplaceRootConfigured, workplaceRootUri, workplaceState, configureWorkplaceRoot } = useExtensionState()

	const [isChoosing, setIsChoosing] = useState(false)

	const ownerName = workplaceState?.ownerProfileDefaults?.name?.trim()
	const folderName = useMemo(() => formatFolderName(ownerName), [ownerName])

	useEffect(() => {
		if (!open) {
			setIsChoosing(false)
		}
	}, [open])

	useEffect(() => {
		if (workplaceRootConfigured) {
			setIsChoosing(false)
		}
	}, [workplaceRootConfigured])

	const handleChoose = () => {
		setIsChoosing(true)
		try {
			configureWorkplaceRoot(ownerName)
		} finally {
			setIsChoosing(false)
		}
	}

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			return
		}

		if (!workplaceRootConfigured) {
			return
		}

		onDismiss?.()
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Choose Where Golden Workplace Lives</DialogTitle>
					<DialogDescription>
						Pick a parent location for <strong>{folderName}</strong>. We'll create the folder for you and keep every
						company workspace inside it.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 pt-2">
					<p className="text-sm text-[var(--vscode-descriptionForeground)]">
						Your Golden Workplace projects will live inside <strong>{folderName}</strong>. Pick a parent folder and we'll
						set everything up automatically.
					</p>
					<Button onClick={handleChoose} disabled={isChoosing}>
						{isChoosing ? "Waiting for folder…" : workplaceRootConfigured ? "Change folder" : "Choose folder"}
					</Button>

					{workplaceRootUri && (
						<p className="text-xs text-[var(--vscode-descriptionForeground)] break-words">
							Current folder: {workplaceRootUri}
						</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

export default WorkplaceRootDialog
