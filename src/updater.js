// Логика окна обновления. Вынесена в отдельный файл, т.к. CSP (script-src 'self')
// запрещает встроенные <script> прямо в HTML.
const $ = (id) => document.getElementById(id);

window.updaterAPI.onAvailable((version) => {
  $("title").textContent = "Доступно обновление";
  $("sub").textContent = version
    ? "Вышла версия " + version + ". Загрузить сейчас?"
    : "Вышла новая версия. Загрузить сейчас?";
  $("download").style.display = "inline-block";
  $("barArea").style.display = "none";
  $("restart").style.display = "none";
});

$("download").addEventListener("click", () => {
  $("download").style.display = "none";
  $("title").textContent = "Загрузка обновления";
  $("sub").textContent = "Пожалуйста, подождите — идёт скачивание";
  $("barArea").style.display = "block";
  window.updaterAPI.download();
});

window.updaterAPI.onProgress((p) => {
  const v = Math.max(0, Math.min(100, Math.round(p)));
  $("fill").style.width = v + "%";
  $("pct").textContent = v + "%";
});

window.updaterAPI.onReady((version) => {
  $("title").textContent = "Обновление готово";
  $("sub").textContent = version
    ? "Версия " + version + " загружена и готова к установке"
    : "Новая версия загружена и готова к установке";
  $("barArea").style.display = "block";
  $("fill").style.width = "100%";
  $("pct").textContent = "100%";
  $("download").style.display = "none";
  $("restart").style.display = "inline-block";
});

window.updaterAPI.onError(() => {
  $("title").textContent = "Не удалось обновить";
  $("sub").textContent = "Проверьте подключение к интернету и попробуйте позже";
  $("barArea").style.display = "none";
  $("download").style.display = "none";
});

$("restart").addEventListener("click", () => {
  $("restart").disabled = true;
  $("restart").textContent = "Перезапуск…";
  window.updaterAPI.restart();
});

// «Рукопожатие»: окно готово - запрашиваем текущее состояние, чтобы не потерять
// событие о доступном обновлении.
window.updaterAPI.notifyReady();
