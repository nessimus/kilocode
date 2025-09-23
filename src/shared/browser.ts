import { z } from "zod"

export const browserInteractionStrategies = ["legacy", "venus_navi", "venus_ground"] as const

export type BrowserInteractionStrategy = (typeof browserInteractionStrategies)[number]

export const browserStreamFrameSchema = z.object({
	sessionId: z.string(),
	screenshot: z.string().optional(),
	url: z.string().optional(),
	mousePosition: z.string().optional(),
	timestamp: z.number(),
	taskId: z.string().optional(),
	ended: z.boolean().optional(),
})

export type BrowserStreamFrame = z.infer<typeof browserStreamFrameSchema>
