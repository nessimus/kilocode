import { TelemetryService } from "@roo-code/telemetry";
import { TelemetryEventName } from "@roo-code/types";
export function reportExcessiveRecursion(functionName, recursionDepth) {
    if (recursionDepth > 10 && Number.isInteger(Math.log10(recursionDepth))) {
        TelemetryService.instance.captureEvent(TelemetryEventName.EXCESSIVE_RECURSION, { functionName, recursionDepth });
    }
}
export function yieldPromise() {
    return new Promise((resolve) => setTimeout(() => resolve(), 0));
}
//# sourceMappingURL=kilocode.js.map