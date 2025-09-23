import React, { useEffect } from "react"
import { vscode } from "@/utils/vscode"
import {
	BalanceDataResponsePayload,
	ProfileData,
	ProfileDataResponsePayload,
	WebviewMessage,
} from "@roo/WebviewMessage"
import { VSCodeButtonLink } from "@/components/common/VSCodeButtonLink"
import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react"
import CountUp from "react-countup"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Tab, TabContent, TabHeader } from "@/components/common/Tab"
import { Button } from "@/components/ui"
import KiloCodeAuth from "../common/KiloCodeAuth"
import { OrganizationSelector } from "../common/OrganizationSelector"
import IdentityDesigner from "./IdentityDesigner"

interface ProfileViewProps {
	onDone: () => void
}

const ProfileView: React.FC<ProfileViewProps> = ({ onDone }) => {
	const { apiConfiguration, currentApiConfigName, uriScheme, uiKind } = useExtensionState()
	const { t } = useAppTranslation()
	const [profileData, setProfileData] = React.useState<ProfileData | undefined | null>(null)
	const [balance, setBalance] = React.useState<number | null>(null)
	const [isLoadingBalance, setIsLoadingBalance] = React.useState(true)
	const [isLoadingUser, setIsLoadingUser] = React.useState(true)

	useEffect(() => {
		vscode.postMessage({ type: "fetchProfileDataRequest" })
		vscode.postMessage({ type: "fetchBalanceDataRequest" })
	}, [apiConfiguration?.kilocodeToken, apiConfiguration?.kilocodeOrganizationId])

	useEffect(() => {
		const handleMessage = (event: MessageEvent<WebviewMessage>) => {
			const message = event.data

			if (message.type === "profileDataResponse") {
				const payload = message.payload as ProfileDataResponsePayload
				if (payload.success) {
					setProfileData(payload.data)
				} else {
					console.error("Error fetching profile data:", payload.error)
					setProfileData(null)
				}
				setIsLoadingUser(false)
			} else if (message.type === "balanceDataResponse") {
				const payload = message.payload as BalanceDataResponsePayload
				if (payload.success) {
					setBalance(payload.data?.balance ?? 0)
				} else {
					console.error("Error fetching balance data:", payload.error)
					setBalance(null)
				}
				setIsLoadingBalance(false)
			} else if (message.type === "updateProfileData") {
				vscode.postMessage({ type: "fetchProfileDataRequest" })
				vscode.postMessage({ type: "fetchBalanceDataRequest" })
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [profileData])

	const user = profileData?.user
	const isAuthenticated = Boolean(user)

	function handleLogout(): void {
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: currentApiConfigName,
			apiConfiguration: {
				...apiConfiguration,
				kilocodeToken: "",
				kilocodeOrganizationId: undefined,
			},
		})
	}

	const creditPackages = [
		{ credits: 20, popular: false },
		{ credits: 50, popular: true },
		{ credits: 100, popular: false },
		{ credits: 200, popular: false },
	]

	const handleBuyCredits = (credits: number) => () => {
		vscode.postMessage({
			type: "shopBuyCredits",
			values: {
				credits,
				uriScheme,
				uiKind,
			},
		})
	}

	if (isLoadingUser) {
		return <></>
	}

	return (
		<Tab>
			<TabHeader className="flex items-center justify-between">
				<h3 className="m-0 text-vscode-foreground">{t("kilocode:profile.title")}</h3>
				<Button onClick={onDone}>{t("settings:common.done")}</Button>
			</TabHeader>
			<TabContent>
				<div className="h-full overflow-y-auto pr-3">
					<div className="flex flex-col gap-8 max-w-4xl">
						<section className="rounded-md border border-[var(--vscode-panel-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-6 shadow-sm">
							{isAuthenticated ? (
								<div className="flex flex-col gap-4">
									<div className="flex items-center gap-4">
										{user?.image ? (
											<img src={user.image} alt="Profile" className="size-16 rounded-full" />
										) : (
											<div className="size-16 rounded-full bg-[var(--vscode-button-background)] flex items-center justify-center text-2xl text-[var(--vscode-button-foreground)]">
												{user?.name?.[0] || user?.email?.[0] || "?"}
											</div>
										)}
										<div className="flex flex-col min-w-0">
											{user?.name && (
												<h2 className="m-0 text-lg font-medium text-[var(--vscode-foreground)] truncate">
													{user.name}
												</h2>
											)}
											{user?.email && (
												<div className="text-sm text-[var(--vscode-descriptionForeground)] break-words">
													{user.email}
												</div>
											)}
										</div>
									</div>

									<OrganizationSelector className="max-w-xl" />
								</div>
							) : (
								<div className="max-w-xl">
									<KiloCodeAuth className="w-full" />
								</div>
							)}
						</section>

						<section className="rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-6 shadow-sm">
							<div className="flex flex-col gap-2">
								<h2 className="m-0 text-lg font-semibold text-[var(--vscode-foreground)]">
									{t("kilocode:profile.identityDesignerHeading", {
										defaultValue: "Identity Designer",
									})}
								</h2>
								<p className="m-0 text-sm text-[var(--vscode-descriptionForeground)]">
									{t("kilocode:profile.identityDesignerSubheading", {
										defaultValue:
											"Define the founder, company story, and employee personas that Golden Workplace should bring into every interaction.",
									})}
								</p>
								<IdentityDesigner />
							</div>
						</section>

						<section className="rounded-md border border-[var(--vscode-panel-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] p-6 shadow-sm flex flex-col gap-3">
							<h2 className="m-0 text-lg font-semibold text-[var(--vscode-foreground)]">
								Project Management
							</h2>
							<p className="m-0 text-sm text-[var(--vscode-descriptionForeground)]">
								Launch the Action Workspace to map goals, projects, and tasks across your company, and
								keep AI employees aligned with human teammates.
							</p>
							<Button onClick={() => vscode.postMessage({ type: "switchTab", tab: "workspace" })}>
								Open Action Workspace
							</Button>
						</section>

						{isAuthenticated && (
							<section className="rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-6 shadow-sm flex flex-col gap-6">
								<div className="flex flex-col gap-2 min-[225px]:flex-row min-[225px]:items-center min-[225px]:justify-between">
									<VSCodeButtonLink
										href="https://kilocode.ai/profile"
										appearance="primary"
										className="w-full min-[225px]:w-1/2">
										{t("kilocode:profile.dashboard")}
									</VSCodeButtonLink>
									<VSCodeButton
										appearance="secondary"
										onClick={handleLogout}
										className="w-full min-[225px]:w-1/2">
										{t("kilocode:profile.logOut")}
									</VSCodeButton>
								</div>

								<VSCodeDivider className="w-full" />

								<div className="flex flex-col items-center gap-4">
									<div className="text-sm text-[var(--vscode-descriptionForeground)]">
										{t("kilocode:profile.currentBalance")}
									</div>
									<div className="flex items-center gap-2 text-4xl font-bold text-[var(--vscode-foreground)]">
										{isLoadingBalance ? (
											<div className="text-[var(--vscode-descriptionForeground)]">
												{t("kilocode:profile.loading")}
											</div>
										) : balance !== null ? (
											<>
												<span>$</span>
												<CountUp end={balance} duration={0.66} decimals={2} />
												<VSCodeButton
													appearance="icon"
													className="mt-[2px]"
													onClick={() => {
														setIsLoadingBalance(true)
														vscode.postMessage({ type: "fetchBalanceDataRequest" })
													}}>
													<span className="codicon codicon-refresh" />
												</VSCodeButton>
											</>
										) : null}
									</div>

									{!apiConfiguration?.kilocodeOrganizationId && (
										<div className="w-full">
											<div className="mb-4 text-center text-lg font-semibold text-[var(--vscode-foreground)]">
												{t("kilocode:profile.shop.title")}
											</div>
											<div className="grid gap-3 min-[300px]:grid-cols-2">
												{creditPackages.map((pkg) => (
													<div
														key={pkg.credits}
														className={`relative rounded-lg border p-4 transition-all hover:shadow-md ${
															pkg.popular
																? "border-[var(--vscode-button-background)] ring-1 ring-[var(--vscode-button-background)]"
																: "border-[var(--vscode-input-border)]"
														}`}>
														{pkg.popular && (
															<div className="absolute -top-2 left-1/2 -translate-x-1/2">
																<span className="rounded-full bg-[var(--vscode-button-background)] px-2 py-1 text-xs font-medium text-[var(--vscode-button-foreground)]">
																	{t("kilocode:profile.shop.popular")}
																</span>
															</div>
														)}

														<div className="text-center">
															<div className="mb-1 text-2xl font-bold text-[var(--vscode-foreground)]">
																${pkg.credits}
															</div>
															<div className="mb-2 text-sm text-[var(--vscode-descriptionForeground)]">
																{t("kilocode:profile.shop.credits")}
															</div>
															<VSCodeButton
																appearance={pkg.popular ? "primary" : "secondary"}
																className="w-full"
																onClick={handleBuyCredits(pkg.credits)}>
																{t("kilocode:profile.shop.action")}
															</VSCodeButton>
														</div>
													</div>
												))}
											</div>

											<div className="text-center">
												<VSCodeButtonLink
													href="https://kilocode.ai/profile"
													appearance="secondary"
													className="text-sm">
													{t("kilocode:profile.shop.viewAll")}
												</VSCodeButtonLink>
											</div>
										</div>
									)}
								</div>
							</section>
						)}
					</div>
				</div>
			</TabContent>
		</Tab>
	)
}

export default ProfileView
