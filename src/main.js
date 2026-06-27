const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Боевой сайт CRM. Стартуем сразу с /home:
// если сессии нет - сайт сам уводит на /login, после входа возвращает на /home.
// Лендинг в десктоп-клиенте таким образом не показывается.
const APP_URL = "https://formulavvd.com/home";

let mainWindow;

// true, когда обновление запрошено вручную (меню «Файл» → «Проверить обновления»).
// Тогда показываем сообщение «обновлений нет»; при авто-проверке молчим.
let manualUpdateCheck = false;

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
      title: "Обновления",
      message: "Проверка обновлений работает только в установленном приложении.",
      buttons: ["ОК"],
    });
    return;
  }
  manualUpdateCheck = true;
  autoUpdater.checkForUpdates();
}

function buildMenu() {
  const template = [
    {
      label: "Файл",
      submenu: [
        { label: "Проверить обновления", click: () => checkForUpdatesManually() },
        { type: "separator" },
        { role: "quit", label: "Выход" },
      ],
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

  autoUpdater.on("update-available", () => {
    // Обновление найдено - скачается в фоне; сообщение покажем по готовности.
    manualUpdateCheck = false;
  });

  autoUpdater.on("update-not-available", () => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Обновления",
        message: "У вас установлена последняя версия VVD 3.0.",
        buttons: ["ОК"],
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    manualUpdateCheck = false;
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Обновить и перезапустить", "Позже"],
        defaultId: 0,
        cancelId: 1,
        title: "Обновление VVD 3.0",
        message: `Доступна новая версия (${info.version}).`,
        detail: "Нажмите «Обновить и перезапустить», чтобы установить обновление.",
      })
      .then((res) => {
        if (res.response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Обновления",
        message: "Не удалось проверить обновления.",
        detail: String(err),
        buttons: ["ОК"],
      });
    }
    console.error("Ошибка автообновления:", err);
  });

  autoUpdater.checkForUpdates();

  // Периодическая проверка (раз в 30 минут), чтобы обновление подхватывалось
  // без перезапуска приложения.
  setInterval(() => autoUpdater.checkForUpdates(), 30 * 60 * 1000);
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
