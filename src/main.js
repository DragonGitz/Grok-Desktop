
const { app, BrowserWindow, shell, Menu, ipcMain, nativeTheme, session, webContents, dialog } = require('electron');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

// GPU acceleration detection and graceful fallback
function configureGpuAcceleration() {
  // Check if we're in a headless environment or container
  const isHeadless = !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
  const isContainer = fs.existsSync('/.dockerenv') || process.env.container === 'docker';

  // Check for NVIDIA/AMD GPU availability (basic detection)
  let hasGpu = false;
  try {
    // Check for NVIDIA GPU
    if (fs.existsSync('/dev/nvidia0') || process.env.NVIDIA_VISIBLE_DEVICES) {
      hasGpu = true;
    }
    // Check for AMD GPU
    if (fs.existsSync('/dev/dri/card0')) {
      hasGpu = true;
    }
  } catch (e) {
    // Ignore errors in GPU detection
  }

  // Disable GPU acceleration if:
  // 1. In headless environment
  // 2. In container without GPU passthrough
  // 3. No GPU detected
  // 4. Explicitly requested via environment variable
  const shouldDisableGpu = isHeadless || (isContainer && !hasGpu) || !hasGpu || process.env.GROK_DISABLE_GPU === 'true';

  if (shouldDisableGpu) {
    console.log('Grok Desktop: Disabling GPU acceleration for compatibility');
    app.disableHardwareAcceleration();

    // Additional GPU-related switches for better compatibility
    app.commandLine.appendSwitch('disable-gpu-compositing');
    app.commandLine.appendSwitch('disable-accelerated-video-decode');
    app.commandLine.appendSwitch('disable-accelerated-mjpeg-decode');

    // Log the reason for transparency
    const reasons = [];
    if (isHeadless) reasons.push('headless environment');
    if (isContainer && !hasGpu) reasons.push('container without GPU');
    if (!hasGpu) reasons.push('no GPU detected');
    if (process.env.GROK_DISABLE_GPU === 'true') reasons.push('explicitly disabled');

    console.log(`Grok Desktop: GPU acceleration disabled due to: ${reasons.join(', ')}`);
  } else {
    console.log('Grok Desktop: GPU acceleration enabled');
  }
}

// Configure GPU acceleration before app initialization
configureGpuAcceleration();

// Global error handler for GPU/VAAPI issues
process.on('warning', (warning) => {
  // Handle VAAPI and GPU-related warnings gracefully
  if (warning.message && (
    warning.message.includes('vaInitialize failed') ||
    warning.message.includes('VAAPI') ||
    warning.message.includes('gpu') ||
    warning.message.includes('GPU')
  )) {
    console.log('Grok Desktop: GPU warning detected, continuing with software rendering:', warning.message);
    return;
  }
  // Log other warnings normally
  console.warn(warning.name, warning.message, warning.stack);
});

// Handle uncaught exceptions related to GPU
process.on('uncaughtException', (error) => {
  if (error.message && (
    error.message.includes('vaInitialize failed') ||
    error.message.includes('VAAPI') ||
    error.message.includes('gpu') ||
    error.message.includes('GPU')
  )) {
    console.log('Grok Desktop: GPU error caught, continuing with software rendering:', error.message);
    return; // Don't exit the process
  }
  // Re-throw non-GPU errors
  throw error;
});

// Track GPU acceleration state and restart attempts
let gpuDisabled = false;
let restartAttempted = false;

// Disable GPU acceleration if we detect initialization failures
function handleGpuAcceleration() {
  // Check if we're already in fallback mode
  if (process.argv.includes('--disable-gpu') || process.env.ELECTRON_DISABLE_GPU === '1') {
    gpuDisabled = true;
    console.log('GPU acceleration disabled by flag or environment variable');
    return;
  }

  // Listen for GPU process crashes or initialization errors
  app.on('gpu-process-crashed', (event, killed) => {
    if (!killed && !gpuDisabled && !restartAttempted) {
      console.warn('GPU process crashed, attempting to restart with GPU acceleration disabled');
      event.preventDefault();
      restartWithGpuDisabled();
    }
  });

  // Monitor for VAAPI/GPU errors in stderr
  const originalStderrWrite = process.stderr.write;
  process.stderr.write = function(chunk, encoding, callback) {
    const data = chunk.toString();
    if (data.includes('vaapi') || data.includes('vaInitialize failed') ||
        data.includes('gpu_process_transport') || data.includes('gpu_init_failed')) {
      if (!gpuDisabled && !restartAttempted) {
        console.warn('GPU acceleration error detected, restarting with GPU disabled');
        restartWithGpuDisabled();
        return;
      }
    }
    return originalStderrWrite.call(this, chunk, encoding, callback);
  };
}

function restartWithGpuDisabled() {
  if (restartAttempted) return;
  restartAttempted = true;

  // Disable hardware acceleration for next start
  app.disableHardwareAcceleration();

  // Show a brief notification to user about fallback mode
  console.log('Restarting Grok Desktop with GPU acceleration disabled for compatibility...');

  // Restart the app
  app.relaunch({ args: [...process.argv.slice(1), '--disable-gpu'] });
  app.exit(0);
}

// Initialize GPU handling before app setup
handleGpuAcceleration();

