// Кроссплатформенная генерация build/icon.ico из build/icon.png.
// Через Node (а не shell-редирект `>`), чтобы бинарный файл не портился
// на Windows/PowerShell и в GitHub Actions.
const path = require("path");
const fs = require("fs");
const mod = require("png-to-ico");
const pngToIco = mod.default || mod;

const root = path.join(__dirname, "..");
const src = path.join(root, "build", "icon.png");
const out = path.join(root, "build", "icon.ico");

pngToIco(src)
  .then((buf) => {
    fs.writeFileSync(out, buf);
    console.log("Иконка создана:", out, "(" + buf.length + " байт)");
  })
  .catch((err) => {
    console.error("Ошибка генерации иконки:", err);
    process.exit(1);
  });
