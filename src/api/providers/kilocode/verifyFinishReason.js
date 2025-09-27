import { t } from "../../../i18n";
export function throwMaxCompletionTokensReachedError() {
    throw Error(t("kilocode:task.maxCompletionTokens"));
}
export function verifyFinishReason(choice) {
    if (choice?.finish_reason === "length") {
        throwMaxCompletionTokensReachedError();
    }
}
//# sourceMappingURL=verifyFinishReason.js.map