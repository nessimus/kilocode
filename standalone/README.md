# Standalone Desktop Build

Use this workflow to package the Kilo Code extension inside a branded Code OSS build called **Golden Workspace**. The generated app hides VS Code UI chrome, ships your extension preinstalled, and starts with opinionated defaults that route users straight into the Kilo Code surface.

## Prerequisites

- macOS or Linux host (Apple Silicon and x64 verified; other targets can be set through `TARGET_PLATFORM`)
- Node.js 20+
- `pnpm` and `npm` available on the PATH
- `git` and `unzip`

## Build Steps

```bash
pnpm install
./scripts/build-standalone.sh
```

The script will:

1. Clone/update the Microsoft `vscode` source tree under `.standalone/vscode`.
2. Bundle the local Kilo Code extension and unpack it into `bin-unpacked/extension`.
3. Build a platform-specific Code OSS binary (`TARGET_PLATFORM` defaults to the host OS/CPU).
4. Apply the overrides in `standalone/product.overrides.json`, inject default workspace settings from `standalone/default-settings.json`, and copy the extension into `resources/app/extensions/kilo-code`.
5. Emit the finished payload under `.standalone/out/GoldenWorkspace-<platform>`.

To force a specific target, export `TARGET_PLATFORM` before running the script. Supported values match Code OSS gulp tasks, for example `darwin-arm64`, `darwin-x64`, `linux-x64`, or `linux-arm64`.

## Launching the App

- macOS: `open ".standalone/out/GoldenWorkspace-darwin-arm64/Golden Workspace.app"`
- Linux: run the binary inside `.standalone/out/GoldenWorkspace-linux-x64`

The first launch boots straight into the Kilo Code activity bar. Because the stock marketplace is disabled, updates are tied to your repo (rerun the script whenever you ship a new extension bundle).

## Configuring LLM Access

1. Open the Golden Workspace app.
2. In the Kilo Code panel, click the gear icon → _Use your own API key_.
3. Paste the OpenRouter (recommended) or single-provider API key.
4. Start a new task and send a greeting to confirm round-trip access.

Customizations for product naming, licensing URLs, or default settings can be tweaked by editing the JSON files in `standalone/` and re-running the script. The generated artifacts stay under `.standalone/`, which is git-ignored.
