import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseCsv, csvToBank } from "../cli/import-csv.js";
import { checkBank, checkProgress, loadBanks } from "../cli/banks.js";
import { convertBank } from "../scripts/convert-legacy.js";
import { build, orderBanks } from "../cli/build.js";

const ROOT = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "quizkit-"));
const minimal = (extra = {}) => ({
  id: "t",
  group: "G",
  title: "T",
  version: "1",
  minutes: 10,
  passPercent: 70,
  questions: [{ n: 1, q: "?", options: ["a", "b"], answer: 0 }],
  ...extra,
});

test("parseCsv：引號、跳脫、換行、BOM", () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"多\n行",z\n\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"'], ["多\n行", "z"]]);
});

test("csvToBank：單選、複選、領域", () => {
  const bank = csvToBank("domain,question,A,B,C,answer,explanation\nd1,Q1,a,b,c,B,why\nd2,Q2,a,b,c,A;C,\n", {
    id: "x",
    group: "g",
  });
  assert.deepEqual(bank.domains, ["d1", "d2"]);
  assert.equal(bank.questions[0].answer, 1);
  assert.deepEqual(bank.questions[1].answer, [0, 2]);
  assert.equal(bank.questions[1].explanation, undefined);
  assert.deepEqual(checkBank(bank), []);
  assert.throws(() => csvToBank("question,A,B,answer\nQ,a,b,C\n", { id: "x", group: "g" }), /沒有對應的選項/);
  assert.throws(() => csvToBank("question,A,B,C,answer\nQ,a,,c,A\n", { id: "x", group: "g" }), /中間有空白/);
});

test("checkBank：語意錯誤", () => {
  assert.deepEqual(checkBank(minimal()), []);
  const bad = minimal({
    questions: [
      { n: 1, q: "?", options: ["a", "b"], answer: 5, domain: 1, passage: "p" },
      { n: 1, q: "?", options: ["a", "b"], answer: 0 },
    ],
  });
  const errs = checkBank(bad).join("\n");
  assert.match(errs, /題號重複/);
  assert.match(errs, /超出選項範圍/);
  assert.match(errs, /題庫沒有 domains/);
  assert.match(errs, /找不到題組/);
  assert.ok(checkBank({ ...minimal(), id: "有空白 的id" }).length > 0);
});

test("checkProgress：README 範例格式", () => {
  const ok = {
    format: "quizkit-progress/1",
    user: "我",
    banks: { a: { bankVersion: "1", attempts: [{ mode: "domain", domain: 1, correct: 8, total: 10, score: 80, at: 1 }], lastResult: { 1: [1, 1] } } },
  };
  assert.deepEqual(checkProgress(ok), []);
  assert.ok(checkProgress({ ...ok, format: "other" }).length);
});

test("convertBank：舊格式轉新格式", () => {
  const legacy = {
    id: "mid-1",
    p: { 2: { nums: [2], b: [{ k: "text", v: "說明" }, { k: "img", v: "img/x.webp" }] } },
    q: [
      { n: 1, q: "Q", o: ["a", "b"], a: 1, e: "E", f: ["img/f.webp"], of: [["img/o.webp"], null] },
      { n: 2, p: 2, q: "Q2", o: ["a", "b"], a: 0, e: "E2" },
    ],
  };
  const meta = { id: "mid-1", level: "中級", year: 115, session: 1, sessionLabel: "第一次", subjectNo: 2, subject: "大數據", date: "2026-05-23", minutes: 90, group: "中級", pass: 70 };
  const bank = convertBank(legacy, meta, { imgPrefix: "ipas/" });
  assert.equal(bank.group, "iPAS 中級");
  assert.equal(bank.title, "科目二・大數據");
  assert.equal(bank.passPercent, 70);
  assert.deepEqual(bank.passages["2"].blocks[1], { type: "img", value: "ipas/x.webp" });
  assert.deepEqual(bank.questions[0].figures, ["ipas/f.webp"]);
  assert.deepEqual(bank.questions[0].optionFigures, [["ipas/o.webp"], null]);
  assert.equal(bank.questions[1].passage, "2");
  assert.deepEqual(checkBank(bank), []);
});

test("orderBanks：同分頁依考試日新到舊", () => {
  const e = (id, group, date) => ({ bank: { id, group, date } });
  const out = orderBanks([e("a", "X"), e("old", "Y", "2025-01-01"), e("b", "X"), e("new", "Y", "2026-01-01")]);
  assert.deepEqual(out.map((x) => x.bank.id), ["a", "b", "new", "old"]);
});