// Handle open-external-url from renderer with enhanced validation
ipcMain.handle('open-external-url', async (_event, url) => {
  try {
    // Basic type and protocol validation
    if (typeof url !== 'string' || !url.startsWith('http')) {
      return false;
    }

    // Parse URL to validate format and prevent malicious schemes
    const urlObj = new URL(url);

    // Ensure it's HTTP or HTTPS (not javascript:, data:, etc.)
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }

    // Basic URL validation - ensure hostname exists and is reasonable
    if (!urlObj.hostname || urlObj.hostname.length === 0 || urlObj.hostname.length > 253) {
      return false;
    }

    // Prevent localhost/private IP access for external URLs
    const hostname = urlObj.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
        hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
        hostname.startsWith('172.')) {
      return false;
    }

    await shell.openExternal(url);
    return true;
  } catch (error) {
    // Invalid URL format
    return false;
  }
});
const path = require('path');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;
let aboutWindow;

// Allow autoplay without user gesture (for seamless audio playback)
try { app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); } catch (_) {}

// URL policy shared with the renderer (which hosts stay in-app vs. open in browser)
const { isInAppUrl, isAuthPopupUrl, isSafeExternalUrl } = require('./url-policy');

// Enforce single instance
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Track webContents that should always use light color scheme
const forcedLightWebContentsIds = new Set();

// Always On Top (AOT) functionality for cross-platform compatibility
// Windows: Uses Electron's built-in setAlwaysOnTop() method
// Linux: Uses wmctrl command-line tool for better GNOME/Wayland compatibility
// If running under Wayland on Linux, automatically restarts with X11 forced

let wmctrlAvailable = false;
let isWayland = false;
let x11Forced = false;

function checkWmctrlAvailability() {
  if (os.platform() !== 'linux') return;

  // Check if we're running under Wayland (Rocky Linux 10 defaults to Wayland)
  isWayland = !!process.env.WAYLAND_DISPLAY || !!process.env.XDG_SESSION_TYPE?.includes('wayland');
  x11Forced = process.argv.includes('--ozone-platform=x11');

  console.log(`Grok Desktop: Display server detection - Wayland: ${isWayland}, X11 forced: ${x11Forced}`);

  if (isWayland && !x11Forced) {
    console.log('Grok Desktop: Running under Wayland, forcing X11 for AOT compatibility');
    // GNOME on Wayland intentionally restricts programmatic AOT for security
    // We force X11 mode where wmctrl works reliably
    forceX11Mode();
    return;
  }

  // Check if wmctrl is available (install with: sudo dnf install wmctrl on Rocky Linux)
  exec('which wmctrl', (error) => {
    wmctrlAvailable = !error;
    if (wmctrlAvailable) {
      console.log('Grok Desktop: wmctrl available for AOT fallback');
    } else {
      console.warn('Grok Desktop: wmctrl not available, AOT may not work on this system');
      console.warn('Grok Desktop: Install wmctrl with: sudo dnf install wmctrl');
    }
  });
}

function forceX11Mode() {
  console.log('Grok Desktop: Relaunching with X11 for AOT compatibility...');

  // Relaunch with X11 forced to enable wmctrl functionality
  const newArgs = [...process.argv.slice(1), '--ozone-platform=x11'];
  app.relaunch({
    args: newArgs,
    env: { ...process.env, OZONE_PLATFORM: 'x11', ELECTRON_USE_X11: '1' }
  });
  app.exit(0);
}

// Fallback AOT toggle using wmctrl on Linux
function toggleAlwaysOnTopLinux(mainWindow) {
  if (!wmctrlAvailable) return false;

  return new Promise((resolve) => {
    // Get the window title to target it specifically
    const windowTitle = mainWindow.getTitle() || 'Grok Desktop';

    // First focus the window, then toggle always-on-top
    const commands = [
      `wmctrl -a "${windowTitle}"`,  // Focus/activate the window
      `wmctrl -r "${windowTitle}" -b toggle,above`  // Toggle always-on-top
    ];

    exec(commands.join(' && '), (error) => {
      if (error) {
        console.warn('Grok Desktop: wmctrl AOT toggle failed:', error.message);
        resolve(false);
      } else {
        console.log('Grok Desktop: AOT toggled via wmctrl');
        resolve(true);
      }
    });
  });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true, // Enable Node.js integration
      contextIsolation: false, // Disable context isolation for this use case
      webviewTag: true, // Enable webview tag for tabs
      spellcheck: true
    },
    icon: path.join(__dirname, 'grok.png')
  });

  // Disable the menu bar
  Menu.setApplicationMenu(null);

  // Ensure shortcuts work when focus is on the main window UI
  try { attachShortcutHandlers(mainWindow.webContents); } catch (_) {}

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  // Configure spellchecker languages for default session and webview partition
  try {
    const locale = (typeof app.getLocale === 'function' && app.getLocale()) || 'en-US';
    const languages = Array.isArray(locale) ? locale : [locale];

    const defaultSession = session.defaultSession;
    if (defaultSession) {
      if (typeof defaultSession.setSpellCheckerEnabled === 'function') {
        defaultSession.setSpellCheckerEnabled(true);
      }
      if (typeof defaultSession.setSpellCheckerLanguages === 'function') {
        defaultSession.setSpellCheckerLanguages(languages);
      }
    }

    const grokSession = session.fromPartition('persist:grok');
    if (grokSession) {
      if (typeof grokSession.setSpellCheckerEnabled === 'function') {
        grokSession.setSpellCheckerEnabled(true);
      }
      if (typeof grokSession.setSpellCheckerLanguages === 'function') {
        grokSession.setSpellCheckerLanguages(languages);
      }
    }
  } catch (_) {}

  // Send initial theme and listen for OS theme changes
  const sendTheme = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-theme-updated', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  };
  sendTheme();
  // Apply color scheme to all web contents (main and webviews)
  const applyColorSchemeToAll = () => {
    const scheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    try {
      webContents.getAllWebContents().forEach((wc) => {
        if (typeof wc.setColorScheme === 'function') {
          if (forcedLightWebContentsIds.has(wc.id)) {
            wc.setColorScheme('light');
          } else {
            wc.setColorScheme(scheme);
          }
        }
      });
    } catch (_) {}
  };
  applyColorSchemeToAll();

  nativeTheme.on('updated', () => {
    sendTheme();
    applyColorSchemeToAll();
  });

  // Open DevTools in development mode
  // mainWindow.webContents.openDevTools();

  // Handle window closed event
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set up URL handling
  setupUrlHandling();

  // Set up IPC handlers
  setupIpcHandlers();

  // Set up WebRTC/media permissions (allow across all domains)
  setupPermissions();

  // Enable right-click context menus
  setupContextMenus();

  // Set up keyboard shortcuts (Ctrl+T, Ctrl+Tab, Ctrl+R)
  setupKeyboardShortcuts();

  // Ensure newly created webContents/webviews get correct color scheme
  app.on('web-contents-created', (_event, contents) => {
    const scheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    if (typeof contents.setColorScheme === 'function') {
      if (forcedLightWebContentsIds.has(contents.id)) {
        contents.setColorScheme('light');
      } else {
        contents.setColorScheme(scheme);
      }
    }
    contents.on('did-attach-webview', (_e, wc) => {
      if (wc && typeof wc.setColorScheme === 'function') {
        if (forcedLightWebContentsIds.has(wc.id)) {
          wc.setColorScheme('light');
        } else {
          wc.setColorScheme(scheme);
        }
      }
    });
  });
}

