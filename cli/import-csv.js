// CSV 轉題庫 JSON。欄位：domain, question, A, B, C, D, E, answer, explanation
// 複選答案寫成 A;C。第一列是標題列。
import fs from "node:fs";
import path from "node:path";
import { checkBank } from "./banks.js";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** RFC 4180 CSV 解析：支援引號、引號內換行與 "" 跳脫。 */
export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function csvToBank(text, { id, group, title, version = "1", minutes, passPercent = 70 }) {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("CSV 是空的");
  const col = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
  for (const need of ["question", "answer"]) {
    if (col[need] === undefined) throw new Error(`CSV 缺少 ${need} 欄`);
  }
  const optionCols = LETTERS.filter((l) => col[l.toLowerCase()] !== undefined);
  const get = (r, name) => (col[name] === undefined ? "" : (r[col[name]] || "").trim());

  const domains = new Map();
  const questions = rows.map((r, i) => {
    const line = i + 2;
    const options = optionCols.map((l) => get(r, l.toLowerCase()));
    while (options.length && options[options.length - 1] === "") options.pop();
    if (options.includes("")) throw new Error(`第 ${line} 列的選項中間有空白，答案字母會對不上`);
    const letters = get(r, "answer").toUpperCase().split(/[;；,，\s]+/).filter(Boolean);
    if (!letters.length) throw new Error(`第 ${line} 列沒有答案`);
    const idx = letters.map((l) => {
      const k = LETTERS.indexOf(l);
      if (k < 0 || k >= options.length) throw new Error(`第 ${line} 列的答案「${l}」沒有對應的選項`);
      return k;
    });
    const q = { n: i + 1 };
    const d = get(r, "domain");
    if (d) {
      if (!domains.has(d)) domains.set(d, domains.size + 1);
      q.domain = domains.get(d);
    }
    q.q = get(r, "question");
    q.options = options;
    q.answer = idx.length > 1 ? idx : idx[0];
    const e = get(r, "explanation");
    if (e) q.explanation = e;
    return q;
  });

  const bank = {
    id,
    group,
    title: title || id,
    version,
    minutes: minutes || Math.max(10, Math.ceil(questions.length * 1.5)),
    passPercent,
  };
  if (domains.size) bank.domains = [...domains.keys()];
  bank.questions = questions;
  return bank;
}

/** domain 欄可以填名稱或數字；填數字時 domains 會變成「領域 1」這類名稱。 */
function normalizeNumericDomains(bank) {
  if (!bank.domains || !bank.domains.every((d) => /^\d+$/.test(d))) return bank;
  const max = Math.max(...bank.domains.map(Number));
  const byName = new Map(bank.domains.map((d, i) => [i + 1, Number(d)]));
  bank.domains = Array.from({ length: max }, (_, i) => `領域 ${i + 1}`);
  for (const q of bank.questions) if (q.domain) q.domain = byName.get(q.domain);
  return bank;
}

export function importCsv(file, opts) {
  if (!opts.id || !opts.group || !opts.out) {
    throw new Error("需要 --id、--group 與 --out");
  }
  const bank = normalizeNumericDomains(
    csvToBank(fs.readFileSync(file, "utf8"), {
      id: opts.id,
      group: opts.group,
      title: opts.title,
      version: opts.version,
      minutes: opts.minutes ? Number(opts.minutes) : undefined,
      passPercent: opts.pass ? Number(opts.pass) : undefined,
    }),
  );
  const errors = checkBank(bank);
  if (errors.length) throw new Error("轉換結果沒有通過檢查：\n  " + errors.join("\n  "));
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(bank, null, 2) + "\n");
  console.log(`已寫入 ${opts.out}（${bank.questions.length} 題）`);
  return bank;
}