test("loadBanks：不符格式、缺附圖、重複 ID 的檔案會跳過，不會中斷", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify(minimal()));
  fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify(minimal()));
  const withFig = minimal({ id: "f" });
  withFig.questions[0].figures = ["nope.png"];
  fs.writeFileSync(path.join(dir, "f.json"), JSON.stringify(withFig));
  const extra = minimal({ id: "x" });
  extra.questions[0].question = "多餘欄位";
  fs.writeFileSync(path.join(dir, "x.json"), JSON.stringify(extra));
  fs.writeFileSync(path.join(dir, "broken.json"), "{ not json");
  fs.writeFileSync(path.join(dir, "progress.json"), JSON.stringify({ format: "quizkit-progress/1", user: "u", banks: {} }));

  const { banks, skipped } = loadBanks([dir]);
  assert.deepEqual(banks.map((b) => path.basename(b.file)), ["a.json"]);
  const why = Object.fromEntries(skipped.map((s) => [path.basename(s.file), s.errors.join("\n")]));
  assert.deepEqual(Object.keys(why).sort(), ["b.json", "broken.json", "f.json", "x.json"]);
  assert.match(why["b.json"], /重複/);
  assert.match(why["f.json"], /找不到附圖/);
  assert.match(why["x.json"], /additional properties：question/);
  assert.match(why["broken.json"], /JSON 解析失敗/);
});

test("build：跳過不符格式的題庫，用其他題庫繼續", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "ok.json"), JSON.stringify(minimal({ id: "ok" })));
  fs.writeFileSync(path.join(dir, "bad.json"), JSON.stringify({ ...minimal({ id: "bad" }), choices: [] }));
  const res = await build({ banks: [dir], out: path.join(dir, "out.html") });
  assert.deepEqual(res.banks, ["ok"]);
  assert.equal(res.skipped.length, 1);
  assert.ok(fs.existsSync(path.join(dir, "out.html")));

  fs.rmSync(path.join(dir, "ok.json"));
  await assert.rejects(build({ banks: [dir], out: path.join(dir, "out2.html") }), /沒有可用的題庫/);
});

test("build：不同 --banks 路徑之間的重複 ID 也會被發現", async () => {
  const a = tmp(), b = tmp();
  fs.writeFileSync(path.join(a, "x.json"), JSON.stringify(minimal({ id: "same" })));
  fs.writeFileSync(path.join(b, "y.json"), JSON.stringify(minimal({ id: "same" })));
  const res = await build({ banks: [a, b], out: path.join(a, "out.html") });
  assert.equal(res.banks.length, 1);
  assert.match(res.skipped[0].errors[0], /重複/);
});

test("build：單一 HTML 內嵌題庫與附圖，資料夾版拆檔", async () => {
  const out = tmp();
  const examples = path.join(ROOT, "banks/examples");
  await build({ banks: [examples], out: path.join(out, "one.html") });
  const html = fs.readFileSync(path.join(out, "one.html"), "utf8");
  assert.match(html, /window\.QUIZKIT_DATA=/);
  assert.match(html, /data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(html, /cdnjs|unpkg/);

  await build({ banks: [examples], out: path.join(out, "site"), format: "folder", title: "測試" });
  const index = JSON.parse(fs.readFileSync(path.join(out, "site/data/index.json"), "utf8"));
  assert.equal(index.title, "測試");
  assert.equal(index.banks[0].count, 5);
  assert.equal(index.banks[0].questions, undefined);
  assert.ok(fs.existsSync(path.join(out, "site/data/sample.json")));
  assert.ok(fs.existsSync(path.join(out, "site/assets/examples/right-triangle.svg")));
  assert.ok(fs.existsSync(path.join(out, "site/app.js")));
});

test("build：banks/ 預設不打包 examples", async () => {
  const out = path.join(tmp(), "p.html");
  await build({ banks: [path.join(ROOT, "banks")], out });
  const html = fs.readFileSync(out, "utf8");
  assert.doesNotMatch(html, /"id":"sample"/);
  assert.match(html, /"id":"aws-saa-c03"/);
});

test("CLI：validate 公開題庫通過", () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, "cli/index.js"), "validate", path.join(ROOT, "banks")], { encoding: "utf8" });
  assert.match(out, /通過檢查/);
});