// Create window when Electron has finished initialization
app.whenReady().then(() => {
  checkWmctrlAvailability();
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle URL navigation and determine if URLs should be opened internally
function setupUrlHandling() {
  // Handle navigation events from webContents
  app.on('web-contents-created', (event, contents) => {
    // New-window requests (target=_blank, window.open). Electron removed the
    // <webview> 'new-window' event, so routing must happen here:
    //  - sign-in popups (Google/Apple/X OAuth) get a real child window so
    //    window.opener/postMessage flows keep working
    //  - other Grok/xAI links open in a new in-app tab
    //  - everything else opens in the default browser
    contents.setWindowOpenHandler(({ url }) => {
      if (isAuthPopupUrl(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 600,
            height: 760,
            autoHideMenuBar: true,
            webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
          }
        };
      }
      if (isInAppUrl(url)) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('open-url-in-new-tab', url);
        }
      } else if (isSafeExternalUrl(url)) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // Same-tab navigation inside Grok tabs: keep Grok/xAI/sign-in pages in-app,
    // send genuinely external links to the default browser.
    if (contents.getType() === 'webview') {
      contents.on('will-navigate', (e, url) => {
        if (!isInAppUrl(url)) {
          e.preventDefault();
          if (isSafeExternalUrl(url)) shell.openExternal(url);
        }
      });
    }
  });
}

// ---- Weekly usage (shared credit pool) -----------------------------------
const BILLING_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits';

// Optional response logging for diagnosing usage stats. Enabled when the env
// var GROK_DESKTOP_USAGE_DEBUG=1 is set or a file named "usage-debug" exists in
// the userData folder. Writes response bodies (never tokens) to
// <userData>/usage-debug.log.
function logUsageDebug(payload) {
  try {
    const dir = app.getPath('userData');
    if (process.env.GROK_DESKTOP_USAGE_DEBUG !== '1' && !fs.existsSync(path.join(dir, 'usage-debug'))) return;
    fs.appendFileSync(path.join(dir, 'usage-debug.log'), new Date().toISOString() + ' ' + JSON.stringify(payload) + '\n');
  } catch (_) {}
}

// Bearer token from a signed-in Grok CLI (~/.grok/auth.json), if present and unexpired.
function readGrokCliToken() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.grok', 'auth.json'), 'utf8'));
    for (const entry of Object.values(data || {})) {
      if (!entry || typeof entry.key !== 'string' || !entry.key) continue;
      if (entry.expires_at && Date.parse(entry.expires_at) <= Date.now()) continue;
      return entry.key;
    }
  } catch (_) {}
  return null;
}

