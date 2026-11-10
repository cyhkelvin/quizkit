#!/usr/bin/env node
// 把舊版 artifact 的題目檔（n/d/q/o/a/e/p/f/of）轉成 quizkit 題庫格式。
//
// 用法：
//   node scripts/convert-legacy.js <舊題目檔...> --index legacy/index.json --out-dir banks/aws
//     [--img-prefix ipas/] [--version 2026.11.1]
//
// --index 是舊 artifact 的試卷目錄（含 title、minutes、pass、domains）。
// 舊附圖路徑是 img/<檔名>，轉換後變成 <img-prefix><檔名>，相對於 assets/。
import fs from "node:fs";
import path from "node:path";

const SUBNO = ["", "科目一", "科目二", "科目三"];

const AWS_SOURCE =
  "原創模擬題：依 AWS 官方 exam guide 的題數、題型與領域配分撰寫，非 AWS 官方題目，也未參考任何外流真題。" +
  "AWS 實際以 100–1000 量表計分，這裡以答對百分比近似。";
const IPAS_SOURCE =
  "iPAS 經濟部產業人才能力鑑定 AI 應用規劃師官方公告試題，著作權屬官方。" +
  "題目整理參考 Oliviaiii/iPas-quiz；詳解多數取自 yazelin/ipas-ai-quiz（MIT License, © 2026 林亞澤），少數由 Claude 補寫。詳解非官方，僅供參考。";

export function convertBank(legacy, meta, { imgPrefix = "", version = "2026.11.1" } = {}) {
  const img = (p) => imgPrefix + p.replace(/^img\//, "");
  const isAws = meta.group === "AWS";

  const bank = { id: legacy.id };
  if (isAws) {
    Object.assign(bank, {
      group: "AWS",
      section: "AWS 認證・原創模擬題",
      title: `${meta.title}（${meta.code}）`,
      subtitle: `${meta.code}・${meta.tier}`,
      code: meta.code,
    });
  } else {
    Object.assign(bank, {
      group: `iPAS ${meta.level}`,
      section: `${meta.year} 年${meta.sessionLabel}（考試日 ${meta.date}）`,
      title: `${SUBNO[meta.subjectNo]}・${meta.subject}`,
      subtitle: `${meta.year} 年${meta.sessionLabel}・考試日 ${meta.date}`,
      date: meta.date,
    });
  }
  bank.version = version;
  bank.minutes = meta.minutes;
  bank.passPercent = meta.pass;
  if (meta.shuffleFull) bank.shuffleFull = true;
  if (meta.domains) bank.domains = meta.domains;
  bank.source = isAws ? AWS_SOURCE : IPAS_SOURCE;
  if (meta.note) bank.note = meta.note;

  const passages = {};
  for (const [key, p] of Object.entries(legacy.p || {})) {
    passages[key] = {
      questions: p.nums,
      blocks: p.b.map((b) => ({ type: b.k, value: b.k === "img" ? img(b.v) : b.v })),
    };
  }
  if (Object.keys(passages).length) bank.passages = passages;

  bank.questions = legacy.q.map((q) => {
    const out = { n: q.n };
    if (q.d !== undefined) out.domain = q.d;
    if (q.p !== undefined) out.passage = String(q.p);
    out.q = q.q;
    out.options = q.o;
    out.answer = q.a;
    if (q.e !== undefined) out.explanation = q.e;
    if (q.f) out.figures = q.f.map(img);
    if (q.of) out.optionFigures = q.of.map((list) => (list ? list.map(img) : null));
    return out;
  });
  return bank;
}

function main(argv) {
  const files = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) opts[a.slice(2)] = argv[++i];
    else files.push(a);
  }
  if (!files.length || !opts.index || !opts["out-dir"]) {
    console.error("用法：convert-legacy.js <舊題目檔...> --index <index.json> --out-dir <資料夾> [--img-prefix <前綴>] [--version <版本>]");
    process.exit(1);
  }
  const index = JSON.parse(fs.readFileSync(opts.index, "utf8"));
  fs.mkdirSync(opts["out-dir"], { recursive: true });
  for (const f of files) {
    const legacy = JSON.parse(fs.readFileSync(f, "utf8"));
    const meta = index.find((m) => m.id === legacy.id);
    if (!meta) {
      console.error(`找不到 ${legacy.id} 的目錄資料，略過 ${f}`);
      process.exitCode = 1;
      continue;
    }
    const bank = convertBank(legacy, meta, { imgPrefix: opts["img-prefix"] || "", version: opts.version });
    const out = path.join(opts["out-dir"], `${bank.id}.json`);
    fs.writeFileSync(out, JSON.stringify(bank, null, 2) + "\n");
    console.log(`${f} → ${out}（${bank.questions.length} 題）`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("convert-legacy.js")) {
  main(process.argv.slice(2));
}
