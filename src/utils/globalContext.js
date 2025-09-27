import { mkdir } from "fs/promises";
import { join } from "path";
export async function getGlobalFsPath(context) {
    return context.globalStorageUri.fsPath;
}
export async function ensureSettingsDirectoryExists(context) {
    const settingsDir = join(context.globalStorageUri.fsPath, "settings");
    await mkdir(settingsDir, { recursive: true });
    return settingsDir;
}
//# sourceMappingURL=globalContext.js.map