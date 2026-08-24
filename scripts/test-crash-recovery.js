// Проверка второй причины белого экрана: умер процесс отрисовки страницы.
//
// Убиваем процесс отрисовки НАШЕГО клиента (строго внутри его дерева
// процессов - чужие Electron-приложения на машине не трогаем) и смотрим,
// вернётся ли окно на ту же страницу само.
//
// Запуск: npm run test:recovery (на Linux - под xvfb-run, окну нужен экран)

const http = require("http");
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = 3457;
const BASE = `http://127.0.0.1:${PORT}`;
const DESKTOP = path.resolve(__dirname, "..");

const hits = [];
const t0 = Date.now();
const log = (m) => console.log(`[${String((Date.now() - t0) / 1000).padStart(5)}s] ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  hits.push(req.url);
  log(`  ← сервер отдал ${req.url}`);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Журнал</title><h1>Журнал</h1>`);
});

// Все потомки процесса, включая внуков
function descendants(pid, acc = []) {
  let out = "";
  try {
    out = execSync(`pgrep -P ${pid}`, { encoding: "utf8" });
  } catch {
    return acc;
  }
  for (const line of out.split("\n")) {
    const child = Number(line.trim());
    if (!child) continue;
    acc.push(child);
    descendants(child, acc);
  }
  return acc;
}

function cmdline(pid) {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
  } catch {
    return "";
  }
}

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  log(`сервер поднят на ${BASE}`);

  const electron = path.join(DESKTOP, "node_modules", "electron", "dist", "electron");
  const env = { ...process.env, VVD_APP_URL: `${BASE}/journal` };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [DESKTOP, "--no-sandbox", "--disable-gpu"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const onOut = (b) => {
    for (const line of String(b).split("\n")) {
      const s = line.trim();
      if (s) log(`  клиент: ${s}`);
    }
  };
  child.stdout.on("data", onOut);
  child.stderr.on("data", onOut);

  await wait(4000);

  // Ищем процесс отрисовки СТРОГО в дереве нашего клиента
  const tree = descendants(child.pid);
  const renderers = tree.filter((p) => cmdline(p).includes("--type=renderer"));
  log(`дерево клиента: ${tree.length} процессов, из них отрисовки: ${renderers.length}`);
  if (!renderers.length) {
    log("процесс отрисовки не найден - проверка невозможна");
    child.kill("SIGKILL");
    server.close();
    process.exit(2);
  }

  const before = hits.length;
  for (const p of renderers) {
    log(`  убиваем процесс отрисовки ${p}`);
    try {
      process.kill(p, "SIGKILL");
    } catch {}
  }
  log("ОКНО УМЕРЛО (процесс отрисовки убит)");

  await wait(8000);
  const after = hits.slice(before);
  log(`запросов после смерти окна: ${after.length} ${JSON.stringify(after)}`);

  child.kill("SIGKILL");
  server.close();

  const recovered = after.some((u) => u.startsWith("/journal"));
  console.log("\n==================================================");
  console.log(recovered ? "ИТОГ: окно вернулось само ✓" : "ИТОГ: окно осталось белым ✗");
  console.log("==================================================");
  process.exit(recovered ? 0 : 1);
})();