// Returns { usagePercent, periodEnd, periodType, products, auth } or { error }.
async function fetchWeeklyBilling(ses) {
  const cents = (v) => {
    const n = v && typeof v === 'object' ? Number(v.val) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const parse = (json, auth) => {
    const c = json && json.config;
    if (!c || typeof c.creditUsagePercent !== 'number') return null;
    return {
      usagePercent: c.creditUsagePercent,
      periodEnd: (c.currentPeriod && c.currentPeriod.end) || c.billingPeriodEnd || null,
      periodType: c.currentPeriod && c.currentPeriod.type,
      periodStart: (c.currentPeriod && c.currentPeriod.start) || c.billingPeriodStart || null,
      products: Array.isArray(c.productUsage) ? c.productUsage : [],
      // Money fields are int64 wrappers ({ val }) in cents, e.g. prepaidBalance: { val: 257 } = $2.57
      prepaidCents: cents(c.prepaidBalance),
      onDemandUsedCents: cents(c.onDemandUsed),
      onDemandCapCents: cents(c.onDemandCap),
      auth
    };
  };
  const attempts = [];
  // 1) The in-app grok.com session cookies
  if (ses && typeof ses.fetch === 'function') {
    attempts.push(['session', () => ses.fetch(BILLING_URL, { credentials: 'include' })]);
  }
  // 2) Grok CLI bearer token
  const token = readGrokCliToken();
  if (token) {
    attempts.push(['grok-cli', () => session.defaultSession.fetch(BILLING_URL, {
      headers: { Authorization: 'Bearer ' + token }, credentials: 'omit'
    })]);
  }
  const errors = [];
  for (const [auth, run] of attempts) {
    try {
      const res = await run();
      if (!res.ok) { errors.push(auth + ':HTTP ' + res.status); continue; }
      const parsed = parse(await res.json(), auth);
      if (parsed) return parsed;
      errors.push(auth + ':BAD_RESPONSE');
    } catch (e) {
      errors.push(auth + ':' + e.message);
    }
  }
  return { error: errors.join(', ') || 'NO_AUTH' };
}

// Set up IPC handlers for renderer-to-main process communication
function setupIpcHandlers() {
  // Handle always-on-top toggle
  ipcMain.handle('toggle-always-on-top', async () => {
    if (!mainWindow) return false;

    // On Linux, use wmctrl if available for better GNOME compatibility
    if (os.platform() === 'linux') {
      if (wmctrlAvailable) {
        const result = await toggleAlwaysOnTopLinux(mainWindow);
        if (result) return true;
      } else {
        console.warn('Grok Desktop: wmctrl not available on Linux, AOT may not work');
      }
      // Fall back to Electron method if wmctrl fails or isn't available
    }

    // Use Electron's built-in method (works on Windows/macOS, may not work reliably on Linux GNOME/Wayland)
    try {
      const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
      mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
      return !isAlwaysOnTop;
    } catch (error) {
      console.warn('Grok Desktop: Electron AOT toggle failed:', error.message);
      return false;
    }
  });

  // Provide app version to renderer
  ipcMain.handle('get-app-version', () => {
    try {
      return app.getVersion();
    } catch (_) {
      return '0.0.0';
    }
  });

  // Open About page in a new tab instead of a window
  ipcMain.handle('show-app-info', async () => {
    const name = typeof app.getName === 'function' ? app.getName() : 'Grok Desktop';
    const version = typeof app.getVersion === 'function' ? app.getVersion() : '0.0.0';
    const repoUrl = 'https://github.com/AnRkey/Grok-Desktop';

    // Build the about page URL with parameters
    const urlObj = new URL(`file://${path.join(__dirname, '../about.html')}`);
    urlObj.searchParams.set('name', name);
    urlObj.searchParams.set('version', version);
    urlObj.searchParams.set('repo', repoUrl);

    // Derive developer/contact from the GitHub repo URL
    let developer = 'AnRkey';
    try {
      const m = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)/i);
      if (m && m[1]) developer = m[1];
    } catch (_) {}
    const contactUrl = 'https://github.com/AnRkey/Grok-Desktop/discussions';
    urlObj.searchParams.set('developer', developer);
    urlObj.searchParams.set('contact', contactUrl);
    urlObj.searchParams.set('credit', 'With a little help from Grok and Dragon\u2019s tokens');

    // Send the URL to the renderer to create a new tab
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('open-about-tab', urlObj.toString());
    }

    return { name, version };
  });

  // Weekly usage meter (grok.com Settings > Usage), fetched with the in-app
  // grok.com session (persist:grok partition).
  ipcMain.handle('fetch-grok-usage', async () => {
    try {
      const weekly = await fetchWeeklyBilling(session.fromPartition('persist:grok'));
      logUsageDebug({ weekly });
      return { weekly };
    } catch (error) {
      return { weekly: { error: error.message } };
    }
  });

  // Force light/dynamic color scheme for specific webContents id
  ipcMain.handle('force-light-color-scheme', (_event, wcId, shouldForceLight) => {
    try {
      const wc = webContents.fromId(wcId);
      if (!wc) return false;
      if (shouldForceLight) {
        forcedLightWebContentsIds.add(wcId);
        if (typeof wc.setColorScheme === 'function') wc.setColorScheme('light');
        // Stronger override via DevTools Protocol: emulate prefers-color-scheme: light
        try {
          if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
          wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value: 'light' }]
          });
        } catch (_) {}
      } else {
        forcedLightWebContentsIds.delete(wcId);
        const scheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        if (typeof wc.setColorScheme === 'function') wc.setColorScheme(scheme);
        // Remove emulation
        try {
          if (wc.debugger.isAttached()) {
            wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
            wc.debugger.detach();
          }
        } catch (_) {}
      }
      return true;
    } catch (_) {
      return false;
    }
  });
} 

// Enable context menus across the app (window and webviews)
// ---- New-tab dropdown: New Chat / Grok Bot / Build CLI -------------------
// Small JSON settings file in userData (Build CLI pinned + recent folders).
const settingsPath = () => path.join(app.getPath('userData'), 'grok-desktop-settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) || {}; } catch (_) { return {}; }
}
function writeSettings(patch) {
  try { fs.writeFileSync(settingsPath(), JSON.stringify({ ...readSettings(), ...patch }, null, 2)); } catch (_) {}
}
function whichSync(cmd) {
  try {
    const out = require('child_process').execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/).find(Boolean) || null;
  } catch (_) { return null; }
}
const existsSafe = (p) => { try { return !!p && fs.existsSync(p); } catch (_) { return false; } };

// Grok Bot desktop app: known install paths, else its registered grokbot:// protocol.
function findGrokBot() {
  const exe = process.platform === 'win32' ? 'Grok Bot.exe' : null;
  const candidates = exe ? [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Grok Bot', exe),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Grok Bot', exe)
  ] : [];
  const found = candidates.find(existsSafe);
  if (found) return { exe: found };
  try { if (app.getApplicationNameForProtocol('grokbot://')) return { protocol: 'grokbot://' }; } catch (_) {}
  return null;
}

