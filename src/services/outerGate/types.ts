import type { OuterGateInsight } from "../../shared/golden/outerGate"

export type OuterGateIntegrationId = "notion" | "miro" | "zip-file" | "life-hq" | "drive" | "chatgpt" | string

export interface StoredIntegrationMeta {
	id: OuterGateIntegrationId
	status: "connected" | "pending" | "error"
	lastSyncedAtIso?: string
	description?: string
	errorMessage?: string
	targetLabel?: string
	recordCount?: number
	extra?: Record<string, string | number | boolean | undefined>
}

export interface StoredInsight extends OuterGateInsight {
	integrationId: OuterGateIntegrationId
	upsertedAtIso: string
}

export interface OuterGateStorageData {
	version: number
	integrations: Record<OuterGateIntegrationId, StoredIntegrationMeta>
	insights: Record<string, StoredInsight>
}

export const OUTER_GATE_STORAGE_VERSION = 1

export interface IntegrationMutationOutcome {
	meta: StoredIntegrationMeta
	insights: StoredInsight[]
}
