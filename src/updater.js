// Логика окна обновления + локализация (язык передаётся из main через ?lang=).
// Вынесено в отдельный файл, т.к. CSP (script-src 'self') запрещает inline-скрипт.
const WIN = {
  ru: {
    availTitle: "Доступно обновление",
    availSub: "Вышла версия {v}. Загрузить сейчас?",
    availSubNo: "Вышла новая версия. Загрузить сейчас?",
    dlTitle: "Загрузка обновления",
    dlSub: "Пожалуйста, подождите — идёт скачивание",
    readyTitle: "Обновление готово",
    readySub: "Версия {v} загружена и готова к установке",
    readySubNo: "Новая версия загружена и готова к установке",
    uptodateTitle: "Установлена последняя версия",
    uptodateSub: "У вас актуальная версия VVD 3.0 (v{v})",
    uptodateSubNo: "У вас актуальная версия VVD 3.0",
    errTitle: "Не удалось обновить",
    errSub: "Проверьте подключение к интернету и попробуйте позже",
    checking: "Проверяем версию…",
    btnDownload: "Загрузить обновление",
    btnRestart: "Обновить и перезапустить",
    btnClose: "Закрыть",
    restarting: "Перезапуск…",
  },
  kk: {
    availTitle: "Қолжетімді жаңарту",
    availSub: "{v} нұсқасы шықты. Қазір жүктеу керек пе?",
    availSubNo: "Жаңа нұсқа шықты. Қазір жүктеу керек пе?",
    dlTitle: "Жаңартуды жүктеу",
    dlSub: "Күте тұрыңыз — жүктеу жүріп жатыр",
    readyTitle: "Жаңарту дайын",
    readySub: "{v} нұсқасы жүктелді және орнатуға дайын",
    readySubNo: "Жаңа нұсқа жүктелді және орнатуға дайын",
    uptodateTitle: "Соңғы нұсқа орнатылған",
    uptodateSub: "Сізде VVD 3.0 ағымдағы нұсқасы (v{v})",
    uptodateSubNo: "Сізде VVD 3.0 ағымдағы нұсқасы",
    errTitle: "Жаңарту мүмкін болмады",
    errSub: "Интернет байланысын тексеріп, кейінірек қайталаңыз",
    checking: "Нұсқаны тексеру…",
    btnDownload: "Жаңартуды жүктеу",
    btnRestart: "Жаңарту және қайта іске қосу",
    btnClose: "Жабу",
    restarting: "Қайта іске қосу…",
  },
  en: {
    availTitle: "Update available",
    availSub: "Version {v} is out. Download now?",
    availSubNo: "A new version is out. Download now?",
    dlTitle: "Downloading update",
    dlSub: "Please wait — downloading",
    readyTitle: "Update ready",
    readySub: "Version {v} downloaded and ready to install",
    readySubNo: "New version downloaded and ready to install",
    uptodateTitle: "You're up to date",
    uptodateSub: "You have the latest VVD 3.0 (v{v})",
    uptodateSubNo: "You have the latest VVD 3.0",
    errTitle: "Update failed",
    errSub: "Check your internet connection and try again later",
    checking: "Checking version…",
    btnDownload: "Download update",
    btnRestart: "Update and restart",
    btnClose: "Close",
    restarting: "Restarting…",
  },
};

const lang = new URLSearchParams(location.search).get("lang") || "ru";
const S = WIN[lang] || WIN.ru;
const $ = (id) => document.getElementById(id);

// Стартовые тексты и подписи кнопок
$("title").textContent = S.availTitle;
$("sub").textContent = S.checking;
$("download").textContent = S.btnDownload;
$("restart").textContent = S.btnRestart;
$("close").textContent = S.btnClose;

window.updaterAPI.onAvailable((version) => {
  $("title").textContent = S.availTitle;
  $("sub").textContent = version ? S.availSub.replace("{v}", version) : S.availSubNo;
  $("download").style.display = "inline-block";
  $("barArea").style.display = "none";
  $("restart").style.display = "none";
  $("close").style.display = "none";
});

$("download").addEventListener("click", () => {
  $("download").style.display = "none";
  $("title").textContent = S.dlTitle;
  $("sub").textContent = S.dlSub;
  $("barArea").style.display = "block";
  window.updaterAPI.download();
});

window.updaterAPI.onProgress((p) => {
  const v = Math.max(0, Math.min(100, Math.round(p)));
  $("fill").style.width = v + "%";
  $("pct").textContent = v + "%";
});

window.updaterAPI.onReady((version) => {
  $("title").textContent = S.readyTitle;
  $("sub").textContent = version ? S.readySub.replace("{v}", version) : S.readySubNo;
  $("barArea").style.display = "block";
  $("fill").style.width = "100%";
  $("pct").textContent = "100%";
  $("download").style.display = "none";
  $("restart").style.display = "inline-block";
});

window.updaterAPI.onUpToDate((version) => {
  $("title").textContent = S.uptodateTitle;
  $("sub").textContent = version ? S.uptodateSub.replace("{v}", version) : S.uptodateSubNo;
  $("barArea").style.display = "none";
  $("download").style.display = "none";
  $("restart").style.display = "none";
  $("close").style.display = "inline-block";
});

window.updaterAPI.onError(() => {
  $("title").textContent = S.errTitle;
  $("sub").textContent = S.errSub;
  $("barArea").style.display = "none";
  $("download").style.display = "none";
});

$("restart").addEventListener("click", () => {
  $("restart").disabled = true;
  $("restart").textContent = S.restarting;
  window.updaterAPI.restart();
});

$("close").addEventListener("click", () => window.updaterAPI.close());

// «Рукопожатие»: окно готово - запрашиваем текущее состояние, чтобы не потерять
// событие о доступном обновлении / актуальной версии.
window.updaterAPI.notifyReady();