// Grok CLI: ~/.grok/bin/grok(.exe) (default installer location) or "grok" on PATH.
function findGrokCli() {
  const local = path.join(os.homedir(), '.grok', 'bin', process.platform === 'win32' ? 'grok.exe' : 'grok');
  return existsSafe(local) ? local : whichSync('grok');
}

function launchCliIn(folder, cli) {
  const { spawn } = require('child_process');
  const opts = { cwd: folder, detached: true, stdio: 'ignore' };
  try {
    if (process.platform === 'win32') {
      const wt = whichSync('wt');
      if (wt) spawn(wt, ['-d', folder, cli], opts).unref();
      else spawn('cmd.exe', ['/k', cli], { ...opts, windowsHide: false }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', folder], opts).unref();
    } else {
      spawn('x-terminal-emulator', ['-e', cli], opts).unref();
    }
  } catch (e) {
    dialog.showErrorBox('Grok Desktop', 'Could not open a terminal: ' + e.message);
  }
}

const MAX_RECENT = 10;
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function buildFolders() {
  const st = readSettings();
  const pinned = Array.isArray(st.buildPinned) ? st.buildPinned : [];
  const recent = (Array.isArray(st.buildRecent) ? st.buildRecent : [])
    .filter(f => existsSafe(f) && !pinned.some(p => samePath(p, f)))
    .slice(0, MAX_RECENT);
  return { pinned, recent };
}
function saveFolders(pinned, recent) {
  writeSettings({ buildPinned: pinned, buildRecent: recent.slice(0, MAX_RECENT) });
}
function touchRecent(folder) {
  const { pinned, recent } = buildFolders();
  saveFolders(pinned, [folder, ...recent.filter(f => !samePath(f, folder))]);
}

async function pickBuildFolder() {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder for Grok Build CLI', properties: ['openDirectory', 'createDirectory'],
    defaultPath: buildFolders().recent[0] || os.homedir()
  });
  return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
}

const BOT_DOM_HELPERS = `
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const botPath = (a) => { try { const p = new URL(a.getAttribute('href'), location.href).pathname; return /^\\/bot\\/[^/?#]+/.test(p) ? p : null; } catch (_) { return null; } };
  const botLinks = () => [...document.querySelectorAll('a[href]')].filter(botPath);
  const leafText = (e) => (e.textContent || '').trim();
  const heading = [...document.querySelectorAll('nav *, aside *')].find(e => !e.children.length && leafText(e) === 'Bots');
  const after = (e) => !heading || (heading.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
  // "Show more" / "Show less" may be a button or a plain clickable element
  const findToggle = (label) => {
    const leaf = [...document.querySelectorAll('nav *, aside *')].find(e => after(e) && leafText(e) === label && e.children.length <= 1);
    return leaf ? (leaf.closest('button, [role="button"]') || leaf) : null;
  };
  // Wait until the number of bot links stops changing (or timeout)
  const settle = async (timeout = 2000) => {
    let last = -1, stable = 0;
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const n = botLinks().length;
      if (n === last) { if (++stable >= 3) return; } else { stable = 0; last = n; }
      await sleep(100);
    }
  };
  const expand = async () => {
    const more = findToggle('Show more');
    if (!more) return false;
    more.click();
    await settle();
    return true;
  };
  const collapse = (expanded) => { if (expanded) { const less = findToggle('Show less'); if (less) less.click(); } };
  // A bot is pinned when the nearest section label above it (in the Bots area) is "Pinned"
  const sectionOf = (a) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    w.currentNode = a;
    for (let n = w.previousNode(); n; n = w.previousNode()) {
      if (n === heading) return null;
      if (n.children.length || n.closest('a, button, [role="button"]')) continue;
      const t = leafText(n);
      if (t && t.length < 40) return t;
    }
    return null;
  };
`;

// Bots listed in grok.com's sidebar (links to /bot/<id>, the app route in
// grok.com's bundle). grok.com loads bots through an internal relay client
// with no simple REST endpoint, so they are read from the signed-in Grok
// tab's sidebar: "Show more" is expanded until the list settles, then
// collapsed again. Pinned state comes from the sidebar's "Pinned" section.
const SCRAPE_BOTS_JS = `(async () => {${BOT_DOM_HELPERS}
  const expanded = await expand();
  const out = [], seen = new Set();
  botLinks().forEach(a => {
    const url = new URL(a.getAttribute('href'), location.href).href;
    if (seen.has(url)) return;
    const name = (a.innerText || a.textContent || '').trim().split('\\n')[0].trim();
    if (!name) return;
    const img = a.querySelector('img');
    seen.add(url);
    out.push({ name, url, avatar: img && /^https:/.test(img.src) ? img.src : null, pinned: sectionOf(a) === 'Pinned' });
  });
  collapse(expanded);
  return out.slice(0, 50);
})()`;

