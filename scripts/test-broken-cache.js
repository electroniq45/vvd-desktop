// Проверка лечения испорченного кэша (1.0.16, кейс центра Unique 29.09.2026).
//
// Файл скрипта сайта лежит в кэше битым - страница его не разбирает, и
// переход на форму молча не происходит. Сервер здесь отдаёт такой файл с
// теми же заголовками, что и боевой сайт (кэш на год, immutable), и
// смотрим, что делает НАСТОЯЩИЙ main.js клиента.
//
// Три прогона:
//   1. Файл битый один раз, потом целый - клиент должен сам почистить кэш,
//      открыть окно заново и получить целый файл.
//   2. Файл битый всегда (сломан на самом сервере) - клиент лечит один раз
//      и дальше окно по кругу не пересоздаёт.
//   3. Первый запуск новой версии: на диске осталась битая копия из
//      прогона 2, сервер уже отдаёт целый файл - кэш должен почиститься
//      при запуске, до всякого лечения.
//
// Запуск: npm run test:cache (на Linux - под xvfb-run, окну нужен экран)

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const t0 = Date.now();
const PORT = 3458;
const BASE = `http://127.0.0.1:${PORT}`;
const DESKTOP = path.resolve(__dirname, "..");
const VERSION = require("../package.json").version;
// Папка данных неупакованного клиента (имя из package.json)
const USER_DATA = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  require("../package.json").name
);
// Своё имя файла на каждый прогон: прошлые не должны подсунуть из кэша ни
// битую, ни целую копию. Третий прогон намеренно берёт имя второго - ему
// нужна битая копия, оставшаяся на диске
const chunkName = (run) => `/_next/static/chunks/form-${t0}-${run}.js`;
let CHUNK = chunkName(1);

const log = (m) => console.log(`[${String((Date.now() - t0) / 1000).padStart(5)}s] ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let mode = "broken-once"; // broken-once | broken-always | good
let chunkHits = 0;
let okHits = 0;

const server = http.createServer((req, res) => {
  if (req.url === CHUNK) {
    chunkHits += 1;
    const broken = mode === "broken-always" || (mode === "broken-once" && chunkHits === 1);
    log(`  ← сервер отдал файл формы #${chunkHits} (${broken ? "БИТЫЙ" : "целый"})`);
    res.writeHead(200, {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.end(broken ? "window.formReady = (" : "fetch('/ok');");
    return;
  }
  if (req.url === "/ok") {
    okHits += 1;
    log("  ← форма открылась (/ok)");
    res.end("ok");
    return;
  }
  // Страница списка: после загрузки подтягивает скрипт формы - как Next при
  // нажатии «Добавить ученика»
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Ученики</title><h1>Ученики</h1>
<script>
  addEventListener("load", () => setTimeout(() => {
    const s = document.createElement("script");
    s.src = ${JSON.stringify(CHUNK)};
    document.head.appendChild(s);
  }, 300));
</script>`);
});

function runClient(ms) {
  return new Promise((resolve) => {
    const electron = path.join(DESKTOP, "node_modules", "electron", "dist", "electron");
    const env = { ...process.env, VVD_APP_URL: `${BASE}/students` };
    // Редактор (VS Code) выставляет эту переменную, и Electron стартует как
    // голый Node - окна не будет вовсе
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [DESKTOP, "--no-sandbox", "--disable-gpu"], { env });
    const out = [];
    const onData = (d) => {
      for (const line of String(d).split("\n")) {
        const s = line.trim();
        if (!s || /dbus|Gtk|ERROR:|Fontconfig|libva/.test(s)) continue;
        out.push(s);
        log(`  клиент: ${s}`);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
        resolve(out);
      }, 1500);
    }, ms);
  });
}

const heals = (out) => out.filter((s) => s.includes("Битый файл сайта")).length;

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  log(`сервер поднят на ${BASE}, версия клиента ${VERSION}`);
  const results = [];

  log("ПРОГОН 1: файл битый один раз");
  mode = "broken-once";
  chunkHits = 0;
  okHits = 0;
  let out = await runClient(12000);
  results.push(["битый файл вылечен сам", heals(out) === 1 && okHits >= 1 && chunkHits === 2]);

  log("ПРОГОН 2: файл битый всегда");
  mode = "broken-always";
  CHUNK = chunkName(2);
  chunkHits = 0;
  okHits = 0;
  out = await runClient(20000);
  results.push(["окно не пересоздаётся по кругу", heals(out) === 1 && chunkHits === 2]);

  log("ПРОГОН 3: первый запуск новой версии, на диске битая копия");
  mode = "good";
  chunkHits = 0;
  okHits = 0;
  fs.writeFileSync(path.join(USER_DATA, "cache-version"), "0.0.0");
  out = await runClient(10000);
  results.push(["кэш почищен при запуске новой версии", heals(out) === 0 && okHits >= 1 && chunkHits === 1]);

  server.close();
  console.log("\n==================================================");
  for (const [name, ok] of results) console.log(`${ok ? "✓" : "✗"} ${name}`);
  console.log("==================================================");
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
})();
