const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { t, resolveLocale } = require("./i18n");

// Боевой сайт CRM. Стартуем сразу с /home:
// если сессии нет - сайт сам уводит на /login, после входа возвращает на /home.
// Лендинг в десктоп-клиенте таким образом не показывается.
const APP_URL = "https://formulavvd.com/home";

let mainWindow;

// true, когда обновление запрошено вручную (меню «Файл» → «Проверить обновления»).
// Тогда показываем сообщение «обновлений нет»; при авто-проверке молчим.
let manualUpdateCheck = false;
let updaterWindow = null;
let latestVersion = null;
let updaterState = null; // "available" | "uptodate"

// Разрешаем только один запущенный экземпляр приложения
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: `VVD 3.0 (v${app.getVersion()})`,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    backgroundColor: "#F9F5EF",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Не даём странице сайта перебивать заголовок окна - оставляем
  // «VVD 3.0 (vX.Y.Z)», чтобы всегда была видна версия клиента.
  mainWindow.on("page-title-updated", (e) => {
    e.preventDefault();
  });

  mainWindow.loadURL(APP_URL);

  // Ссылки, открываемые в новой вкладке/окне (target=_blank, window.open) -
  // отправляем во внешний системный браузер, новых окон не плодим.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Навигацию в самом окне не перехватываем - так корректно работают
  // редиректы авторизации и платёжного шлюза внутри приложения.

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Ручная проверка обновлений (из меню «Файл»).
function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: t("updTitle"),
      message: t("devOnly"),
      buttons: [t("ok")],
    });
    return;
  }
  manualUpdateCheck = true;
  autoUpdater.checkForUpdates();
}

function buildMenu() {
  const template = [
    {
      label: t("file"),
      submenu: [
        { label: t("checkUpdates"), click: () => checkForUpdatesManually() },
        { type: "separator" },
        { role: "quit", label: t("quit") },
      ],
    },
    {
      label: t("edit"),
      submenu: [
        { role: "undo", label: t("undo") },
        { role: "redo", label: t("redo") },
        { type: "separator" },
        { role: "cut", label: t("cut") },
        { role: "copy", label: t("copy") },
        { role: "paste", label: t("paste") },
        { role: "selectAll", label: t("selectAll") },
      ],
    },
    {
      label: t("view"),
      submenu: [
        {
          label: t("back"),
          accelerator: "Alt+Left",
          click: (_item, win) => {
            if (win && win.webContents.canGoBack()) win.webContents.goBack();
          },
        },
        {
          label: t("forward"),
          accelerator: "Alt+Right",
          click: (_item, win) => {
            if (win && win.webContents.canGoForward()) win.webContents.goForward();
          },
        },
        { role: "reload", label: t("reload") },
        { role: "forceReload", label: t("forceReload") },
        { type: "separator" },
        { role: "resetZoom", label: t("resetZoom") },
        { role: "zoomIn", label: t("zoomIn") },
        { role: "zoomOut", label: t("zoomOut") },
        { type: "separator" },
        { role: "togglefullscreen", label: t("fullscreen") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Фирменное окно обновления (маскот + анимированная полоса прогресса).
function createUpdaterWindow() {
  if (updaterWindow) {
    updaterWindow.focus();
    return;
  }
  updaterWindow = new BrowserWindow({
    width: 460,
    height: 440,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: t("updWindow"),
    parent: mainWindow || undefined,
    backgroundColor: "#F9F5EF",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "updater-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  updaterWindow.setMenu(null);
  updaterWindow.loadFile(path.join(__dirname, "updater.html"), {
    search: "lang=" + resolveLocale(),
  });
  updaterWindow.on("closed", () => {
    updaterWindow = null;
  });
}

function sendToUpdater(channel, payload) {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.webContents.send(channel, payload);
  }
}

// Авто-обновления через GitHub Releases (electron-updater).
// В режиме разработки (npm start) пропускаем - нет упакованного app-update.yml.
function setupAutoUpdates() {
  if (!app.isPackaged) return;

  // Не качаем автоматически - сначала спрашиваем пользователя в окне обновления.
  autoUpdater.autoDownload = false;

  // «Рукопожатие»: окно обновления загрузилось и запрашивает текущее состояние.
  ipcMain.on("updater-ready", () => {
    if (updaterState === "available" && latestVersion) {
      sendToUpdater("update-available", latestVersion);
    } else if (updaterState === "uptodate") {
      sendToUpdater("update-uptodate", app.getVersion());
    }
  });
  // Пользователь нажал «Загрузить обновление» - запускаем скачивание.
  ipcMain.on("update-download", () => {
    autoUpdater.downloadUpdate();
  });
  // «Обновить и перезапустить»: тихая установка (без повторного мастера).
  ipcMain.on("update-restart", () => {
    autoUpdater.quitAndInstall(true, true);
  });
  ipcMain.on("update-close", () => {
    if (updaterWindow) updaterWindow.close();
  });

  autoUpdater.on("update-available", (info) => {
    manualUpdateCheck = false;
    latestVersion = info.version;
    updaterState = "available";
    // Открываем окно с предложением загрузить; окно само запросит версию.
    createUpdaterWindow();
  });

  autoUpdater.on("update-not-available", () => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      updaterState = "uptodate";
      // Фирменное окно вместо стандартного диалога Windows.
      createUpdaterWindow();
    }
  });

  autoUpdater.on("download-progress", (p) => {
    sendToUpdater("update-progress", p.percent);
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendToUpdater("update-ready", info.version);
  });

  autoUpdater.on("error", (err) => {
    sendToUpdater("update-error");
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: t("updTitle"),
        message: t("updErr"),
        detail: String(err),
        buttons: [t("ok")],
      });
    }
    console.error("Ошибка автообновления:", err);
  });

  // Проверяем обновления при запуске (без назойливых периодических проверок -
  // окно появится один раз, если есть новая версия).
  autoUpdater.checkForUpdates();
}

// Анонимная телеметрия: при запуске сообщаем серверу installId + версию + ОС.
// installId - случайный UUID, хранится локально в папке данных приложения.
// Никаких персональных данных не передаётся.
function getInstallId() {
  const file = path.join(app.getPath("userData"), "install-id");
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  } catch {}
  const id = crypto.randomUUID();
  try {
    fs.writeFileSync(file, id);
  } catch {}
  return id;
}

async function sendPing() {
  if (!app.isPackaged) return;
  try {
    await fetch("https://formulavvd.com/api/desktop/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installId: getInstallId(),
        version: app.getVersion(),
        os: process.platform,
      }),
    });
  } catch {}
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  setupAutoUpdates();
  sendPing();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
