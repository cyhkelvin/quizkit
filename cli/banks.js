// 題庫的載入、格式檢查與附圖路徑解析，validate 與 build 共用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

let validators;
function getValidators() {
  if (!validators) {
    const ajv = new Ajv({ allErrors: true, strictTuple: false });
    validators = {
      bank: ajv.compile(readJson(path.join(ROOT, "schema/bank.schema.json"))),
      progress: ajv.compile(readJson(path.join(ROOT, "schema/progress.schema.json"))),
    };
  }
  return validators;
}

/** 列出路徑底下所有 .json（遞迴，略過 node_modules 與隱藏資料夾）。 */
export function findJsonFiles(target, { skipExamples = false } = {}) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (skipExamples && entry.isDirectory() && entry.name === "examples") continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...findJsonFiles(full, { skipExamples }));
    else if (entry.name.endsWith(".json")) out.push(full);
  }
  return out.sort();
}

/**
 * 找附圖檔：從題庫檔所在資料夾往上找 assets/<相對路徑>。
 * 這樣公開 repo 的 banks/aws/*.json 會用 quizkit/assets/，
 * clone 進 banks/private-ipas/ 的私有題庫會用 banks/private-ipas/assets/。
 */
export function resolveAsset(bankFile, rel) {
  let dir = path.dirname(path.resolve(bankFile));
  for (;;) {
    const candidate = path.join(dir, "assets", rel);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 題庫引用的所有附圖路徑。 */
export function bankAssets(bank) {
  const set = new Set();
  for (const p of Object.values(bank.passages || {})) {
    for (const b of p.blocks) if (b.type === "img") set.add(b.value);
  }
  for (const q of bank.questions) {
    (q.figures || []).forEach((f) => set.add(f));
    (q.optionFigures || []).forEach((list) => (list || []).forEach((f) => set.add(f)));
  }
  return [...set];
}

function schemaErrors(validate) {
  return (validate.errors || []).map((e) => {
    const extra = e.params && e.params.additionalProperty ? `：${e.params.additionalProperty}` : "";
    return `${e.instancePath || "(根)"} ${e.message}${extra}`;
  });
}

/** 檢查一份題庫，回傳錯誤訊息陣列（空陣列代表通過）。 */
export function checkBank(bank, file) {
  const { bank: validate } = getValidators();
  if (!validate(bank)) return schemaErrors(validate);

  const errors = [];
  const seen = new Set();
  const passages = bank.passages || {};
  for (const q of bank.questions) {
    const where = `第 ${q.n} 題`;
    if (seen.has(q.n)) errors.push(`${where}：題號重複`);
    seen.add(q.n);
    const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
    for (const a of answers) {
      if (a >= q.options.length) errors.push(`${where}：答案 ${a} 超出選項範圍（共 ${q.options.length} 個選項）`);
    }
    if (q.domain !== undefined) {
      if (!bank.domains) errors.push(`${where}：有 domain，但題庫沒有 domains`);
      else if (q.domain > bank.domains.length) errors.push(`${where}：domain ${q.domain} 超出 domains 範圍`);
    }
    if (q.passage !== undefined && !passages[q.passage]) errors.push(`${where}：找不到題組 "${q.passage}"`);
    if (q.optionFigures && q.optionFigures.length > q.options.length) {
      errors.push(`${where}：optionFigures 比選項多`);
    }
  }
  for (const [key, p] of Object.entries(passages)) {
    for (const n of p.questions || []) {
      if (!seen.has(n)) errors.push(`題組 "${key}"：列出的第 ${n} 題不存在`);
    }
  }
  if (file) {
    for (const rel of bankAssets(bank)) {
      if (!resolveAsset(file, rel)) errors.push(`找不到附圖 assets/${rel}`);
    }
  }
  return errors;
}

/** 檢查進度檔。 */
export function checkProgress(data) {
  const { progress: validate } = getValidators();
  return validate(data) ? [] : schemaErrors(validate);
}

/**
 * 讀取並檢查路徑底下的題庫。不符格式的檔案會跳過，不會中斷。
 * 回傳 { banks: [{ file, bank }], skipped: [{ file, errors }] }。
 * opts.skipExamples 為 "auto" 時，只有路徑本身不在 examples/ 裡才略過 examples/。
 */
export function loadBanks(targets, opts = {}) {
  const banks = [];
  const skipped = [];
  const ids = new Map();
  for (const target of targets) {
    const skipExamples =
      opts.skipExamples === "auto" ? !path.resolve(target).split(path.sep).includes("examples") : !!opts.skipExamples;
    for (const file of findJsonFiles(target, { skipExamples })) {
      let bank;
      try {
        bank = readJson(file);
      } catch (e) {
        skipped.push({ file, errors: [`JSON 解析失敗（${e.message}）`] });
        continue;
      }
      if (bank && typeof bank.format === "string") continue; // 進度檔，不是題庫
      const errors = checkBank(bank, file);
      if (!errors.length && ids.has(bank.id)) errors.push(`題庫 ID "${bank.id}" 與 ${ids.get(bank.id)} 重複`);
      if (errors.length) {
        skipped.push({ file, errors });
        continue;
      }
      ids.set(bank.id, file);
      banks.push({ file, bank });
    }
  }
  return { banks, skipped };
}
