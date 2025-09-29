import { describe, it, expect, beforeEach } from "vitest";
import { ConversationOrchestrator } from "../ConversationOrchestrator";
const buildAgents = () => [
    { id: "alex", name: "Alex", role: "Solutions Architect" },
    { id: "bianca", name: "Bianca", role: "Finance Analyst" },
    { id: "cory", name: "Cory", role: "Support Lead" },
];
describe("ConversationOrchestrator", () => {
    let orchestrator;
    let agents;
    beforeEach(() => {
        orchestrator = new ConversationOrchestrator();
        agents = buildAgents();
    });
    it("prioritizes explicitly mentioned agents", () => {
        const analysis = orchestrator.analyze({
            text: "@Alex could you review the integration plan?",
            agents,
        });
        expect(analysis.primarySpeakers?.[0]?.id).toBe("alex");
        expect(analysis.primarySpeakers?.[0]?.tier).toBe("directed");
        expect(analysis.hold?.mode).toBe("ingest_hold");
    });
    it("falls back to role matching when there are no explicit mentions", () => {
        const analysis = orchestrator.analyze({
            text: "Need a financial forecast update before Monday",
            agents,
        });
        expect(analysis.primarySpeakers?.[0]?.id).toBe("bianca");
        expect(analysis.primarySpeakers?.[0]?.tier).toBe("topic");
    });
    it("detects stop keywords and enforces manual hold", () => {
        const holdState = undefined;
        const analysis = orchestrator.analyze({
            text: "Hold all responses until I say go",
            agents,
            holdState,
        });
        expect(analysis.hold?.mode).toBe("manual_hold");
        expect(analysis.hold?.reason).toContain("Hold requested");
    });
});
//# sourceMappingURL=ConversationOrchestrator.spec.js.map