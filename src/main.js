const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { t, resolveLocale } = require("./i18n");

// Боевой сайт CRM. Стартуем сразу с /home:
// если сессии нет - сайт сам уводит на /login, после входа возвращает на /home.
// Лендинг в десктоп-клиенте таким образом не показывается.
//
// VVD_APP_URL подменяет адрес ТОЛЬКО в неупакованном приложении (npm start) -
// так проверяется восстановление после обрыва связи на локальном сервере.
// В установленном клиенте переменная игнорируется: иначе подсунуть человеку
// чужой адрес можно было бы просто ярлыком.
const APP_URL =
  (!app.isPackaged && process.env.VVD_APP_URL) || "https://formulavvd.com/home";

// Адрес страницы сайта, а не служебный (about:blank, chrome://, file://):
// запоминать имеет смысл только то, куда можно вернуться
const isWebUrl = (url) =>
  typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"));

// loadURL отдаёт промис, который ОТКЛОНЯЕТСЯ при неудачной загрузке. Ошибку
// разбирает did-fail-load, а необработанное отклонение в главном процессе
// Node считает фатальным - то есть попытка вылечить белый экран убила бы
// приложение целиком. Гасим здесь.
function loadUrlSafe(win, url) {
  if (!win || win.isDestroyed()) return;
  win.loadURL(url).catch(() => {});
}

let mainWindow;

// Счётчик падений окна подряд. Одиночный сбой лечим молча - перезагружаем
// страницу, пользователь видит секундную заминку вместо белого экрана.
// Если рушится раз за разом, молчать нельзя: показываем диалог.
let crashStreak = 0;
let crashStreakResetTimer = null;
// Адрес, на котором окно умерло: после перезагрузки возвращаем человека туда же
let lastGoodUrl = APP_URL;
// Показан ли диалог «нет связи» - чтобы не плодить их при каждой попытке
let offlineDialogOpen = false;
// Сколько раз подряд пытались загрузить страницу после обрыва связи
let offlineRetries = 0;
let offlineRetryTimer = null;
// Провалилась ли текущая загрузка. Нужен, чтобы отличить настоящую загрузку
// страницы от заглушки, которую Electron дорисовывает после неудачи
let loadFailed = false;

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

  loadUrlSafe(mainWindow, APP_URL);

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

  attachRecovery(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ============================================================
// ВОССТАНОВЛЕНИЕ ПОСЛЕ БЕЛОГО ЭКРАНА
//
// У Electron нет своей страницы «что-то пошло не так»: если страница не
// загрузилась или процесс её отрисовки умер, остаётся ПУСТОЕ БЕЛОЕ ОКНО.
// Меню на месте, а страницы нет, и сама она уже не вернётся - даже когда
// интернет восстановится. Со стороны это выглядит как «программа сломалась»,
// хотя сервер цел и все данные на месте.
//
// Кейс SMART KIDS 24.08.2026: у центра на минуту пропал интернет, человек в
// этот момент переходил на другую страницу - и белое окно продержалось почти
// час, пока приложение не закрыли и не открыли заново. В логах сервера при
// этом ни одной ошибки: запросы просто перестали приходить.
//
// Три причины белого окна, и все три лечим здесь:
//   did-fail-load       - страница не загрузилась (нет связи, сервер
//                         перезапускается после обновления);
//   render-process-gone - умер процесс отрисовки (обычно нехватка памяти
//                         в окне, открытом весь рабочий день);
//   unresponsive        - окно повисло.
// Лечение одно: вернуть человека на ту страницу, где он работал.
// ============================================================
function attachRecovery(win) {
  const wc = win.webContents;

  // Запоминаем адрес удачно открытой страницы - на него и вернёмся
  wc.on("did-navigate-in-page", (_e, url) => {
    if (isWebUrl(url)) lastGoodUrl = url;
  });
  wc.on("did-navigate", (_e, url) => {
    if (isWebUrl(url) && !loadFailed) lastGoodUrl = url;
  });

  wc.on("did-start-loading", () => {
    loadFailed = false;
  });

  // Страница загрузилась - значит прошлое падение позади.
  //
  // ⚠️ Событие «загрузилось» приходит и ПОСЛЕ неудачной загрузки: Electron
  // дорисовывает вместо страницы пустую заглушку и честно сообщает, что
  // закончил. Принять это за успех нельзя - иначе мы сами отменяем
  // собственный повтор, и окно остаётся белым навсегда (проверено на стенде:
  // без этого флага повтор был ровно один и тот не срабатывал). Отличаем по
  // флагу: did-fail-load приходит раньше, чем did-finish-load.
  wc.on("did-finish-load", () => {
    if (loadFailed) return;
    offlineDialogOpen = false;
    // Связь вернулась: счётчик повторов начинаем с нуля
    if (offlineRetries > 0) {
      console.error(`Связь вернулась с ${offlineRetries}-й попытки`);
      reportCrash("load-failed", offlineRetries);
    }
    offlineRetries = 0;
    if (offlineRetryTimer) {
      clearTimeout(offlineRetryTimer);
      offlineRetryTimer = null;
    }
    if (crashStreakResetTimer) clearTimeout(crashStreakResetTimer);
    // Сбрасываем счётчик не сразу: если окно рушится по кругу, перезагрузка
    // тоже успевает «загрузиться», и без выдержки серия никогда не наберётся
    crashStreakResetTimer = setTimeout(() => {
      crashStreak = 0;
    }, 60_000);
  });

  // Смерть процесса отрисовки - тот самый белый экран
  wc.on("render-process-gone", (_e, details) => {
    const reason = details && details.reason ? details.reason : "crashed";
    const exitCode = details ? details.exitCode : null;
    console.error("Окно приложения упало:", reason, exitCode);
    reportCrash(reason, exitCode);

    // «clean-exit» - штатное завершение при закрытии окна, лечить нечего
    if (reason === "clean-exit") return;

    crashStreak += 1;
    if (crashStreak <= 3) {
      recoverWindow();
      return;
    }

    // Рушится по кругу - дальше перезагружать бессмысленно, спрашиваем человека
    const choice = dialog.showMessageBoxSync(win, {
      type: "error",
      title: t("crashTitle"),
      message: t("crashRepeated"),
      buttons: [t("crashRestart"), t("quit")],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) {
      app.quit();
    } else {
      crashStreak = 0;
      recoverWindow();
    }
  });

  // Окно повисло: страница жива, но не отвечает. Сама может и отойти,
  // поэтому решение оставляем за человеком.
  win.on("unresponsive", () => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      title: t("crashTitle"),
      message: t("hangMessage"),
      buttons: [t("hangWait"), t("crashRestart")],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) {
      reportCrash("unresponsive", null);
      recoverWindow();
    }
  });

  // Страница не загрузилась: пропал интернет, сервер на перезапуске после
  // обновления. Electron в этом случае оставляет ПУСТОЕ БЕЛОЕ ОКНО - своей
  // страницы «нет связи» у него нет, а страницу сайта он уже выгрузил. Само
  // окно не оживёт даже когда интернет вернётся: перезагружать его некому
  // (кейс SMART KIDS 24.08.2026 - у центра моргнул интернет, и белый экран
  // продержался почти час, пока приложение не закрыли и не открыли заново).
  //
  // Поэтому сначала пробуем молча: короткий обрыв связи так и остаётся
  // незамеченным. Спрашиваем человека, только если связь не вернулась.
  wc.on("did-fail-load", (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    // -3 (ERR_ABORTED) - обычная отмена при быстром переходе, не ошибка
    if (!isMainFrame || errorCode === -3) return;
    // Пометка для did-finish-load: то, что сейчас «догрузится», - заглушка
    loadFailed = true;
    if (offlineDialogOpen) return;

    const target = isWebUrl(validatedURL) ? validatedURL : lastGoodUrl || APP_URL;
    console.error("Страница не загрузилась:", errorCode, target);
    retryLoad(win, target);
  });
}

