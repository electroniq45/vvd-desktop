// Локализация нативной части клиента (меню, диалоги, заголовок окна обновления).
// Язык определяется по системной локали Windows; fallback - русский.
const { app } = require("electron");

const STRINGS = {
  ru: {
    file: "Файл",
    checkUpdates: "Проверить обновления",
    quit: "Выход",
    edit: "Правка",
    undo: "Отменить",
    redo: "Повторить",
    cut: "Вырезать",
    copy: "Копировать",
    paste: "Вставить",
    selectAll: "Выделить всё",
    view: "Вид",
    back: "Назад",
    forward: "Вперёд",
    reload: "Обновить",
    forceReload: "Обновить (сброс кэша)",
    resetZoom: "Сбросить масштаб",
    zoomIn: "Увеличить",
    zoomOut: "Уменьшить",
    fullscreen: "Полный экран",
    updWindow: "Обновление VVD 3.0",
    updTitle: "Обновления",
    updErr: "Не удалось проверить обновления.",
    devOnly: "Проверка обновлений работает только в установленном приложении.",
    ok: "ОК",
    crashTitle: "VVD 3.0",
    crashRepeated:
      "Окно приложения закрывается снова и снова. Данные в безопасности - они на сервере. Попробуйте перезагрузить ещё раз, а если не поможет, закройте приложение и откройте заново.",
    crashRestart: "Перезагрузить",
    hangMessage: "Страница не отвечает. Подождать или перезагрузить её?",
    hangWait: "Подождать",
    offlineTitle: "Нет связи",
    offlineMessage:
      "Не удалось связаться с сервером. Проверьте интернет и повторите.",
    offlineRetry: "Повторить",
  },
  kk: {
    file: "Файл",
    checkUpdates: "Жаңартуларды тексеру",
    quit: "Шығу",
    edit: "Өңдеу",
    undo: "Болдырмау",
    redo: "Қайталау",
    cut: "Қию",
    copy: "Көшіру",
    paste: "Қою",
    selectAll: "Барлығын таңдау",
    view: "Көрініс",
    back: "Артқа",
    forward: "Алға",
    reload: "Жаңарту",
    forceReload: "Жаңарту (кэшті тазалау)",
    resetZoom: "Масштабты қалпына келтіру",
    zoomIn: "Үлкейту",
    zoomOut: "Кішірейту",
    fullscreen: "Толық экран",
    updWindow: "VVD 3.0 жаңартуы",
    updTitle: "Жаңартулар",
    updErr: "Жаңартуларды тексеру мүмкін болмады.",
    devOnly: "Жаңартуларды тексеру тек орнатылған қолданбада жұмыс істейді.",
    ok: "ОК",
    crashTitle: "VVD 3.0",
    crashRepeated:
      "Қолданба терезесі қайта-қайта жабылып жатыр. Деректер қауіпсіз - олар серверде. Тағы бір рет жаңартып көріңіз, көмектеспесе, қолданбаны жауып, қайта ашыңыз.",
    crashRestart: "Жаңарту",
    hangMessage: "Бет жауап бермейді. Күте тұрасыз ба, әлде жаңартасыз ба?",
    hangWait: "Күте тұру",
    offlineTitle: "Байланыс жоқ",
    offlineMessage:
      "Сервермен байланысу мүмкін болмады. Интернетті тексеріп, қайталаңыз.",
    offlineRetry: "Қайталау",
  },
  en: {
    file: "File",
    checkUpdates: "Check for updates",
    quit: "Quit",
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select all",
    view: "View",
    back: "Back",
    forward: "Forward",
    reload: "Reload",
    forceReload: "Reload (clear cache)",
    resetZoom: "Reset zoom",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fullscreen: "Fullscreen",
    updWindow: "VVD 3.0 Update",
    updTitle: "Updates",
    updErr: "Failed to check for updates.",
    devOnly: "Update check works only in the installed app.",
    ok: "OK",
    crashTitle: "VVD 3.0",
    crashRepeated:
      "The app window keeps closing. Your data is safe - it lives on the server. Try reloading once more, and if that does not help, close the app and open it again.",
    crashRestart: "Reload",
    hangMessage: "The page is not responding. Wait or reload it?",
    hangWait: "Wait",
    offlineTitle: "No connection",
    offlineMessage: "Could not reach the server. Check your internet and try again.",
    offlineRetry: "Retry",
  },
};

function resolveLocale() {
  const l = (app.getLocale() || "ru").toLowerCase();
  if (l.startsWith("kk")) return "kk";
  if (l.startsWith("en")) return "en";
  return "ru";
}

let cur = null;
function t(key) {
  if (!cur) cur = resolveLocale();
  return (STRINGS[cur] && STRINGS[cur][key]) || STRINGS.ru[key] || key;
}

module.exports = { t, resolveLocale };
