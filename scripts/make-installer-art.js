// Генерация фирменных картинок NSIS-установщика (BMP) из логотипа и маскота.
// SVG -> PNG (sharp, поддерживает avif и рендер SVG) -> BMP (jimp).
// NSIS требует BMP; делаем без альфа-канала (24-bit), фон непрозрачный.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { Jimp } = require("jimp");

const VVD3 = "/home/alex/vvd-3.0";
const buildDir = path.join(__dirname, "..", "build");

const LOGO = path.join(VVD3, "public/logo-512.png");
const MASCOT = path.join(VVD3, "public/mascot/mascot1.avif");

async function b64(buf) {
  return buf.toString("base64");
}

async function svgToBmp(svg, outName) {
  const png = await sharp(Buffer.from(svg))
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .png()
    .toBuffer();
  const img = await Jimp.read(png);
  await img.write(path.join(buildDir, outName));
}

(async () => {
  // Подготовка изображений (PNG-буферы для встраивания в SVG)
  const logoPng = await sharp(LOGO)
    .resize(120, 120, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const mascotPng = await sharp(MASCOT)
    .resize(300, 380, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const logo64 = await b64(logoPng);
  const mascot64 = await b64(mascotPng);

  // ── Боковая панель 164×314 (welcome/finish) ──────────────────────
  const sidebar = `
<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#003D66"/>
      <stop offset="1" stop-color="#06283f"/>
    </linearGradient>
  </defs>
  <rect width="164" height="314" fill="url(#g)"/>
  <image x="54" y="20" width="56" height="56" href="data:image/png;base64,${logo64}"/>
  <text x="82" y="98" text-anchor="middle" fill="#ffffff" font-family="DejaVu Sans, sans-serif" font-size="18" font-weight="bold">VVD 3.0</text>
  <text x="82" y="116" text-anchor="middle" fill="#ffffff" fill-opacity="0.6" font-family="DejaVu Sans, sans-serif" font-size="8">образовательный центр</text>
  <image x="17" y="128" width="130" height="170" href="data:image/png;base64,${mascot64}" preserveAspectRatio="xMidYMax meet"/>
  <rect x="0" y="309" width="164" height="5" fill="#AA001B"/>
</svg>`;
  await svgToBmp(sidebar, "installerSidebar.bmp");

  // ── Шапка 150×57 (страницы выбора папки и т.п.) ──────────────────
  const header = `
<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
  <rect width="150" height="57" fill="#ffffff"/>
  <rect x="0" y="0" width="5" height="57" fill="#AA001B"/>
  <image x="14" y="11" width="34" height="34" href="data:image/png;base64,${logo64}"/>
  <text x="56" y="28" fill="#003D66" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="bold">VVD 3.0</text>
  <text x="56" y="42" fill="#888888" font-family="DejaVu Sans, sans-serif" font-size="7">CRM для образовательных центров</text>
</svg>`;
  await svgToBmp(header, "installerHeader.bmp");

  console.log("Готово: build/installerSidebar.bmp (164×314), build/installerHeader.bmp (150×57)");
})().catch((e) => {
  console.error("Ошибка генерации:", e);
  process.exit(1);
});