// Тихие повторы загрузки, пока связь не вернётся: 5 попыток раз в 6 секунд -
// полминуты на то, чтобы интернет моргнул и восстановился. Не помогло -
// спрашиваем человека, а не оставляем его перед белым окном.
function retryLoad(win, target) {
  offlineRetries += 1;
  if (offlineRetries <= 5) {
    console.error(`Повтор загрузки ${offlineRetries}/5 через 6 с`);
    if (offlineRetryTimer) clearTimeout(offlineRetryTimer);
    offlineRetryTimer = setTimeout(() => {
      loadUrlSafe(win, target);
    }, 6000);
    return;
  }

  offlineRetries = 0;
  offlineDialogOpen = true;
  const choice = dialog.showMessageBoxSync(win, {
    type: "warning",
    title: t("offlineTitle"),
    message: t("offlineMessage"),
    buttons: [t("offlineRetry"), t("quit")],
    defaultId: 0,
    cancelId: 0,
  });
  offlineDialogOpen = false;
  if (choice === 1) {
    app.quit();
  } else if (!win.isDestroyed()) {
    loadUrlSafe(win, target);
  }
}

// Поднять окно обратно на ту страницу, где человек работал
function recoverWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const target = lastGoodUrl || APP_URL;
  console.error("Возвращаем окно на", target);
  loadUrlSafe(mainWindow, target);
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

// Сообщить серверу о падении окна. Без этого сбой не виден никому: на сервере
// он выглядит как «клиент просто перестал слать запросы».
// Адрес отправляем без параметров запроса - в них бывают поиск и фильтры.
async function reportCrash(reason, exitCode) {
  if (!app.isPackaged) return;
  let url = "";
  try {
    url = String(lastGoodUrl || "").split("?")[0];
  } catch {}
  try {
    await fetch("https://formulavvd.com/api/desktop/crash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installId: getInstallId(),
        version: app.getVersion(),
        os: process.platform,
        reason,
        exitCode,
        url,
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
