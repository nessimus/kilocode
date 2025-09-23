import { Tab, TabContent } from "../../common/Tab"
import WorkplacePanel from "../../workplace/WorkplacePanel"

const WelcomeView = () => {
	return (
		<Tab>
			<TabContent className="flex flex-col gap-6 p-0">
				<section className="bg-vscode-sideBar-background px-6 py-8 text-center border-b border-[var(--vscode-panel-border)]">
					<div className="mx-auto max-w-xl">
						<div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-lg border border-[var(--vscode-panel-border)] text-2xl font-semibold">
							GW
						</div>
						<h1 className="text-2xl font-semibold text-[var(--vscode-foreground)] mb-2">
							Welcome to Golden Workplace
						</h1>
						<p className="text-sm text-[var(--vscode-descriptionForeground)] leading-relaxed">
							Spin up companies, agents, and tooling locally. Start by defining your first team below—once
							you create an executive manager you can jump straight into the Workforce Hub.
						</p>
					</div>
				</section>

				<section className="px-6 pb-8">
					<WorkplacePanel />
				</section>
			</TabContent>
		</Tab>
	)
}

export default WelcomeView
