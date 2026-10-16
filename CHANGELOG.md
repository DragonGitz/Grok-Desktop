# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.


## [2.0.5] - 2026-10-16 (Dragonified fork)

### Changed
- **New app icon** - original black-hole / accretion-disk artwork (assets/icon.svg) replaces the Grok logo (an xAI trademark) for the window, taskbar and builds.
- **Dropdown** opens as its own popup window, so it can extend past the app window (clamped to the screen work area, scrolls if taller); falls back to the in-window menu.
- **grok.com sidebar** - Chat / Imagine / Library / Automations shown as one row of icon buttons with tooltips (set `compactSidebar: false` in grok-desktop-settings.json to disable).
- Bot rows: pin sits right after the shortcut. Build trash tooltip is "Hide from list"; "Show hidden (N)" restores hidden entries.

### Fixed
- **Build list duplicates** - unused stub CLI sessions (no messages, no title, never active) are hidden; near-duplicate untitled sessions in the same folder within 15 minutes collapse to the one with more content.
- **Bot pins** - the toggle updates at once and re-syncs afterwards; the sidebar is nudged to refetch before reading so pins changed elsewhere show up.

## [2.0.4] - 2026-10-16 (Dragonified fork)

### Fixed
- **Tab bar** - + and dropdown sit right after the last tab again; only when tabs overflow do they stay at the right edge of the tab area, next to the scroll arrows.

## [2.0.3] - 2026-10-16 (Dragonified fork)

### Fixed
- **Tab overflow** - tabs scroll inside their own strip with ‹ › arrows (shown only when overflowing, disabled at the ends); the + and dropdown buttons stay visible to the right of the strip. The active or new tab is scrolled into view; mouse wheel scrolls the strip.
- **Dropdown** - kept fully inside the window (shifted left near the right edge, height capped with internal scrolling).

### Changed
- Bot rows have a single right-aligned pin column (Build rows keep pin + hide).

## [2.0.2] - 2026-10-16 (Dragonified fork)

### Fixed
- **Bots list** - Show more is pressed with a full pointer/mouse event sequence, located anywhere after the Bots heading (not only inside nav/aside), and the scrape waits (MutationObserver, up to 5s per page, repeated) for more bots to load instead of stopping when the count is briefly stable. A short partial read no longer overwrites a larger cached list.

### Added
- **Diagnostics** - with the debug flag file (%APPDATA%\Grok-Desktop\usage-debug), each bot scrape logs the sidebar Bots section HTML, the toggle and each step, and grok.com fetch/XHR responses matching bot/agent/relay/graphql/connect, to usage-debug.log.

## [2.0.1] - 2026-10-16 (Dragonified fork)

### Added
- **Build CLI sessions** - the Build section lists your Grok CLI sessions (from ~/.grok/sessions, newest first, 10 recent plus pins) with title, folder and age; clicking resumes the session (`grok --resume <id>`) in an embedded terminal tab. The trash icon only hides an entry; CLI session files are never touched. Manually opened folders stay listed until they have a session.

### Changed
- Flyout rows use fixed shortcut/action columns; pin icons are always visible (grey / blue when pinned).

## [2.0.0] - 2026-10-16 (Dragonified fork)

