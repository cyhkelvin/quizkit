// 把題庫打包成刷題網頁：單一 HTML（預設）或資料夾。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { loadBanks, bankAssets, resolveAsset } from "./banks.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// 放進 <script> 的 JSON 要跳脫 <，避免內容出現 </script>
const scriptJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

async function bundleApp() {
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, "app/main.jsx")],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2019"],
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

/** 首頁只需要的題庫資訊（不含題目）。 */
export function bankMeta(bank) {
  const { questions, passages, ...meta } = bank;
  return { ...meta, count: questions.length };
}

/** 同一個分頁內：有考試日的依日期新到舊，其餘保持檔案順序。 */
export function orderBanks(entries) {
  const groups = new Map();
  entries.forEach((e, i) => {
    if (!groups.has(e.bank.group)) groups.set(e.bank.group, []);
    groups.get(e.bank.group).push({ ...e, i });
  });
  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const da = a.bank.date || "", db = b.bank.date || "";
      if (da !== db) return da < db ? 1 : -1;
      return a.i - b.i;
    });
    out.push(...list);
  }
  return out;
}

export async function build({ banks: targets, out, format = "single", title = "quizkit 刷題" }) {
  if (!out) throw new Error("需要 --out");
  if (!["single", "folder"].includes(format)) throw new Error(`不支援的格式：${format}（可用 single 或 folder）`);
  targets = targets && targets.length ? targets : ["banks/"];
  for (const t of targets) if (!fs.existsSync(t)) throw new Error(`找不到 ${t}`);

  // 範例題庫（examples/）只在直接指定時才打包；不符格式的檔案跳過並列出原因
  const { banks: loaded, skipped } = loadBanks(targets, { skipExamples: "auto" });
  for (const { file, errors } of skipped) {
    console.warn(`⚠ 跳過 ${file}（不符合題庫格式）`);
    errors.forEach((e) => console.warn(`    ${e}`));
  }
  if (skipped.length) console.warn(`共跳過 ${skipped.length} 個檔案，用 quizkit validate 可以再檢查一次。\n`);
  const entries = orderBanks(loaded);
  if (!entries.length) throw new Error("沒有可用的題庫");

  // 附圖：同一路徑若來自不同檔案會衝突，先檢查
  const assets = new Map();
  for (const { file, bank } of entries) {
    for (const rel of bankAssets(bank)) {
      const abs = resolveAsset(file, rel);
      if (assets.has(rel) && assets.get(rel) !== abs) {
        throw new Error(`附圖路徑 ${rel} 同時對應到 ${assets.get(rel)} 與 ${abs}，請改用不同的資料夾名稱`);
      }
      assets.set(rel, abs);
    }
  }

  const template = fs.readFileSync(path.join(ROOT, "app/index.html"), "utf8");
  const js = await bundleApp();
  const page = (scripts) =>
    template.replace("<!--QUIZKIT_TITLE-->", escapeHtml(title)).replace("<!--QUIZKIT_SCRIPTS-->", () => scripts);

  if (format === "single") {
    const data = {
      title,
      banks: entries.map((e) => e.bank),
      assets: Object.fromEntries(
        [...assets].map(([rel, abs]) => {
          const mime = MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
          return [rel, `data:${mime};base64,${fs.readFileSync(abs).toString("base64")}`];
        }),
      ),
    };
    const html = page(
      `<script>window.QUIZKIT_DATA=${scriptJson(data)};</script>\n<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`,
    );
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, html);
    report(out, entries, assets, skipped, Buffer.byteLength(html));
  } else {
    fs.rmSync(path.join(out, "data"), { recursive: true, force: true });
    fs.rmSync(path.join(out, "assets"), { recursive: true, force: true });
    fs.mkdirSync(path.join(out, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(out, "data/index.json"),
      JSON.stringify({ title, banks: entries.map((e) => bankMeta(e.bank)) }),
    );
    for (const { bank } of entries) {
      fs.writeFileSync(path.join(out, "data", `${bank.id}.json`), JSON.stringify(bank));
    }
    for (const [rel, abs] of assets) {
      const dest = path.join(out, "assets", rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
    }
    fs.writeFileSync(path.join(out, "app.js"), js);
    fs.writeFileSync(path.join(out, "index.html"), page('<script src="app.js"></script>'));
    report(out, entries, assets, skipped);
  }
  return { banks: entries.map((e) => e.bank.id), skipped };
}

function report(out, entries, assets, skipped, bytes) {
  const total = entries.reduce((n, e) => n + e.bank.questions.length, 0);
  const size = bytes ? `，${(bytes / 1024 / 1024).toFixed(1)} MB` : "";
  const skip = skipped.length ? `（跳過 ${skipped.length} 個不符格式的檔案）` : "";
  console.log(`已產生 ${out}：${entries.length} 份題庫、${total} 題、${assets.size} 張附圖${size}${skip}`);
}