// Pin/unpin a bot using grok.com's own bot menu (right-click / "..." -> Pin),
// so the change is saved to the account exactly as if done in the sidebar.
const setBotPinnedJs = (url, pinned) => `(async () => {${BOT_DOM_HELPERS}
  const target = new URL(${JSON.stringify(url)}).pathname;
  const expanded = await expand();
  try {
    const a = botLinks().find(x => botPath(x) === target);
    if (!a) return { error: 'bot not found in sidebar' };
    if ((sectionOf(a) === 'Pinned') === ${pinned ? 'true' : 'false'}) return { ok: true, unchanged: true };
    const wantLabel = ${JSON.stringify(pinned ? 'Pin' : 'Unpin')};
    const findItem = () => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
      .find(i => leafText(i) === wantLabel);
    const waitItem = async () => { for (let i = 0; i < 20; i++) { const it = findItem(); if (it) return it; await sleep(50); } return null; };
    const r = a.getBoundingClientRect();
    a.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 10, clientY: r.top + 10 }));
    let item = await waitItem();
    if (!item) {
      // Fall back to the row's "..." button (Radix menus open on pointerdown)
      let row = a;
      for (let i = 0; i < 6 && row && !row.querySelector('button'); i++) row = row.parentElement;
      const btn = row && [...row.querySelectorAll('button')].pop();
      if (btn) {
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
        btn.click();
        item = await waitItem();
      }
    }
    if (!item) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { error: 'Pin menu item not found' };
    }
    item.click();
    await sleep(400);
    return { ok: true };
  } finally {
    collapse(expanded);
  }
})()`;
function findGrokTab() {
  return webContents.getAllWebContents().find(c => {
    try { return c.getType() === 'webview' && new URL(c.getURL()).hostname === 'grok.com'; } catch (_) { return false; }
  });
}
async function getBots(fresh) {
  const wc = fresh && findGrokTab();
  if (wc) {
    try {
      const bots = await Promise.race([wc.executeJavaScript(SCRAPE_BOTS_JS), new Promise(r => setTimeout(() => r(null), 4000))]);
      if (Array.isArray(bots) && bots.length) {
        writeSettings({ bots });
        logUsageDebug({ bots });
        return bots;
      }
    } catch (_) {}
  }
  const cached = readSettings().bots;
  return Array.isArray(cached) ? cached.filter(b => b && isInAppUrl(b.url)) : [];
}

// Keep the bot cache warm so the first flyout open is complete: refresh a
// few seconds after a grok.com tab loads, and every 5 minutes.
let botRefreshTimer = null;
function scheduleBotRefresh(delay) {
  clearTimeout(botRefreshTimer);
  botRefreshTimer = setTimeout(() => { getBots(true).catch(() => {}); }, delay);
}
setInterval(() => { if (findGrokTab()) getBots(true).catch(() => {}); }, 5 * 60 * 1000);

ipcMain.handle('bot-set-pinned', async (_event, { url, pinned } = {}) => {
  const wc = findGrokTab();
  if (!wc || typeof url !== 'string' || !isInAppUrl(url)) return { error: 'No Grok tab open' };
  try {
    const res = await Promise.race([
      wc.executeJavaScript(setBotPinnedJs(url, !!pinned)),
      new Promise(r => setTimeout(() => r({ error: 'timeout' }), 6000))
    ]);
    return { ...res, bots: await getBots(true) };
  } catch (e) {
    return { error: e.message };
  }
});

// Data for the renderer's new-tab flyout
ipcMain.handle('new-tab-menu-data', async (_event, opts) => {
  const cli = findGrokCli();
  const { pinned, recent } = buildFolders();
  return {
    bots: await getBots(!!(opts && opts.fresh)),
    botApp: !!findGrokBot(),
    cli: !!cli,
    pty: !!(pty && cli),
    pinned,
    recent,
    missing: pinned.filter(f => !existsSafe(f))
  };
});
ipcMain.handle('open-grok-bot', () => {
  const bot = findGrokBot();
  if (!bot) return false;
  if (bot.exe) shell.openPath(bot.exe); else shell.openExternal(bot.protocol);
  return true;
});
ipcMain.handle('build-pick-folder', () => pickBuildFolder());
ipcMain.handle('build-launch-external', (_event, folder) => {
  const cli = findGrokCli();
  if (cli && existsSafe(folder)) launchCliIn(folder, cli);
});
ipcMain.handle('build-folders-update', (_event, { action, folder } = {}) => {
  if (typeof folder !== 'string' || !folder) return buildFolders();
  const { pinned, recent } = buildFolders();
  const without = (list) => list.filter(f => !samePath(f, folder));
  if (action === 'touch') {
    if (!pinned.some(p => samePath(p, folder))) saveFolders(pinned, [folder, ...without(recent)]);
  } else if (action === 'pin') {
    saveFolders([...without(pinned), folder], without(recent));
  } else if (action === 'unpin') {
    saveFolders(without(pinned), [folder, ...without(recent)]);
  } else if (action === 'remove') {
    saveFolders(without(pinned), without(recent));
  }
  return buildFolders();
});

// ---- Embedded Build CLI terminals (node-pty, prebuilt binaries) -----------
let pty = null;
try { pty = require('@lydell/node-pty'); } catch (e) { console.warn('Grok Desktop: node-pty unavailable, Build CLI opens externally:', e.message); }
const ptys = new Map();
let ptySeq = 0;
ipcMain.handle('pty-spawn', (event, { cwd, cols, rows } = {}) => {
  const cli = findGrokCli();
  if (!pty) return { error: 'terminal support (node-pty) is not available' };
  if (!cli) return { error: 'grok CLI not found' };
  if (!existsSafe(cwd)) return { error: 'folder not found: ' + cwd };
  const id = ++ptySeq;
  let p;
  try {
    p = pty.spawn(cli, [], {
      name: 'xterm-256color',
      cols: Math.max(20, cols | 0 || 80),
      rows: Math.max(5, rows | 0 || 24),
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
    });
  } catch (e) {
    return { error: e.message };
  }
  ptys.set(id, p);
  const wc = event.sender;
  p.onData(d => { if (!wc.isDestroyed()) wc.send('pty-data', id, d); });
  p.onExit(({ exitCode }) => {
    ptys.delete(id);
    if (!wc.isDestroyed()) wc.send('pty-exit', id, exitCode);
  });
  return { id };
});
ipcMain.on('pty-write', (_event, id, data) => { const p = ptys.get(id); if (p) p.write(data); });
ipcMain.on('pty-resize', (_event, id, cols, rows) => {
  const p = ptys.get(id);
  if (p && cols > 0 && rows > 0) { try { p.resize(cols, rows); } catch (_) {} }
});
ipcMain.on('pty-kill', (_event, id) => {
  const p = ptys.get(id);
  if (p) { ptys.delete(id); try { p.kill(); } catch (_) {} }
});
app.on('before-quit', () => { for (const p of ptys.values()) { try { p.kill(); } catch (_) {} } ptys.clear(); });

