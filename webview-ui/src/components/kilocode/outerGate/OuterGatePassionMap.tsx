import React, { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
	OuterGateAnalysisPool,
	OuterGatePassionCluster,
	OuterGatePassionMapState,
	OuterGatePassionPoint,
} from "@roo/golden/outerGate"

interface OuterGatePassionMapProps {
	passionMap: OuterGatePassionMapState
	analysisPool: OuterGateAnalysisPool
	onBack: () => void
	onRefresh: () => void
}

const CLUSTER_LABEL_PLACEHOLDER = "Emerging Passion"

const OuterGatePassionMap: React.FC<OuterGatePassionMapProps> = ({ passionMap, analysisPool, onBack, onRefresh }) => {
	const [selectedPointId, setSelectedPointId] = useState<string | null>(null)

	useEffect(() => {
		if (passionMap.status === "ready" && passionMap.points.length > 0) {
			setSelectedPointId((current) => current ?? passionMap.points[0].id)
		} else if (passionMap.status !== "ready") {
			setSelectedPointId(null)
		}
	}, [passionMap.status, passionMap.points])

	const clusterById = useMemo(() => {
		const map = new Map<string, OuterGatePassionCluster>()
		for (const cluster of passionMap.clusters) {
			map.set(cluster.id, cluster)
		}
		return map
	}, [passionMap.clusters])

	const selectedPoint: OuterGatePassionPoint | undefined = useMemo(() => {
		if (passionMap.status !== "ready") {
			return undefined
		}
		if (!selectedPointId) {
			return passionMap.points[0]
		}
		return passionMap.points.find((point) => point.id === selectedPointId) ?? passionMap.points[0]
	}, [passionMap.status, passionMap.points, selectedPointId])

	const selectedCluster = selectedPoint ? clusterById.get(selectedPoint.clusterId) : undefined

	const { heatAverage, totalPoints } = useMemo(() => {
		if (passionMap.status !== "ready" || passionMap.points.length === 0) {
			return { heatAverage: 0, totalPoints: passionMap.points.length }
		}
		const avg =
			passionMap.points.reduce((sum, point) => sum + point.heat, 0) / Math.max(passionMap.points.length, 1)
		return { heatAverage: Number(avg.toFixed(2)), totalPoints: passionMap.points.length }
	}, [passionMap])

	const renderLegend = () => {
		if (passionMap.status !== "ready" || passionMap.clusters.length === 0) {
			return null
		}
		return (
			<div className="grid gap-3">
				{passionMap.clusters.map((cluster) => (
					<div
						key={cluster.id}
						className="flex items-start justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--primary)_16%,rgba(255,255,255,0.12)_84%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(255,255,255,0.05)_18%)] p-3"
					>
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2 text-sm font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_80%,rgba(255,255,255,0.2)_20%)]">
								<span
									className="inline-block h-3 w-3 rounded-full"
									style={{ backgroundColor: cluster.color }}
									aria-hidden
								/>
								{cluster.label || CLUSTER_LABEL_PLACEHOLDER}
							</div>
							<div className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_68%,rgba(255,255,255,0.24)_32%)]">
								{cluster.topKeywords.length > 0 ? cluster.topKeywords.join(" • ") : "Gathering interest"}
							</div>
						</div>
						<div className="flex flex-col items-end gap-1 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.18)_30%)]">
							<span>{cluster.size} item{cluster.size === 1 ? "" : "s"}</span>
							<Badge
								variant="secondary"
								className="bg-[color-mix(in_srgb,var(--primary)_16%,rgba(255,255,255,0.08)_84%)] text-[color-mix(in_srgb,var(--primary)_70%,rgba(255,255,255,0.16)_30%)]"
							>
								Passion Score {cluster.passionScore.toFixed(2)}
							</Badge>
						</div>
					</div>
				))}
			</div>
		)
	}

	const renderPointDetails = () => {
		if (!selectedPoint || passionMap.status !== "ready") {
			return null
		}
		return (
			<Card className="border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.06)_22%)]">
				<CardHeader className="pb-2">
					<CardTitle className="text-base font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
						Selected Insight
					</CardTitle>
					<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_68%,rgba(255,255,255,0.24)_32%)]">
						Cluster: {selectedCluster?.label || CLUSTER_LABEL_PLACEHOLDER}
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_82%,rgba(255,255,255,0.22)_18%)]">
					<p className="leading-relaxed">{selectedPoint.snippet}</p>
					<div className="flex flex-wrap items-center gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_60%,rgba(255,255,255,0.3)_40%)]">
						<Badge variant="secondary" className="capitalize">
							{selectedPoint.kind}
						</Badge>
						<Badge variant="outline" className="capitalize border-[color-mix(in_srgb,var(--primary)_28%,rgba(255,255,255,0.25)_72%)]">
							{selectedPoint.status.replace("_", " ")}
						</Badge>
						<span>
							Heat {Math.round(selectedPoint.heat * 100)}%
						</span>
						<span>{formatDayTime(selectedPoint.createdAtIso)}</span>
					</div>
					{selectedPoint.metadata?.filename && (
						<div className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_65%,rgba(255,255,255,0.2)_35%)]">
							File: {selectedPoint.metadata.filename}
						</div>
					)}
					{selectedPoint.metadata?.references && selectedPoint.metadata.references.length > 0 && (
						<div className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_65%,rgba(255,255,255,0.2)_35%)]">
							References: {selectedPoint.metadata.references.join(", ")}
						</div>
					)}
				</CardContent>
			</Card>
		)
	}

	return (
		<section className="flex h-full flex-col gap-4">
			<header className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<Button variant="ghost" size="sm" onClick={onBack} className="inline-flex items-center gap-1">
							<span className="codicon codicon-arrow-left" aria-hidden /> Back
						</Button>
						<h2 className="text-lg font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.08)_10%)]">
							Passion Map
						</h2>
					</div>
					<Button variant="secondary" size="sm" onClick={onRefresh} disabled={passionMap.status === "loading"}>
						{passionMap.status === "loading" ? (
							<span className="codicon codicon-sync codicon-modifier-spin" aria-hidden />
						) : (
							<>
								<span className="codicon codicon-sync" aria-hidden /> Refresh
							</>
						)}
					</Button>
				</div>
				<p className="text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_68%,rgba(255,255,255,0.24)_32%)]">
					Visualize how {analysisPool.totalCaptured} captured insights and documents cluster into emerging passions.
				</p>
				<p className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_60%,rgba(255,255,255,0.22)_40%)]">
					Generated {formatDayTime(passionMap.generatedAtIso)} · Average heat {Math.round(heatAverage * 100)}% · {totalPoints} item{totalPoints === 1 ? "" : "s"}
				</p>
			</header>

			<Card className="flex-1 border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(255,255,255,0.05)_18%)]">
				<CardHeader className="pb-2">
					<CardTitle className="text-base font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_86%,rgba(255,255,255,0.1)_14%)]">
						Point Cloud
					</CardTitle>
					<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_68%,rgba(255,255,255,0.24)_32%)]">
						Each dot reflects a captured message or file projected via t-SNE and grouped by emergent passion themes.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex h-full flex-col gap-4">
					{passionMap.status === "loading" && (
						<div className="flex h-full flex-1 items-center justify-center text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.2)_30%)]">
							<span className="codicon codicon-sync codicon-modifier-spin mr-2" aria-hidden /> Generating passion map…
						</div>
					)}
					{passionMap.status === "error" && (
						<div className="flex h-full flex-1 flex-col items-center justify-center gap-3 text-center">
							<p className="text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_72%,rgba(255,255,255,0.18)_28%)]">
								{passionMap.error ?? "We couldn’t load the passion map."}
							</p>
							<Button variant="secondary" onClick={onRefresh}>
								Try Again
							</Button>
						</div>
					)}
					{passionMap.status === "ready" && passionMap.points.length === 0 && (
						<div className="flex h-full flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.2)_30%)]">
							<p>No captured items yet. Import documents or chat with Clover to seed the passion map.</p>
							<Button variant="secondary" onClick={onRefresh}>
								Refresh
							</Button>
						</div>
					)}
					{passionMap.status === "ready" && passionMap.points.length > 0 && (
						<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
							<div className="flex flex-col gap-4">
								<div className="relative h-[360px] overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--primary)_14%,rgba(255,255,255,0.1)_86%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.04)_22%)]">
									<svg viewBox="-1.1 -1.1 2.2 2.2" className="absolute inset-0 h-full w-full">
										<defs>
											<radialGradient id="passion-bg" cx="50%" cy="50%" r="70%">
												<stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
												<stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
											</radialGradient>
										</defs>
										<rect x="-1.1" y="-1.1" width="2.2" height="2.2" fill="url(#passion-bg)" />
										{passionMap.points.map((point) => {
											const cluster = clusterById.get(point.clusterId)
											const radius = 0.04 + point.heat * 0.06
											const isSelected = selectedPointId === point.id
											return (
												<circle
													key={point.id}
													cx={point.coordinates.x}
													cy={-point.coordinates.y}
													r={radius}
													fill={cluster?.color ?? "#A855F7"}
													opacity={isSelected ? 0.9 : 0.6}
													stroke={isSelected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)"}
													strokeWidth={isSelected ? 0.015 : 0.01}
													onMouseEnter={() => setSelectedPointId(point.id)}
													onFocus={() => setSelectedPointId(point.id)}
													tabIndex={0}
												>
													<title>{point.snippet}</title>
												</circle>
											)
										})}
									</svg>
								</div>
								{renderPointDetails()}
							</div>
							<div className="flex flex-col gap-4">
								<Card className="border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.05)_22%)]">
									<CardHeader className="pb-2">
										<CardTitle className="text-sm font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_84%,rgba(255,255,255,0.16)_16%)]">
											Clusters
										</CardTitle>
										<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_66%,rgba(255,255,255,0.22)_34%)]">
											Highlights of the dominant passion groupings in your data pool.
										</CardDescription>
									</CardHeader>
									<CardContent>{renderLegend()}</CardContent>
								</Card>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</section>
	)
}

function formatDayTime(iso?: string) {
	if (!iso) {
		return "Just now"
	}

	try {
		const date = new Date(iso)
		const now = new Date()
		const diffMs = now.getTime() - date.getTime()
		const diffMinutes = Math.round(diffMs / (1000 * 60))

		if (diffMinutes < 60) {
			return `${Math.max(diffMinutes, 1)}m ago`
		}
		if (diffMinutes < 60 * 24) {
			const hours = Math.round(diffMinutes / 60)
			return `${hours}h ago`
		}

		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(date)
	} catch {
		return "Recently"
	}
}

export default OuterGatePassionMap
