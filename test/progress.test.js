import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyStore,
  normalizeStore,
  addUser,
  renameUser,
  deleteUser,
  isCorrect,
  recordAttempt,
  bankStatus,
  wrongNumbers,
  mergeBankProgress,
  exportProgress,
  exportFileName,
  applyImport,
  FORMAT,
} from "../app/progress.js";

const bank = {
  id: "b",
  version: "2",
  questions: [
    { n: 1, q: "1", options: ["a", "b"], answer: 0 },
    { n: 2, q: "2", options: ["a", "b", "c"], answer: [0, 2] },
    { n: 3, q: "3", options: ["a", "b"], answer: 1 },
  ],
};

test("isCorrect 單選與複選", () => {
  assert.equal(isCorrect(bank.questions[0], 0), true);
  assert.equal(isCorrect(bank.questions[0], 1), false);
  assert.equal(isCorrect(bank.questions[0], undefined), false);
  assert.equal(isCorrect(bank.questions[1], [2, 0]), true);
  assert.equal(isCorrect(bank.questions[1], [0]), false);
  assert.equal(isCorrect(bank.questions[1], [0, 1]), false);
});

test("recordAttempt：完整考卷未答記為錯，其他模式只記有答的題", () => {
  const full = recordAttempt(null, { bank, mode: "full", questions: bank.questions, answers: { 1: 0 }, durationSec: 12.4, at: 100 });
  assert.equal(full.correct, 1);
  assert.equal(full.score, 33);
  assert.deepEqual(full.progress.lastResult, { 1: [1, 100], 2: [0, 100], 3: [0, 100] });
  assert.deepEqual(full.progress.attempts[0], { mode: "full", correct: 1, total: 3, score: 33, at: 100, durationSec: 12 });
  assert.equal(full.progress.bankVersion, "2");

  const quick = recordAttempt(full.progress, { bank, mode: "domain", domain: 2, questions: bank.questions, answers: { 3: 1 }, at: 200 });
  assert.deepEqual(quick.progress.lastResult[3], [1, 200]);
  assert.deepEqual(quick.progress.lastResult[2], [0, 100]);
  assert.equal(quick.progress.attempts[1].domain, 2);
  assert.deepEqual([...wrongNumbers(quick.progress)], [2]);

  const st = bankStatus(quick.progress, 3);
  assert.equal(st.seen, 3);
  assert.equal(st.wrong, 1);
  assert.equal(st.bestFull, 33);
  assert.equal(st.last.mode, "domain");
});

test("使用者新增、改名、刪除", () => {
  let s = emptyStore();
  s = addUser(s, " 小明 ");
  assert.equal(s.current, "小明");
  assert.throws(() => addUser(s, "我"));
  s = renameUser(s, "小明", "阿明");
  assert.deepEqual(Object.keys(s.users).sort(), ["我", "阿明"].sort());
  assert.equal(s.current, "阿明");
  s = deleteUser(s, "阿明");
  assert.equal(s.current, "我");
  s = deleteUser(s, "我");
  assert.deepEqual(s, emptyStore());
});

test("normalizeStore 修復壞資料", () => {
  assert.deepEqual(normalizeStore(null), emptyStore());
  assert.deepEqual(normalizeStore({ users: {} }), emptyStore());
  const s = normalizeStore({ current: "不存在", users: { A: {} } });
  assert.equal(s.current, "A");
  assert.deepEqual(s.users.A, { banks: {} });
});

test("mergeBankProgress：紀錄去重、同題保留較新", () => {
  const a = { attempts: [{ mode: "quick", at: 1 }, { mode: "full", at: 3 }], lastResult: { 1: [1, 10], 2: [0, 5] } };
  const b = { attempts: [{ mode: "quick", at: 1 }, { mode: "quick", at: 2 }], lastResult: { 1: [0, 5], 2: [1, 20] }, bankVersion: "x" };
  const m = mergeBankProgress(a, b);
  assert.deepEqual(m.attempts.map((t) => t.at), [1, 2, 3]);
  assert.deepEqual(m.lastResult, { 1: [1, 10], 2: [1, 20] });
  assert.equal(m.bankVersion, "x");
});

test("匯出格式與檔名", () => {
  const s = emptyStore();
  s.users["我"].banks.b = { attempts: [], lastResult: {} };
  const out = exportProgress(s, "我", new Date(2026, 10, 10, 13, 57));
  assert.equal(out.format, FORMAT);
  assert.equal(out.user, "我");
  assert.match(out.exportedAt, /^2026-11-10T13:57:00[+-]\d\d:\d\d$/);
  assert.equal(exportFileName("我", new Date(2026, 10, 10)), "quizkit-progress-我-2026-11-10.json");
  assert.equal(exportFileName("a/b c", new Date(2026, 10, 10)), "quizkit-progress-a_b_c-2026-11-10.json");
});

test("applyImport：合併、覆蓋、略過不存在的題庫與題目", () => {
  const file = {
    format: FORMAT,
    user: "我",
    banks: {
      b: { bankVersion: "1", attempts: [{ mode: "quick", correct: 1, total: 2, score: 50, at: 50 }], lastResult: { 1: [0, 50], 99: [1, 50] } },
      gone: { attempts: [], lastResult: {} },
    },
  };
  const mine = {
    b: { attempts: [{ mode: "full", at: 10 }], lastResult: { 1: [1, 60], 3: [0, 10] } },
    other: { attempts: [], lastResult: {} },
  };
  const merged = applyImport(mine, file, { b: bank }, "merge");
  assert.equal(merged.stats.banks, 1);
  assert.equal(merged.stats.skippedQuestions, 1);
  assert.deepEqual(merged.stats.skippedBanks, ["gone"]);
  assert.deepEqual(merged.banks.b.lastResult, { 1: [1, 60], 3: [0, 10] });
  assert.equal(merged.banks.b.attempts.length, 2);
  assert.ok(merged.banks.other);

  const over = applyImport(mine, file, { b: bank }, "overwrite");
  assert.deepEqual(over.banks.b.lastResult, { 1: [0, 50] });
  assert.equal(over.banks.other, undefined);

  assert.throws(() => applyImport({}, { format: "x", banks: {} }, {}), /不是 quizkit 進度檔/);
});
