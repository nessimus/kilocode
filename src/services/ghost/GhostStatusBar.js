import * as vscode from "vscode";
import { t } from "../../i18n";
export class GhostStatusBar {
    statusBar;
    enabled;
    model;
    hasValidToken;
    totalSessionCost;
    lastCompletionCost;
    constructor(params) {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.enabled = params.enabled || false;
        this.model = params.model || "default";
        this.hasValidToken = params.hasValidToken || false;
        this.totalSessionCost = params.totalSessionCost;
        this.lastCompletionCost = params.lastCompletionCost;
        this.init();
    }
    init() {
        this.statusBar.text = t("kilocode:ghost.statusBar.enabled");
        this.statusBar.tooltip = t("kilocode:ghost.statusBar.tooltip.basic");
        this.show();
    }
    show() {
        this.statusBar.show();
    }
    hide() {
        this.statusBar.hide();
    }
    dispose() {
        this.statusBar.dispose();
    }
    humanFormatCost(cost) {
        if (cost === 0)
            return t("kilocode:ghost.statusBar.cost.zero");
        if (cost > 0 && cost < 0.01)
            return t("kilocode:ghost.statusBar.cost.lessThanCent"); // Less than one cent
        return `$${cost.toFixed(2)}`;
    }
    update(params) {
        this.enabled = params.enabled !== undefined ? params.enabled : this.enabled;
        this.model = params.model !== undefined ? params.model : this.model;
        this.hasValidToken = params.hasValidToken !== undefined ? params.hasValidToken : this.hasValidToken;
        this.totalSessionCost = params.totalSessionCost !== undefined ? params.totalSessionCost : this.totalSessionCost;
        this.lastCompletionCost =
            params.lastCompletionCost !== undefined ? params.lastCompletionCost : this.lastCompletionCost;
        this.render();
    }
    renderDisabled() {
        this.statusBar.text = t("kilocode:ghost.statusBar.disabled");
        this.statusBar.tooltip = t("kilocode:ghost.statusBar.tooltip.disabled");
    }
    renderTokenError() {
        this.statusBar.text = t("kilocode:ghost.statusBar.warning");
        this.statusBar.tooltip = t("kilocode:ghost.statusBar.tooltip.tokenError");
    }
    renderDefault() {
        const totalCostFormatted = this.humanFormatCost(this.totalSessionCost || 0);
        const lastCompletionCostFormatted = this.lastCompletionCost?.toFixed(5) || 0;
        this.statusBar.text = `${t("kilocode:ghost.statusBar.enabled")} (${totalCostFormatted})`;
        this.statusBar.tooltip = `\
${t("kilocode:ghost.statusBar.tooltip.basic")}
• ${t("kilocode:ghost.statusBar.tooltip.lastCompletion")} $${lastCompletionCostFormatted}
• ${t("kilocode:ghost.statusBar.tooltip.sessionTotal")} ${totalCostFormatted}
• ${t("kilocode:ghost.statusBar.tooltip.model")} ${this.model}\
`;
    }
    render() {
        if (!this.enabled) {
            return this.renderDisabled();
        }
        if (!this.hasValidToken) {
            return this.renderTokenError();
        }
        return this.renderDefault();
    }
}
//# sourceMappingURL=GhostStatusBar.js.map