// Adds "Open new tab" to grok.com's bot "..." / right-click menu (which lacks
// it, unlike chats) and makes middle-click / Ctrl+click on bot links open a
// new tab. Injected into grok.com pages; window.open is routed to a new
// in-app tab by setWindowOpenHandler.
const BOT_MENU_INJECT_JS = `(() => {
  if (window.__gdBotMenu) return;
  window.__gdBotMenu = true;
  const SEL = 'a[href*="/bot/"]';
  const botUrl = (el) => {
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 8; n = n.parentElement, i++) {
      if (n.matches(SEL)) return n.href;
      const found = n.querySelectorAll(SEL);
      if (found.length === 1) return found[0].href;
      if (found.length > 1) return null;
    }
    return null;
  };
  let last = { url: null, t: 0 };
  const remember = (e) => { last = { url: botUrl(e.target), t: Date.now() }; };
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('contextmenu', remember, true);
  const openTab = (url) => window.open(url, '_blank');
  document.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const a = e.target.closest && e.target.closest(SEL);
    if (a) { e.preventDefault(); e.stopPropagation(); openTab(a.href); }
  }, true);
  document.addEventListener('click', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
    const a = e.target.closest && e.target.closest(SEL);
    if (a) { e.preventDefault(); e.stopPropagation(); openTab(a.href); }
  }, true);
  const ICON = '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  new MutationObserver(() => {
    if (!last.url || Date.now() - last.t > 4000) return;
    document.querySelectorAll('[role="menu"]').forEach(menu => {
      if (menu.__gdDone) return;
      const items = menu.querySelectorAll('[role="menuitem"]');
      if (!items.length) return;
      menu.__gdDone = true;
      if ([...items].some(i => /open (in )?new tab/i.test(i.textContent))) return;
      const url = last.url;
      const item = items[0].cloneNode(true);
      item.removeAttribute('data-highlighted');
      item.removeAttribute('id');
      const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (t.nodeValue.trim()) { t.nodeValue = 'Open new tab'; break; }
      }
      const svg = item.querySelector('svg');
      if (svg) { svg.setAttribute('viewBox', '0 0 24 24'); svg.innerHTML = ICON; }
      item.addEventListener('mouseenter', () => item.setAttribute('data-highlighted', ''));
      item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
      const activate = (e) => {
        e.preventDefault(); e.stopPropagation();
        openTab(url);
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      };
      item.addEventListener('pointerup', activate, true);
      item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
      items[0].parentElement.insertBefore(item, items[0]);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})()`;
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.on('dom-ready', () => {
    try {
      if (new URL(contents.getURL()).hostname === 'grok.com') {
        contents.executeJavaScript(BOT_MENU_INJECT_JS).catch(() => {});
        scheduleBotRefresh(4000);
      }
    } catch (_) {}
  });
});

function setupContextMenus() {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('context-menu', (event, params) => {
      const template = [];

      // Spell-check suggestions (when right-clicking a misspelled word)
      if (params.misspelledWord && params.misspelledWord.trim()) {
        const suggestions = Array.isArray(params.dictionarySuggestions)
          ? params.dictionarySuggestions.slice(0, 6)
          : [];

        if (suggestions.length > 0 && typeof contents.replaceMisspelling === 'function') {
          suggestions.forEach((suggestion) => {
            template.push({
              label: suggestion,
              click: () => contents.replaceMisspelling(suggestion)
            });
          });
        }

        // Allow adding the word to the custom dictionary for this session
        if (contents.session && typeof contents.session.addWordToSpellCheckerDictionary === 'function') {
          template.push({
            label: `Add to Dictionary: "${params.misspelledWord}"`,
            click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
          });
        }

        if (template.length > 0) {
          template.push({ type: 'separator' });
        }
      }

      // Link options
      if (params.linkURL && isInAppUrl(params.linkURL) && mainWindow) {
        template.push({
          label: 'Open Link in New Tab',
          click: () => mainWindow.webContents.send('open-url-in-new-tab', params.linkURL)
        });
      }
      if (params.linkURL) {
        template.push({
          label: 'Open Link in Browser',
          click: () => shell.openExternal(params.linkURL)
        });
      }

      // Image options
      if (params.hasImageContents && params.srcURL) {
        template.push({
          label: 'Save Image As…',
          click: () => contents.downloadURL(params.srcURL)
        });
      }

      // Edit actions
      if (params.isEditable) {
        template.push(
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        );
      } else if (params.selectionText && params.selectionText.trim()) {
        template.push({ role: 'copy' }, { type: 'separator' });
      }

      // Navigation (for webviews/pages)
      const canGoBack = contents.navigationHistory && typeof contents.navigationHistory.canGoBack === 'function' && contents.navigationHistory.canGoBack();
      const canGoForward = contents.navigationHistory && typeof contents.navigationHistory.canGoForward === 'function' && contents.navigationHistory.canGoForward();
      template.push(
        { label: 'Back', enabled: canGoBack, click: () => contents.navigationHistory && contents.navigationHistory.goBack && contents.navigationHistory.goBack() },
        { label: 'Forward', enabled: canGoForward, click: () => contents.navigationHistory && contents.navigationHistory.goForward && contents.navigationHistory.goForward() },
        { label: 'Reload', click: () => contents.reload && contents.reload() }
      );


      const menu = Menu.buildFromTemplate(template);
      const win = BrowserWindow.fromWebContents(contents);
      if (win) menu.popup({ window: win });
    });
  });
}

