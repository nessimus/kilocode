import { getApiMetrics } from "../../shared/getApiMetrics";
export class AutoApprovalHandler {
    consecutiveAutoApprovedRequestsCount = 0;
    consecutiveAutoApprovedCost = 0;
    /**
     * Check if auto-approval limits have been reached and handle user approval if needed
     */
    async checkAutoApprovalLimits(state, messages, askForApproval) {
        // Check request count limit
        const requestResult = await this.checkRequestLimit(state, askForApproval);
        if (!requestResult.shouldProceed || requestResult.requiresApproval) {
            return requestResult;
        }
        // Check cost limit
        const costResult = await this.checkCostLimit(state, messages, askForApproval);
        return costResult;
    }
    /**
     * Increment the request counter and check if limit is exceeded
     */
    async checkRequestLimit(state, askForApproval) {
        const maxRequests = state?.allowedMaxRequests || Infinity;
        // Increment the counter for each new API request
        this.consecutiveAutoApprovedRequestsCount++;
        if (this.consecutiveAutoApprovedRequestsCount > maxRequests) {
            const { response } = await askForApproval("auto_approval_max_req_reached", JSON.stringify({ count: maxRequests, type: "requests" }));
            // If we get past the promise, it means the user approved and did not start a new task
            if (response === "yesButtonClicked") {
                this.consecutiveAutoApprovedRequestsCount = 0;
                return {
                    shouldProceed: true,
                    requiresApproval: true,
                    approvalType: "requests",
                    approvalCount: maxRequests,
                };
            }
            return {
                shouldProceed: false,
                requiresApproval: true,
                approvalType: "requests",
                approvalCount: maxRequests,
            };
        }
        return { shouldProceed: true, requiresApproval: false };
    }
    /**
     * Calculate current cost and check if limit is exceeded
     */
    async checkCostLimit(state, messages, askForApproval) {
        const maxCost = state?.allowedMaxCost || Infinity;
        // Calculate total cost from messages
        this.consecutiveAutoApprovedCost = getApiMetrics(messages).totalCost;
        // Use epsilon for floating-point comparison to avoid precision issues
        const EPSILON = 0.0001;
        if (this.consecutiveAutoApprovedCost > maxCost + EPSILON) {
            const { response } = await askForApproval("auto_approval_max_req_reached", JSON.stringify({ count: maxCost.toFixed(2), type: "cost" }));
            // If we get past the promise, it means the user approved and did not start a new task
            if (response === "yesButtonClicked") {
                // Note: We don't reset the cost to 0 here because the actual cost
                // is calculated from the messages. This is different from the request count.
                return {
                    shouldProceed: true,
                    requiresApproval: true,
                    approvalType: "cost",
                    approvalCount: maxCost.toFixed(2),
                };
            }
            return {
                shouldProceed: false,
                requiresApproval: true,
                approvalType: "cost",
                approvalCount: maxCost.toFixed(2),
            };
        }
        return { shouldProceed: true, requiresApproval: false };
    }
    /**
     * Reset the request counter (typically called when starting a new task)
     */
    resetRequestCount() {
        this.consecutiveAutoApprovedRequestsCount = 0;
    }
    /**
     * Get current approval state for debugging/testing
     */
    getApprovalState() {
        return {
            requestCount: this.consecutiveAutoApprovedRequestsCount,
            currentCost: this.consecutiveAutoApprovedCost,
        };
    }
}
//# sourceMappingURL=AutoApprovalHandler.js.map