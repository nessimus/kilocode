import { z } from "zod"

export const endlessSurfaceAccessLevelSchema = z.enum(["none", "read", "write"])
export type EndlessSurfaceAccessLevel = z.infer<typeof endlessSurfaceAccessLevelSchema>

export const endlessSurfaceAgentAccessSchema = endlessSurfaceAccessLevelSchema
export type EndlessSurfaceAgentAccess = EndlessSurfaceAccessLevel

export const endlessSurfaceThemeSchema = z.enum(["light", "dark"])
export type EndlessSurfaceTheme = z.infer<typeof endlessSurfaceThemeSchema>

export const endlessSurfaceBackgroundSchema = z.enum(["dots", "lines"])
export type EndlessSurfaceBackground = z.infer<typeof endlessSurfaceBackgroundSchema>

export const endlessSurfaceAutoLayoutSchema = z.enum(["manual", "hierarchy", "mindmap"])
export type EndlessSurfaceAutoLayoutMode = z.infer<typeof endlessSurfaceAutoLayoutSchema>

export const endlessSurfaceViewportSchema = z.object({
	x: z.number(),
	y: z.number(),
	zoom: z.number().min(0.01).max(8),
})
export type EndlessSurfaceViewport = z.infer<typeof endlessSurfaceViewportSchema>

export const endlessSurfaceSettingsSchema = z.object({
	grid: endlessSurfaceBackgroundSchema.default("dots"),
	gridSize: z.number().int().min(4).max(256).default(16),
	snapToGrid: z.boolean().default(true),
	autoLayout: endlessSurfaceAutoLayoutSchema.default("manual"),
	showGrid: z.boolean().default(true),
	showMinimap: z.boolean().default(true),
	showControls: z.boolean().default(true),
	defaultNodeDensity: z.enum(["compact", "comfortable"]).default("comfortable"),
})
export type EndlessSurfaceSettings = z.infer<typeof endlessSurfaceSettingsSchema>

export const endlessSurfacePositionSchema = z.object({ x: z.number(), y: z.number() })
export type EndlessSurfacePosition = z.infer<typeof endlessSurfacePositionSchema>

export const endlessSurfaceSizeSchema = z
	.object({ width: z.number().positive(), height: z.number().positive() })
	.optional()
export type EndlessSurfaceSize = z.infer<typeof endlessSurfaceSizeSchema>

export const endlessSurfaceNodeKinds = ["richText", "file", "agentTool", "mindMap"] as const
export type EndlessSurfaceNodeKind = (typeof endlessSurfaceNodeKinds)[number]

const surfaceNodeBaseSchema = z.object({
	id: z.string(),
	type: z.enum(endlessSurfaceNodeKinds),
	position: endlessSurfacePositionSchema,
	size: endlessSurfaceSizeSchema,
	rotation: z.number().optional(),
	draggable: z.boolean().optional(),
	selectable: z.boolean().optional(),
	opacity: z.number().min(0).max(1).optional(),
	metadata: z.record(z.unknown()).optional(),
	zIndex: z.number().optional(),
})

export const endlessSurfaceRichTextSchema = surfaceNodeBaseSchema.extend({
	type: z.literal("richText"),
	data: z
		.object({
			document: z.unknown().optional(),
			html: z.string().optional(),
			plainText: z.string().default(""),
			lastEditedBy: z.string().optional(),
		})
		.default({ document: undefined, plainText: "" }),
})

export const endlessSurfaceAssetRefSchema = z.object({
	assetId: z.string(),
	fileName: z.string(),
	mimeType: z.string(),
	size: z.number().int().nonnegative().optional(),
	url: z.string().optional(),
	previewUrl: z.string().optional(),
	thumbnailUrl: z.string().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
	durationSeconds: z.number().optional(),
})
export type EndlessSurfaceAssetRef = z.infer<typeof endlessSurfaceAssetRefSchema>

export const endlessSurfaceFileNodeSchema = surfaceNodeBaseSchema.extend({
	type: z.literal("file"),
	data: z
		.object({
			asset: endlessSurfaceAssetRefSchema,
			description: z.string().optional(),
			autoplay: z.boolean().optional(),
			loop: z.boolean().optional(),
			posterUrl: z.string().optional(),
		})
		.strict(),
})

export const endlessSurfaceAgentToolStatusSchema = z.enum(["idle", "running", "success", "error"])
export type EndlessSurfaceAgentToolStatus = z.infer<typeof endlessSurfaceAgentToolStatusSchema>

export const endlessSurfaceAgentToolNodeSchema = surfaceNodeBaseSchema.extend({
	type: z.literal("agentTool"),
	data: z
		.object({
			toolId: z.string(),
			label: z.string().optional(),
			status: endlessSurfaceAgentToolStatusSchema.default("idle"),
			lastRunAt: z.number().optional(),
			lastResult: z.string().optional(),
			lastError: z.string().optional(),
		})
		.strict(),
})

export const endlessSurfaceMindMapNodeSchema = surfaceNodeBaseSchema.extend({
	type: z.literal("mindMap"),
	data: z
		.object({
			title: z.string().default("").nullable(),
			notes: z.string().optional(),
			parentId: z.string().optional(),
			collapsed: z.boolean().optional(),
		})
		.strict(),
})

export const endlessSurfaceNodeSchema = z.discriminatedUnion("type", [
	endlessSurfaceRichTextSchema,
	endlessSurfaceFileNodeSchema,
	endlessSurfaceAgentToolNodeSchema,
	endlessSurfaceMindMapNodeSchema,
])
export type EndlessSurfaceNode = z.infer<typeof endlessSurfaceNodeSchema>

