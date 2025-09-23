import React, { useMemo, useState } from "react"
import clsx from "clsx"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { OuterGateIntegration } from "@roo/golden/outerGate"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"

import styles from "./HubView.module.css"

type OptionalNumberState = string

const toOptionalNumber = (value: OptionalNumberState) => {
	if (!value || value.trim().length === 0) {
		return undefined
	}
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : undefined
}

const toOptionalArray = (value: string) =>
	value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)

const integrationStatusLabel: Record<OuterGateIntegration["status"], string> = {
	connected: "Connected",
	not_connected: "Not Connected",
	coming_soon: "Coming Soon",
}

const getStatusLabel = (status?: OuterGateIntegration["status"] | "error") => {
	if (!status) {
		return "Pending"
	}
	if (status === "error") {
		return "Connection Error"
	}
	return integrationStatusLabel[status]
}

const HubIntegrationsView: React.FC = () => {
	const {
		outerGateState,
		outerGateConnectNotion,
		outerGateSyncNotion,
		outerGateConnectMiro,
		outerGateSyncMiro,
		outerGateImportZip,
	} = useExtensionState()

	const state = outerGateState
	const notionIntegration = useMemo(
		() => state?.integrations.find((integration) => integration.id === "notion"),
		[state?.integrations],
	)
	const miroIntegration = useMemo(
		() => state?.integrations.find((integration) => integration.id === "miro"),
		[state?.integrations],
	)
	const zipIntegration = useMemo(
		() => state?.integrations.find((integration) => integration.id === "zip-file"),
		[state?.integrations],
	)
	const lifeHqIntegration = useMemo(
		() => state?.integrations.find((integration) => integration.id === "life-hq"),
		[state?.integrations],
	)

	const [notionFormOpen, setNotionFormOpen] = useState(false)
	const [notionToken, setNotionToken] = useState("")
	const [notionDatabaseId, setNotionDatabaseId] = useState("")
	const [notionDataSourceId, setNotionDataSourceId] = useState("")
	const [notionPageSize, setNotionPageSize] = useState<OptionalNumberState>("")
	const [notionMaxPages, setNotionMaxPages] = useState<OptionalNumberState>("")

	const [miroFormOpen, setMiroFormOpen] = useState(false)
	const [miroToken, setMiroToken] = useState("")
	const [miroBoardId, setMiroBoardId] = useState("")
	const [miroItemTypes, setMiroItemTypes] = useState("")
	const [miroMaxItems, setMiroMaxItems] = useState<OptionalNumberState>("")

	const statusClassName = (status?: OuterGateIntegration["status"] | "error") =>
		clsx(styles.integrationStatus, {
			[styles.integrationStatusConnected]: status === "connected",
			[styles.integrationStatusError]: status === "error",
			[styles.integrationStatusPending]: status !== "connected" && status !== "error",
		})

	const notionStatus = notionIntegration?.status
	const notionPrimaryButtonLabel = notionFormOpen
		? "Hide form"
		: notionStatus === "connected"
			? "Connected"
			: "Connect"
	const notionResyncDisabled = notionStatus !== "connected"

	const miroStatus = miroIntegration?.status
	const miroPrimaryButtonLabel = miroFormOpen ? "Hide form" : miroStatus === "connected" ? "Connected" : "Connect"
	const miroResyncDisabled = miroStatus !== "connected"

	const lifeHqButtonLabel = getStatusLabel(lifeHqIntegration?.status)
	const lifeHqButtonDisabled = lifeHqIntegration?.status !== "connected"

	const handleNotionSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		outerGateConnectNotion({
			token: notionToken.trim() || undefined,
			databaseId: notionDatabaseId.trim() || undefined,
			dataSourceId: notionDataSourceId.trim() || undefined,
			pageSize: toOptionalNumber(notionPageSize),
			maxPages: toOptionalNumber(notionMaxPages),
		})
		setNotionFormOpen(false)
	}

	const handleMiroSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		outerGateConnectMiro({
			token: miroToken.trim() || undefined,
			boardId: miroBoardId.trim() || undefined,
			itemTypes: miroItemTypes.trim() ? toOptionalArray(miroItemTypes) : undefined,
			maxItems: toOptionalNumber(miroMaxItems),
		})
		setMiroFormOpen(false)
	}

	return (
		<div className={styles.integrationsRoot} data-testid="hub-integrations-view">
			<div className={styles.integrationsBackBar}>
				<VSCodeButton
					appearance="secondary"
					onClick={() =>
						vscode.postMessage({
							type: "action",
							action: "switchTab",
							tab: "hub",
							values: { section: "sessions" },
						})
					}>
					Back to sessions
				</VSCodeButton>
			</div>
			<div>
				<h2 className={styles.integrationsTitle}>Connected Feeds</h2>
				<p className={styles.integrationsDescription}>
					Connect your information sources so Clover can ingest briefs, whiteboards, and archives before you
					start a session.
				</p>
			</div>
			<div className={styles.integrationGrid}>
				<div className={styles.integrationCard}>
					<div className={styles.integrationHeader}>
						<div>
							<h3 className={styles.integrationTitle}>Notion</h3>
							<p className={styles.integrationSubtitle}>
								{notionIntegration?.description ??
									"Connected workspace wiki for organizing docs and projects across your team."}
							</p>
						</div>
						<span className={statusClassName(notionIntegration?.status)}>
							{getStatusLabel(notionIntegration?.status)}
						</span>
					</div>
					<div className={styles.integrationActions}>
						<VSCodeButton appearance="primary" onClick={() => setNotionFormOpen((prev) => !prev)}>
							{notionPrimaryButtonLabel}
						</VSCodeButton>
						<VSCodeButton
							appearance="secondary"
							disabled={notionResyncDisabled}
							onClick={() => outerGateSyncNotion({})}>
							Resync
						</VSCodeButton>
					</div>
					{notionIntegration?.status === "error" && notionIntegration.description && (
						<p className={styles.integrationError}>{notionIntegration.description}</p>
					)}
					{notionFormOpen && (
						<form className={styles.integrationForm} onSubmit={handleNotionSubmit}>
							<div className={styles.integrationFormRow}>
								<label htmlFor="notion-token">Integration token</label>
								<VSCodeTextField
									id="notion-token"
									type="password"
									placeholder="secret_abcdefghijklmnopqrstuvwxyz"
									value={notionToken}
									onInput={(event: any) => setNotionToken(event.target.value ?? "")}
									required
								/>
							</div>
							<div className={styles.integrationFormRow}>
								<label htmlFor="notion-database">Database ID</label>
								<VSCodeTextField
									id="notion-database"
									placeholder="8b1e9f0c1a2345bcdef6a7890b1c23d4"
									value={notionDatabaseId}
									onInput={(event: any) => setNotionDatabaseId(event.target.value ?? "")}
									required
								/>
							</div>
							<div className={styles.integrationFormRow}>
								<label htmlFor="notion-datasource">Data source ID (optional)</label>
								<VSCodeTextField
									id="notion-datasource"
									placeholder="If your database lives in multiple data sources"
									value={notionDataSourceId}
									onInput={(event: any) => setNotionDataSourceId(event.target.value ?? "")}
								/>
							</div>
							<div className={styles.integrationFormRowInline}>
								<div className={styles.integrationFormRow}>
									<label htmlFor="notion-pagesize">Page size</label>
									<VSCodeTextField
										id="notion-pagesize"
										type="number"
										min={1}
										max={200}
										value={notionPageSize}
										onInput={(event: any) => setNotionPageSize(event.target.value ?? "")}
									/>
								</div>
								<div className={styles.integrationFormRow}>
									<label htmlFor="notion-maxpages">Max pages</label>
									<VSCodeTextField
										id="notion-maxpages"
										type="number"
										min={1}
										value={notionMaxPages}
										onInput={(event: any) => setNotionMaxPages(event.target.value ?? "")}
									/>
								</div>
							</div>
							<div className={styles.integrationFormButtons}>
								<VSCodeButton type="submit" appearance="primary">
									Save &amp; sync
								</VSCodeButton>
								<VSCodeButton
									appearance="secondary"
									type="button"
									onClick={() => setNotionFormOpen(false)}>
									Cancel
								</VSCodeButton>
							</div>
						</form>
					)}
				</div>

				<div className={styles.integrationCard}>
					<div className={styles.integrationHeader}>
						<div>
							<h3 className={styles.integrationTitle}>Miro</h3>
							<p className={styles.integrationSubtitle}>
								{miroIntegration?.description ??
									"Collaborative whiteboarding platform for brainstorming, mapping, and planning."}
							</p>
						</div>
						<span className={statusClassName(miroIntegration?.status)}>
							{getStatusLabel(miroIntegration?.status)}
						</span>
					</div>
					<div className={styles.integrationActions}>
						<VSCodeButton appearance="primary" onClick={() => setMiroFormOpen((prev) => !prev)}>
							{miroPrimaryButtonLabel}
						</VSCodeButton>
						<VSCodeButton
							appearance="secondary"
							disabled={miroResyncDisabled}
							onClick={() => outerGateSyncMiro({})}>
							Resync
						</VSCodeButton>
					</div>
					{miroIntegration?.status === "error" && miroIntegration.description && (
						<p className={styles.integrationError}>{miroIntegration.description}</p>
					)}
					{miroFormOpen && (
						<form className={styles.integrationForm} onSubmit={handleMiroSubmit}>
							<div className={styles.integrationFormRow}>
								<label htmlFor="miro-token">Access token</label>
								<VSCodeTextField
									id="miro-token"
									type="password"
									placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
									value={miroToken}
									onInput={(event: any) => setMiroToken(event.target.value ?? "")}
									required
								/>
							</div>
							<div className={styles.integrationFormRow}>
								<label htmlFor="miro-board">Board ID</label>
								<VSCodeTextField
									id="miro-board"
									placeholder="o9J_k8AbCdE="
									value={miroBoardId}
									onInput={(event: any) => setMiroBoardId(event.target.value ?? "")}
									required
								/>
							</div>
							<div className={styles.integrationFormRow}>
								<label htmlFor="miro-itemtypes">Item types (comma separated, optional)</label>
								<VSCodeTextField
									id="miro-itemtypes"
									placeholder="sticky_note, text"
									value={miroItemTypes}
									onInput={(event: any) => setMiroItemTypes(event.target.value ?? "")}
								/>
							</div>
							<div className={styles.integrationFormRow}>
								<label htmlFor="miro-maxitems">Max items</label>
								<VSCodeTextField
									id="miro-maxitems"
									type="number"
									min={1}
									value={miroMaxItems}
									onInput={(event: any) => setMiroMaxItems(event.target.value ?? "")}
								/>
							</div>
							<div className={styles.integrationFormButtons}>
								<VSCodeButton type="submit" appearance="primary">
									Save &amp; sync
								</VSCodeButton>
								<VSCodeButton
									appearance="secondary"
									type="button"
									onClick={() => setMiroFormOpen(false)}>
									Cancel
								</VSCodeButton>
							</div>
						</form>
					)}
				</div>

				<div className={styles.integrationCard}>
					<div className={styles.integrationHeader}>
						<div>
							<h3 className={styles.integrationTitle}>ZIP Upload</h3>
							<p className={styles.integrationSubtitle}>
								{zipIntegration?.description ??
									"Import manual archives of meeting notes, transcripts, or research."}
							</p>
						</div>
						<span className={statusClassName(zipIntegration?.status)}>
							{getStatusLabel(zipIntegration?.status)}
						</span>
					</div>
					{zipIntegration?.status === "error" && zipIntegration.description && (
						<p className={styles.integrationError}>{zipIntegration.description}</p>
					)}
					<div className={styles.integrationActions}>
						<VSCodeButton appearance="primary" onClick={outerGateImportZip}>
							Import ZIP
						</VSCodeButton>
					</div>
				</div>

				<div className={styles.integrationCard}>
					<div className={styles.integrationHeader}>
						<div>
							<h3 className={styles.integrationTitle}>LifeHQ</h3>
							<p className={styles.integrationSubtitle}>
								{lifeHqIntegration?.description ??
									"LifeHQ’s daily capsule stream will plug in once their public API is live."}
							</p>
						</div>
						<span className={statusClassName(lifeHqIntegration?.status)}>
							{getStatusLabel(lifeHqIntegration?.status)}
						</span>
					</div>
					<div className={styles.integrationActions}>
						<VSCodeButton appearance="secondary" disabled={lifeHqButtonDisabled}>
							{lifeHqButtonLabel}
						</VSCodeButton>
					</div>
				</div>
			</div>
		</div>
	)
}

export default HubIntegrationsView
