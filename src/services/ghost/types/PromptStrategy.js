/**
 * Enum representing different use case types for prompt strategies
 */
export var UseCaseType;
(function (UseCaseType) {
    UseCaseType["USER_REQUEST"] = "USER_REQUEST";
    UseCaseType["ERROR_FIX"] = "ERROR_FIX";
    UseCaseType["NEW_LINE"] = "NEW_LINE";
    UseCaseType["INLINE_COMPLETION"] = "INLINE_COMPLETION";
    UseCaseType["COMMENT_DRIVEN"] = "COMMENT_DRIVEN";
    UseCaseType["SELECTION_REFACTOR"] = "SELECTION_REFACTOR";
    UseCaseType["AUTO_TRIGGER"] = "AUTO_TRIGGER";
    UseCaseType["AST_AWARE"] = "AST_AWARE";
})(UseCaseType || (UseCaseType = {}));
//# sourceMappingURL=PromptStrategy.js.map