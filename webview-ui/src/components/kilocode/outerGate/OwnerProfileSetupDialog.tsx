import React, { useEffect, useMemo, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { MBTI_TYPES, type MbtiType, type WorkplaceOwnerProfile } from "@roo/golden/workplace"

const DEFAULT_ROLE = "Owner & CEO"

interface OwnerProfileSetupDialogProps {
	open: boolean
	onDismiss?: () => void
}

const OwnerProfileSetupDialog: React.FC<OwnerProfileSetupDialogProps> = ({ open, onDismiss }) => {
	const { workplaceState, setOwnerProfileDefaults, setShowWelcome } = useExtensionState()
	const defaults = workplaceState?.ownerProfileDefaults

	const [firstName, setFirstName] = useState(() => defaults?.firstName ?? "")
	const [lastName, setLastName] = useState(() => defaults?.lastName ?? "")
	const [role, setRole] = useState(() => defaults?.role ?? DEFAULT_ROLE)
	const [mbtiType, setMbtiType] = useState<MbtiType | "">(() => defaults?.mbtiType ?? "")
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const profileAlreadyComplete = useMemo(() => {
		const hasFirst = Boolean(defaults?.firstName && defaults.firstName.trim().length > 0)
		const hasLast = Boolean(defaults?.lastName && defaults.lastName.trim().length > 0)
		const hasMbti = Boolean(defaults?.mbtiType && defaults.mbtiType.trim().length > 0)
		const hasRole = Boolean(defaults?.role && defaults.role.trim().length > 0)
		return hasFirst && hasLast && hasMbti && hasRole
	}, [defaults?.firstName, defaults?.lastName, defaults?.mbtiType, defaults?.role])

	useEffect(() => {
		if (!open) {
			return
		}
		setFirstName(defaults?.firstName ?? "")
		setLastName(defaults?.lastName ?? "")
		setRole(defaults?.role ?? DEFAULT_ROLE)
		setMbtiType(defaults?.mbtiType ?? "")
		setIsSaving(false)
		setError(null)
	}, [open, defaults?.firstName, defaults?.lastName, defaults?.role, defaults?.mbtiType])

	const isFormValid = useMemo(() => {
		return (
			firstName.trim().length > 0 &&
			lastName.trim().length > 0 &&
			role.trim().length > 0 &&
			Boolean(mbtiType)
		)
	}, [firstName, lastName, role, mbtiType])

	const handleMBTIChange = (value: string) => {
		if (MBTI_TYPES.includes(value as MbtiType)) {
			setMbtiType(value as MbtiType)
		}
	}

	const buildOwnerProfilePayload = (
		displayName: string,
		givenName: string,
		surname: string,
		type: MbtiType,
		roleValue: string,
	): WorkplaceOwnerProfile => ({
		name: displayName,
		firstName: givenName,
		lastName: surname,
		role: roleValue,
		mbtiType: type,
		bio: defaults?.bio,
		personalityTraits: defaults?.personalityTraits,
	})

	const handleSubmit = () => {
		const trimmedFirst = firstName.trim()
		const trimmedLast = lastName.trim()
		const trimmedRole = role.trim()
		if (!trimmedFirst) {
			setError("Enter your first name.")
			return
		}
		if (!trimmedLast) {
			setError("Enter your last name.")
			return
		}
		if (!trimmedRole) {
			setError("Tell us your primary role.")
			return
		}
		if (!mbtiType) {
			setError("Select the MBTI type that best matches you.")
			return
		}

		setError(null)
		setIsSaving(true)

		const combinedName = [trimmedFirst, trimmedLast].filter(Boolean).join(" ")
		const payload = buildOwnerProfilePayload(
			combinedName,
			trimmedFirst,
			trimmedLast,
			mbtiType as MbtiType,
			trimmedRole,
		)
		setOwnerProfileDefaults(payload)
		setShowWelcome(false)
		setIsSaving(false)
	}

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			return
		}

		if (!profileAlreadyComplete) {
			return
		}

		setShowWelcome(false)
		onDismiss?.()
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Set Up Your Profile</DialogTitle>
					<DialogDescription>
						Start by giving Golden Workplace your name, role, and MBTI type. This helps every workspace speak to you in
						your voice.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 pt-2">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="grid gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]" htmlFor="owner-first-name">
								First name
							</label>
							<Input
								id="owner-first-name"
								placeholder="e.g. Vanessa"
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
								autoComplete="given-name"
							/>
						</div>
						<div className="grid gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]" htmlFor="owner-last-name">
								Last name
							</label>
							<Input
								id="owner-last-name"
								placeholder="e.g. Greyson-Young"
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
								autoComplete="family-name"
							/>
						</div>
					</div>

					<div className="grid gap-2">
						<label className="text-sm font-medium text-[var(--vscode-foreground)]" htmlFor="owner-role">
							Your role
						</label>
						<Input
							id="owner-role"
							placeholder="e.g. Founder & CEO"
							value={role}
							onChange={(event) => setRole(event.target.value)}
						/>
					</div>

					<div className="grid gap-2">
						<label className="text-sm font-medium text-[var(--vscode-foreground)]" htmlFor="owner-mbti">
							MBTI type
						</label>
						<Select value={mbtiType || undefined} onValueChange={handleMBTIChange}>
							<SelectTrigger id="owner-mbti">
								<SelectValue placeholder="Select one" />
							</SelectTrigger>
							<SelectContent>
								{MBTI_TYPES.map((type) => (
									<SelectItem key={type} value={type}>
										{type}
									</SelectItem>
						))}
						</SelectContent>
					</Select>
					</div>

					{error && <p className="text-sm text-[var(--vscode-errorForeground)]">{error}</p>}

					<Button onClick={handleSubmit} disabled={!isFormValid || isSaving}>
						{isSaving ? "Saving profile…" : "Save profile"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

export default OwnerProfileSetupDialog