### Added
- **New-tab flyout** (Windows Terminal style) next to `+`: New Chat, your grok.com Bots (with avatars and pin buttons synced to grok.com's own Pinned section), Open Grok Bot, and Build CLI folders (New…, pinned, 10 recent; inline pin/remove).
- **Embedded Build CLI** - runs the `grok` CLI in a terminal tab (xterm.js + node-pty), titled after the folder; closing the tab ends the process.
- **Hotkeys** - Ctrl+Shift+1..9,0 open bots 1-10; Ctrl+Shift+F1..F10 open Build folders 1-10; Ctrl+Shift+N picks a new Build folder; Ctrl+W closes the current tab; middle-click on a tab closes it.
- **Bots** - "Open new tab" added to grok.com's bot menu; middle-click / Ctrl+click on bot links opens a new tab.
- **Usage bar** - clickable Credits (opens grok.com billing), eye toggle to hide values, hover shading on clickable items.
- **About** - fork credit (DragonGitz) and "With a little help from Grok and Dragon's tokens".

### Changed
- Version bumped to 2.0.0 for the Dragonified fork; portable build named `Grok-Desktop_Portable-v2.0.0-dragonified.exe`.

## [Unreleased] (upstream-bound changes)

### Fixed
- **Link routing** - Grok/xAI links that open a new window now open in a new tab (the `<webview>` `new-window` event was removed in Electron 22+); sign-in popups (accounts.x.ai, Google, Apple, X OAuth) use a sandboxed child window; external links open in the default browser. Same-tab navigation is enforced in the main process. Allow-list moved to `src/url-policy.js` (hostname-based).
- **Usage stats** - Removed the outdated `/rest/rate-limits` per-model display (grok-3 / grok-4-heavy), which no longer reflects real usage; the bar now shows only the weekly meter and reports errors in its tooltip.

### Added
- **Weekly usage meter** - Shows the combined weekly usage % from grok.com's billing endpoint (same figure as Settings > Usage), prepaid credits, and reset time (click to toggle countdown). Tooltip shows pace and per-product breakdown.
- **Fork extras (Dragonified)** - New-tab dropdown (New Chat, Bots submenu opening bots in tabs, Open Grok Bot, Build CLI launcher with pinned/recent folders), "Open Link in New Tab" context menu, Grok CLI token fallback for the usage meter, bar polish. See [AI-GENERATED.md](AI-GENERATED.md).

### Notes
- These changes were generated by Grok (xAI's AI) via a Grok Bot coding agent at the direction of DragonGitz, who tested them but did not hand-write the code.

## [1.2.5] - 2025-12-17

### Fixed
- **Usage Stats 403 Error** - Fixed "Login required" error on Windows 11 by executing API fetch in webview context instead of main process
  - Thanks to Joshua Wang (@JoshuaWang2211) for identifying the root cause and suggesting the solution
  - API calls now run in the authenticated Grok tab context with proper session cookies and headers
  - Resolves GitHub Issue #11

### Changed
- Bump version to 1.2.5

## [1.2.4] - 2025-12-14

### Security
- **Domain Bypass Protection** - Prevents malicious subdomain attacks on trusted domains
- **Enhanced External URL Validation** - Validates protocols, hostnames, and blocks localhost/private IPs
- **Secure Update URL Validation** - Ensures GitHub release URLs are legitimate before storage
- **OAuth Domain Support** - Allows Google, Apple, and X OAuth flows to remain in-app instead of opening external browsers
- **Shortcut keys and mouse** - Added more shortcut key and mouse scroll support to tab functionality.
- **Live stats** - Added live status stats bar.

### Changed
- Bump version to 1.2.4
## [1.2.3] - 2025-11-08

### Added
- Reload button functionality and styles in the application UI
- MSI installer option added to the build script

### Changed
- Enhanced build process and artifact naming conventions; improved error handling in build script
- Added explicit compression setting to builds
- Bump version to 1.2.3

## [1.2.2] - 2025-09-20

### Security
- Updated Electron to 35.7.5 to address ASAR integrity bypass vulnerability (CVE-2025-55305, GHSA-vmxy-hx4q-j7mg)

### Changed
- Bump version to 1.2.2

## [Unreleased]

### Added
- Keyboard shortcuts in the app:
  - Ctrl+T: open new tab
  - Ctrl+Tab / Ctrl+Shift+Tab: cycle through open tabs (next/previous)
  - Ctrl+R reloads the active tab
  - Ctrl+I: open information/about dialog
### Changed
- Update Electron to 39.x (incrementally 36 → 37 → 38 → 39)
- Use electron-builder via npx in npm scripts (no global install required)

### Removed
- Remove unused dependency: electron-store
- Remove `brace-expansion` overrides after verification

### Security
- Verified `brace-expansion` advisories (CVE-2025-5889); ensured no affected versions in tree

## [1.2.1] - 2025-08-16

### Changed
- Bump version to 1.2.1
- Security: updated dev-only dependencies via overrides (form-data, brace-expansion, tmp)
- Docs: add CHANGELOG and update README
- Better dark/light mode support added
- Added support for Grok voice mode

## [1.2.0] - 2025-08-16

### Added
- Enable WebRTC/audio/recording across domains; allow autoplay without gesture
- Broadened CSP and added `webview` allow attributes (microphone, camera, autoplay, display-capture)
- Developer documentation for testing capture/recording

### Changed
- Build process refinements and UI enhancements

## [1.1.0] - 2025-03-02

### Added
- New Version 1.1.0

### Fixed
- README and documentation corrections

## [1.0.0-pre] - 2025-03-01

### Added
- Initial pre-release of Grok Desktop

 [Unreleased]: https://github.com/AnRkey/Grok-Desktop/compare/v1.2.5...HEAD
[1.2.5]: https://github.com/AnRkey/Grok-Desktop/releases/tag/v1.2.5
[1.2.4]: https://github.com/AnRkey/Grok-Desktop/releases/tag/v1.2.4
[1.2.3]: https://github.com/AnRkey/Grok-Desktop/releases/tag/v1.2.3
[1.2.2]: https://github.com/AnRkey/Grok-Desktop/releases/tag/v1.2.2
[1.2.1]: https://github.com/AnRkey/Grok-Desktop/releases/tag/v1.2.1
[1.2.0]: https://github.com/AnRkey/Grok-Desktop/releases/tag/v1.2.0
[1.1.0]: https://github.com/AnRkey/Grok-Desktop/releases/tag/v1.1.0
[1.0.0-pre]: https://github.com/AnRkey/Grok-Desktop/releases/tag/v1.0.0-pre


