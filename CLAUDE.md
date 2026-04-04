# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

DistrictLife is a custom Minecraft launcher for a Forge 1.16.5 server, built on top of [Helios Launcher](https://github.com/dscalzi/HeliosLauncher). It is an Electron app using Node.js v22.

## Commands

```bash
npm install        # Install dependencies
npm start          # Run in development (launches Electron)
npm run lint       # Run ESLint
npm run dist       # Build installer for current platform
npm run dist:win   # Build Windows x64 NSIS installer → dist/
npm run dist:mac   # Build macOS DMG (x64 + arm64) → dist/
npm run dist:linux # Build Linux AppImage → dist/
```

No test command exists in this project.

## Architecture

**Electron main process** (`index.js`): Creates a frameless 980×552 BrowserWindow, manages IPC channels for Microsoft OAuth authentication (opens a secondary window), auto-updates via `electron-updater`, and Discord Rich Presence via `discord-rpc-patch`. EJS templates are rendered server-side via `ejs-electron` with language strings and a random background injected at render time.

**Renderer process** (`app/assets/js/scripts/`): UI scripts tied to EJS page templates (e.g. `landing.js` ↔ `landing.ejs`). jQuery is used for DOM manipulation throughout.

**Core modules** (`app/assets/js/`):
- `configmanager.js` — loads/saves launcher config from Electron's `userData` path
- `distromanager.js` — fetches and caches the remote distribution index via `helios-core`
- `authmanager.js` — Microsoft (OAuth2/Xbox) and legacy Mojang auth
- `processbuilder.js` — constructs the Java classpath and launches Minecraft with Forge arguments
- `langloader.js` — loads TOML language files from `app/assets/lang/`

**Distribution index**: The launcher fetches `distribution.json` from a remote URL defined in `app/assets/js/distromanager.js`. This JSON defines all servers, their Minecraft/Forge versions, mods, libraries, and resource packs. The schema is documented in `docs/distro.md`. Use [Nebula](https://github.com/dscalzi/Nebula) to generate the distribution index.

## DistrictLife Customizations

When customizing for DistrictLife (Forge 1.16.5), the primary files to update are:

| What | Where |
|------|-------|
| Distribution index URL | `app/assets/js/distromanager.js` → `REMOTE_DISTRO_URL` |
| Azure/Microsoft App Client ID | `app/assets/js/ipcconstants.js` → `AZURE_CLIENT_ID` |
| UI strings (French/custom) | `app/assets/lang/_custom.toml` (overrides `en_US.toml`) |
| Launcher branding/icons | `build/` directory |
| App metadata | `package.json` (`name`, `productName`, `version`) and `electron-builder.yml` |
| Background images | `app/assets/images/` |

> The current `AZURE_CLIENT_ID` in `ipcconstants.js` is the upstream placeholder — replace it with your own Microsoft Entra app registration. See `docs/MicrosoftAuth.md` for setup instructions.

## Key Data Flow

1. `preloader.js` runs first: initializes `ConfigManager`, fetches the distribution index, selects the default server, cleans temp dirs, then signals the main process.
2. `landing.js` drives the main UI: shows news (RSS), server status, handles the Play button, and triggers mod validation + download before launching.
3. `processbuilder.js` resolves Java, validates all module files (MD5), builds the full `-cp` classpath, and spawns the Minecraft process with Forge FML arguments.

## Distribution Module Types (Forge 1.16.5)

For DistrictLife's Forge server, the relevant module types in `distribution.json` are:
- `ForgeHosted` — the Forge mod loader itself
- `ForgeMod` — mods placed in `mods/`
- `File` — configs, resource packs, or any other file
- `Library` — additional Java libraries

Refer to `docs/sample_distribution.json` for a working example.