// Allow all media-related permissions for all domains (both default and persist:grok sessions)
function setupPermissions() {
  const enableForSession = (targetSession) => {
    if (!targetSession) return;
    try {
      // Always grant permission checks
      if (typeof targetSession.setPermissionCheckHandler === 'function') {
        targetSession.setPermissionCheckHandler(() => true);
      }
      // Always grant runtime permission requests
      if (typeof targetSession.setPermissionRequestHandler === 'function') {
        targetSession.setPermissionRequestHandler((_wc, _permission, callback, _details) => {
          try { callback(true); } catch (_) {}
        });
      }
      // Best-effort: allow device and display capture if supported by current Electron
      if (typeof targetSession.setDevicePermissionHandler === 'function') {
        targetSession.setDevicePermissionHandler(() => true);
      }
      if (typeof targetSession.setDisplayMediaRequestHandler === 'function') {
        targetSession.setDisplayMediaRequestHandler((_wc, request, callback) => {
          // Approve requested audio/video capture; defer exact source selection to default behavior
          try { callback({ video: !!request.video, audio: !!request.audio }); } catch (_) {}
        });
      }
    } catch (_) {}
  };

  try { enableForSession(session.defaultSession); } catch (_) {}
  try { enableForSession(session.fromPartition('persist:grok')); } catch (_) {}

  // Ensure any future sessions/webviews also have audio unmuted
  try {
    app.on('web-contents-created', (_event, contents) => {
      try { if (typeof contents.setAudioMuted === 'function') contents.setAudioMuted(false); } catch (_) {}
    });
  } catch (_) {}
}

// Keyboard shortcuts wired at the webContents level so they work in webviews too
function setupKeyboardShortcuts() {
  try {
    app.on('web-contents-created', (_event, contents) => attachShortcutHandlers(contents));
  } catch (_) {}
}

function attachShortcutHandlers(contents) {
  try {
    contents.on('before-input-event', (event, input) => {
      try {
        // Only handle keyDown with Control on Windows/Linux
        if (input.type !== 'keyDown') return;
        // F1..F10 -> Build CLI folders (pinned, then recent)
        if (!input.control && !input.alt && !input.shift && !input.meta && /^F([1-9]|10)$/.test(input.key)) {
          const h = contents.hostWebContents || contents;
          const w = BrowserWindow.fromWebContents(h);
          if (w && !w.isDestroyed()) {
            event.preventDefault();
            w.webContents.send('shortcut-build-index', Number(input.key.slice(1)));
          }
          return;
        }
        if (!input.control) return;

        const key = input.key;
        // Deliver to the hosting window (handles webviews as well)
        const host = contents.hostWebContents || contents;
        const win = BrowserWindow.fromWebContents(host);
        if (!win || win.isDestroyed()) return;

        // Ctrl+Shift+1..9,0 -> bots 1..10
        if (input.shift && /^Digit[0-9]$/.test(input.code || '')) {
          event.preventDefault();
          win.webContents.send('shortcut-bot-index', Number(input.code.slice(5)) || 10);
          return;
        }
        // Ctrl+Shift+N -> Build CLI in a new folder
        if (input.shift && (key === 'n' || key === 'N')) {
          event.preventDefault();
          win.webContents.send('shortcut-build-new');
          return;
        }

        // Ctrl+K -> Remap to Ctrl+Shift+K for grok.com search
        // grok.com responds to Ctrl+Shift+K, not Ctrl+K (which Chromium intercepts for omnibox)
        if ((key === 'k' || key === 'K') && !input.shift && contents.getType() === 'webview') {
          event.preventDefault();
          // Send Ctrl+Shift+K to the webContents using sendInputEvent (creates trusted OS-level events)
          contents.sendInputEvent({
            type: 'keyDown',
            keyCode: 'K',
            modifiers: ['control', 'shift']
          });
          // Send keyUp after a short delay
          setTimeout(() => {
            try {
              contents.sendInputEvent({
                type: 'keyUp',
                keyCode: 'K',
                modifiers: ['control', 'shift']
              });
            } catch (_) {}
          }, 10);
          return;
        }
        // Don't intercept Ctrl+Shift+K - let it pass through naturally (it already works)

        // Ctrl+T -> new tab
        if (key === 't' || key === 'T') {
          event.preventDefault();
          win.webContents.send('shortcut-new-tab');
          return;
        }
        // Ctrl+Tab -> next tab, Ctrl+Shift+Tab -> previous tab
        if (key === 'Tab') {
          event.preventDefault();
          if (input.shift) {
            win.webContents.send('shortcut-prev-tab');
          } else {
            win.webContents.send('shortcut-next-tab');
          }
          return;
        }
        // Ctrl+R -> reload active tab (override default window reload)
        if ((key === 'r' || key === 'R') && contents.getType() === 'webview') {
          event.preventDefault();
          win.webContents.send('shortcut-reload-tab');
          return;
        }
        // Ctrl+I -> show information/about dialog
        if (key === 'i' || key === 'I') {
          event.preventDefault();
          win.webContents.send('shortcut-show-info');
          return;
        }
      } catch (_) {}
    });
  } catch (_) {}
}