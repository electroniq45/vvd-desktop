const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

// Боевой сайт CRM. Стартуем сразу с /home:
// если сессии нет - сайт сам уводит на /login, после входа возвращает на /home.
// Лендинг в десктоп-клиенте таким образом не показывается.
const APP_URL = "https://formulavvd.com/home";

let mainWindow;

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
    title: "VVD 3.0",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    backgroundColor: "#F9F5EF",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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

function buildMenu() {
  const template = [
    {
      label: "Файл",
      submenu: [{ role: "quit", label: "Выход" }],
    },
    {
      label: "Правка",
      submenu: [
        { role: "undo", label: "Отменить" },
        { role: "redo", label: "Повторить" },
        { type: "separator" },
        { role: "cut", label: "Вырезать" },
        { role: "copy", label: "Копировать" },
        { role: "paste", label: "Вставить" },
        { role: "selectAll", label: "Выделить всё" },
      ],
    },
    {
      label: "Вид",
      submenu: [
        {
          label: "Назад",
          accelerator: "Alt+Left",
          click: (_item, win) => {
            if (win && win.webContents.canGoBack()) win.webContents.goBack();
          },
        },
        {
          label: "Вперёд",
          accelerator: "Alt+Right",
          click: (_item, win) => {
            if (win && win.webContents.canGoForward()) win.webContents.goForward();
          },
        },
        { role: "reload", label: "Обновить" },
        { role: "forceReload", label: "Обновить (сброс кэша)" },
        { type: "separator" },
        { role: "resetZoom", label: "Сбросить масштаб" },
        { role: "zoomIn", label: "Увеличить" },
        { role: "zoomOut", label: "Уменьшить" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Полный экран" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Авто-обновления через GitHub Releases (electron-updater).
// В режиме разработки (npm start) пропускаем - нет упакованного app-update.yml.
function setupAutoUpdates() {
  if (!app.isPackaged) return;

  autoUpdater.on("update-downloaded", (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Перезапустить сейчас", "Позже"],
        defaultId: 0,
        cancelId: 1,
        title: "Доступно обновление",
        message: `Загружена новая версия ${info.version}.`,
        detail: "Перезапустите приложение, чтобы применить обновление.",
      })
      .then((res) => {
        if (res.response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("Ошибка автообновления:", err);
  });

  autoUpdater.checkForUpdates();
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  setupAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
