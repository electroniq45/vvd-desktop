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