export const endlessSurfaceEdgeSchema = z.object({
	id: z.string(),
	source: z.string(),
	target: z.string(),
	sourceHandle: z.string().optional(),
	targetHandle: z.string().optional(),
	type: z.enum(["smoothstep", "straight", "mindMap", "default"]).default("default"),
	label: z.string().optional(),
	data: z.record(z.unknown()).optional(),
})
export type EndlessSurfaceEdge = z.infer<typeof endlessSurfaceEdgeSchema>

export const endlessSurfaceAutoLayoutConfigSchema = z.object({
	mode: endlessSurfaceAutoLayoutSchema,
	spacing: z.number().min(16).max(480).default(144),
	mindMapOrientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
})
export type EndlessSurfaceAutoLayoutConfig = z.infer<typeof endlessSurfaceAutoLayoutConfigSchema>

export const endlessSurfaceDataSchema = z.object({
	nodes: endlessSurfaceNodeSchema.array(),
	edges: endlessSurfaceEdgeSchema.array(),
	viewport: endlessSurfaceViewportSchema,
	settings: endlessSurfaceSettingsSchema,
	theme: endlessSurfaceThemeSchema.default("light"),
	background: endlessSurfaceBackgroundSchema.default("dots"),
	autoLayout: endlessSurfaceAutoLayoutConfigSchema.optional(),
})
export type EndlessSurfaceData = z.infer<typeof endlessSurfaceDataSchema>

export const endlessSurfaceAssetSchema = endlessSurfaceAssetRefSchema.extend({
	kind: z.enum(["image", "audio", "video", "pdf", "binary"]),
	createdAt: z.number(),
	updatedAt: z.number(),
	checksum: z.string().optional(),
})
export type EndlessSurfaceAsset = z.infer<typeof endlessSurfaceAssetSchema>

export const endlessSurfaceMetadataSchema = z.object({
	id: z.string(),
	title: z.string().default("Untitled Surface"),
	description: z.string().optional(),
	createdAt: z.number(),
	updatedAt: z.number(),
	createdBy: z.string().optional(),
	lastOpenedAt: z.number().optional(),
	tags: z.array(z.string()).optional(),
	favorite: z.boolean().optional(),
	agentAccess: endlessSurfaceAgentAccessSchema.default("none"),
	allowAgentMentions: z.boolean().default(true),
})
export type EndlessSurfaceMetadata = z.infer<typeof endlessSurfaceMetadataSchema>

export const endlessSurfaceRecordSchema = z.object({
	meta: endlessSurfaceMetadataSchema,
	data: endlessSurfaceDataSchema,
	assets: endlessSurfaceAssetSchema.array(),
})
export type EndlessSurfaceRecord = z.infer<typeof endlessSurfaceRecordSchema>

export const endlessSurfaceSummarySchema = endlessSurfaceMetadataSchema
	.pick({
		id: true,
		title: true,
		description: true,
		createdAt: true,
		updatedAt: true,
		lastOpenedAt: true,
		agentAccess: true,
		tags: true,
		favorite: true,
	})
	.extend({
		snapshotUrl: z.string().optional(),
		dataUrl: z.string().optional(),
		thumbnailUrl: z.string().optional(),
	})
export type EndlessSurfaceSummary = z.infer<typeof endlessSurfaceSummarySchema>

export const endlessSurfaceSnapshotSchema = z.object({
	surfaceId: z.string(),
	snapshotUrl: z.string(),
	dataUrl: z.string().optional(),
	generatedAt: z.number(),
})
export type EndlessSurfaceSnapshot = z.infer<typeof endlessSurfaceSnapshotSchema>

export const endlessSurfaceStateSchema = z.object({
	enabled: z.boolean().default(false),
	surfaces: endlessSurfaceSummarySchema.array(),
	activeSurfaceId: z.string().optional(),
	defaultAgentAccess: endlessSurfaceAgentAccessSchema.default("none"),
})
export type EndlessSurfaceState = z.infer<typeof endlessSurfaceStateSchema>

export const endlessSurfaceMutationSchema = z.object({
	surfaceId: z.string(),
	op: z.enum(["replace", "merge", "delete", "insert"]),
	path: z.array(z.union([z.string(), z.number()])),
	value: z.unknown().optional(),
})
export type EndlessSurfaceMutation = z.infer<typeof endlessSurfaceMutationSchema>

export const endlessSurfaceMutationRequestSchema = z.object({
	surfaceId: z.string(),
	mutations: endlessSurfaceMutationSchema.array().min(1),
	clientId: z.string().optional(),
	requestId: z.string().optional(),
})
export type EndlessSurfaceMutationRequest = z.infer<typeof endlessSurfaceMutationRequestSchema>

export const endlessSurfaceMutationResultSchema = z.object({
	surfaceId: z.string(),
	success: z.boolean(),
	error: z.string().optional(),
	requestId: z.string().optional(),
})
export type EndlessSurfaceMutationResult = z.infer<typeof endlessSurfaceMutationResultSchema>

export const endlessSurfaceListResponseSchema = z.object({
	surfaces: endlessSurfaceSummarySchema.array(),
	activeSurfaceId: z.string().optional(),
})
export type EndlessSurfaceListResponse = z.infer<typeof endlessSurfaceListResponseSchema>
