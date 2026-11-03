// Windows shell for the live game. The game itself stays on lprmotorsports.me so
// leaderboard, accounts and chat keep working: the verification services only
// accept that origin, and the app updates whenever the site does.
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('node:path');

const GAME_URL = 'https://lprmotorsports.me/';
const GAME_ORIGIN = new URL(GAME_URL).origin;
const OFFLINE_PAGE = path.join(__dirname, 'offline.html');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function isGame(url) {
  try { return new URL(url).origin === GAME_ORIGIN; } catch { return false; }
}

function openOutside(url) {
  // Only hand web links to the system browser; never file:, javascript: etc.
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#111114',
    title: 'LPR Lap Challenge',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The game pauses itself on blur/hide; don't also throttle its timers.
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Replays and other game pages stay in the app; everything else opens in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isGame(url)) { win.loadURL(url); } else { openOutside(url); }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isGame(url) || url.startsWith('file:')) return;
    event.preventDefault();
    openOutside(url);
  });

  win.webContents.on('did-fail-load', (_event, code, _desc, url, isMainFrame) => {
    // -3 = navigation aborted (e.g. replaced by another load), not a real failure.
    if (isMainFrame && code !== -3 && isGame(url)) win.loadFile(OFFLINE_PAGE);
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      win.loadURL(GAME_URL);
      event.preventDefault();
    }
  });

  win.loadURL(GAME_URL);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

// Lets the game page know it runs inside the client (hides the download offer).
app.userAgentFallback = `${app.userAgentFallback} LPRDesktop/${app.getVersion()}`;

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // The game needs no camera, microphone, location or notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'fullscreen' || permission === 'pointerLock');
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
