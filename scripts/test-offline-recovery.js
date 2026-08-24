// Проверка восстановления десктоп-клиента после белого экрана.
//
// Поднимаем локальный сайт, запускаем НАСТОЯЩИЙ клиент (VVD_APP_URL), гасим
// сервер в момент перехода между страницами - ровно то, что случилось у
// SMART KIDS, - и смотрим, вернётся ли окно само, когда связь восстановится.
//
// Запуск: npm run test:recovery (на Linux - под xvfb-run, окну нужен экран)

const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const DESKTOP = path.resolve(__dirname, "..");

const hits = [];
let server = null;

function page(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      hits.push({ at: Date.now(), url: req.url });
      log(`  ← сервер отдал ${req.url}`);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (req.url.startsWith("/home")) {
        // Через 3 секунды страница сама уходит на /students - к этому моменту
        // сервер уже погашен, и переход провалится
        res.end(
          page("Главная", `<script>setTimeout(function(){location.href='/students';},3000)</script>`)
        );
      } else {
        res.end(page("Ученики", "<p>вернулись</p>"));
      }
    });
    server.listen(PORT, "127.0.0.1", resolve);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
    server.closeAllConnections?.();
    server = null;
  });
}

const t0 = Date.now();
const log = (m) => console.log(`[${String((Date.now() - t0) / 1000).padStart(5)}s] ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await startServer();
  log(`сервер поднят на ${BASE}`);

  const electron = path.join(DESKTOP, "node_modules", "electron", "dist", "electron");
  const childEnv = { ...process.env, VVD_APP_URL: `${BASE}/home` };
  // Иначе бинарник Electron запустится обычным Node и приложения не будет
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [DESKTOP, "--no-sandbox", "--disable-gpu"], {
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const out = [];
  const onOut = (buf) => {
    for (const line of String(buf).split("\n")) {
      const s = line.trim();
      if (!s) continue;
      out.push(s);
      log(`  клиент: ${s}`);
    }
  };
  child.stdout.on("data", onOut);
  child.stderr.on("data", onOut);
  child.on("exit", (code, sig) => log(`  !!! клиент завершился: code=${code} sig=${sig}`));

  // 1. Ждём первой загрузки и гасим сервер до того, как страница уйдёт на /students
  await wait(2000);
  await stopServer();
  log("СВЯЗЬ ОБОРВАНА (сервер погашен)");

  // 2. Страница пытается перейти - переход проваливается, начинаются повторы
  await wait(14000);
  log(`повторов зафиксировано: ${out.filter((s) => s.includes("Повтор загрузки")).length}`);

  // 3. Возвращаем связь: следующий же повтор должен поднять страницу сам
  const before = hits.length;
  await startServer();
  log("СВЯЗЬ ВЕРНУЛАСЬ (сервер снова поднят)");

  await wait(9000);
  const after = hits.slice(before);
  log(`запросов после возврата связи: ${after.length} ${JSON.stringify(after.map((h) => h.url))}`);

  child.kill("SIGKILL");
  await stopServer();

  const recovered = after.some((h) => h.url.startsWith("/students"));
  console.log("\n==================================================");
  console.log(recovered ? "ИТОГ: окно вернулось само ✓" : "ИТОГ: окно осталось белым ✗");
  console.log("==================================================");
  process.exit(recovered ? 0 : 1);
})();
