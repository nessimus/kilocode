import { z } from "zod";
export const browserInteractionStrategies = ["legacy", "venus_navi", "venus_ground"];
export const browserStreamFrameSchema = z.object({
    sessionId: z.string(),
    screenshot: z.string().optional(),
    url: z.string().optional(),
    mousePosition: z.string().optional(),
    timestamp: z.number(),
    taskId: z.string().optional(),
    ended: z.boolean().optional(),
});
//# sourceMappingURL=browser.js.map