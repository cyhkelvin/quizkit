// 進度資料：多使用者、作答紀錄、匯入匯出。純函式，不碰 DOM，方便測試。
//
// localStorage 裡的結構：
//   { current: "我", users: { "我": { banks: { <題庫ID>: BankProgress } } } }
// BankProgress 與匯出檔（quizkit-progress/1）的 banks[id] 相同：
//   { bankVersion, attempts: [...], lastResult: { "<題號>": [1|0, 時間戳] } }

export const FORMAT = "quizkit-progress/1";
export const DEFAULT_USER = "我";
export const MAX_ATTEMPTS = 100;

export function emptyStore() {
  return { current: DEFAULT_USER, users: { [DEFAULT_USER]: { banks: {} } } };
}

/** 讀進來的資料不完整或壞掉時，補成可用的結構。 */
export function normalizeStore(s) {
  if (!s || typeof s !== "object" || !s.users || typeof s.users !== "object") return emptyStore();
  const users = {};
  for (const [name, u] of Object.entries(s.users)) {
    users[name] = { banks: (u && typeof u.banks === "object" && u.banks) || {} };
  }
  if (!Object.keys(users).length) return emptyStore();
  const current = users[s.current] ? s.current : Object.keys(users)[0];
  return { current, users };
}

// ---------- 使用者 ----------

export function addUser(store, name) {
  name = (name || "").trim();
  if (!name) throw new Error("請輸入名稱");
  if (store.users[name]) throw new Error(`已經有「${name}」了`);
  return { current: name, users: { ...store.users, [name]: { banks: {} } } };
}

export function switchUser(store, name) {
  if (!store.users[name]) return store;
  return { ...store, current: name };
}

export function renameUser(store, from, to) {
  to = (to || "").trim();
  if (!to) throw new Error("請輸入名稱");
  if (to === from) return store;
  if (store.users[to]) throw new Error(`已經有「${to}」了`);
  const users = {};
  for (const [k, v] of Object.entries(store.users)) users[k === from ? to : k] = v;
  return { current: store.current === from ? to : store.current, users };
}

/** 刪除使用者；刪掉最後一位時會重建一位空白的預設使用者。 */
export function deleteUser(store, name) {
  const users = { ...store.users };
  delete users[name];
  if (!Object.keys(users).length) return emptyStore();
  const current = store.current === name ? Object.keys(users)[0] : store.current;
  return { current, users };
}

// ---------- 作答 ----------

export function answerList(q) {
  return Array.isArray(q.answer) ? q.answer : [q.answer];
}
export function isMulti(q) {
  return Array.isArray(q.answer);
}
export function isAnswered(q, my) {
  return isMulti(q) ? Array.isArray(my) && my.length > 0 : my !== undefined && my !== null;
}
export function isCorrect(q, my) {
  if (!isAnswered(q, my)) return false;
  if (!isMulti(q)) return my === q.answer;
  if (my.length !== q.answer.length) return false;
  const s = new Set(my);
  return q.answer.every((x) => s.has(x));
}

/**
 * 記錄一次作答，回傳新的 BankProgress 與本次成績。
 * 完整考卷中沒作答的題目也記為答錯；其他模式只記有作答的題目。
 */
export function recordAttempt(bp, { bank, mode, domain, questions, answers, durationSec, at = Date.now() }) {
  bp = bp || { attempts: [], lastResult: {} };
  const correct = questions.filter((q) => isCorrect(q, answers[q.n])).length;
  const total = questions.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const lastResult = { ...(bp.lastResult || {}) };
  for (const q of questions) {
    if (mode === "full" || isAnswered(q, answers[q.n])) {
      lastResult[q.n] = [isCorrect(q, answers[q.n]) ? 1 : 0, at];
    }
  }
  const attempt = { mode, correct, total, score, at, durationSec: Math.round(durationSec || 0) };
  if (mode === "domain") attempt.domain = domain;
  return {
    progress: {
      bankVersion: bank.version,
      attempts: [...(bp.attempts || []), attempt].slice(-MAX_ATTEMPTS),
      lastResult,
    },
    correct,
    score,
  };
}

/** 題庫的進度摘要（首頁與題庫頁顯示用）。 */
export function bankStatus(bp, count) {
  const attempts = (bp && bp.attempts) || [];
  const r = (bp && bp.lastResult) || {};
  const results = Object.values(r);
  const fulls = attempts.filter((a) => a.mode === "full");
  return {
    attempts,
    seen: results.length,
    wrong: results.filter((v) => v[0] === 0).length,
    fullCount: fulls.length,
    bestFull: fulls.length ? Math.max(...fulls.map((a) => a.score)) : null,
    last: attempts.length ? attempts[attempts.length - 1] : null,
    total: count,
  };
}

/** 目前答錯（最近一次結果是錯）的題號。 */
export function wrongNumbers(bp) {
  const r = (bp && bp.lastResult) || {};
  return new Set(Object.keys(r).filter((n) => r[n][0] === 0).map(Number));
}

// ---------- 合併、匯出、匯入 ----------

/** 合併兩份 BankProgress：作答紀錄依時間合併去重；同一題保留較新的結果。 */
export function mergeBankProgress(a, b) {
  a = a || {};
  b = b || {};
  const byKey = new Map();
  for (const t of [...(a.attempts || []), ...(b.attempts || [])]) byKey.set(`${t.at}|${t.mode}|${t.domain || ""}`, t);
  const attempts = [...byKey.values()].sort((x, y) => x.at - y.at).slice(-MAX_ATTEMPTS);
  const lastResult = { ...(a.lastResult || {}) };
  for (const [n, v] of Object.entries(b.lastResult || {})) {
    if (!lastResult[n] || lastResult[n][1] < v[1]) lastResult[n] = v;
  }
  const out = { attempts, lastResult };
  const version = b.bankVersion || a.bankVersion;
  if (version) out.bankVersion = version;
  return out;
}

export function exportProgress(store, user = store.current, now = new Date()) {
  return {
    format: FORMAT,
    user,
    exportedAt: localIso(now),
    banks: (store.users[user] && store.users[user].banks) || {},
  };
}

export function exportFileName(user, now = new Date()) {
  const d = localIso(now).slice(0, 10);
  const safe = user.replace(/[\\/:*?"<>|\s]+/g, "_");
  return `quizkit-progress-${safe}-${d}.json`;
}

/** 帶時區的 ISO 時間，例如 2026-11-10T13:57:00+08:00 */
function localIso(d) {
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const tz = `${off >= 0 ? "+" : "-"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${tz}`
  );
}

/** 檢查匯入檔的基本結構，不合格就丟出錯誤。 */
export function parseProgressFile(data) {
  if (!data || typeof data !== "object") throw new Error("檔案內容不是 JSON 物件");
  if (data.format !== FORMAT) throw new Error(`不是 quizkit 進度檔（format 應為 ${FORMAT}）`);
  if (!data.banks || typeof data.banks !== "object") throw new Error("進度檔缺少 banks");
  return data;
}

/**
 * 把匯入檔套用到某位使用者。
 * banksById：這個入口裡有的題庫（id → bank），用來略過已刪除的題庫與題目。
 * mode：merge（合併）或 overwrite（覆蓋）。
 * 回傳 { banks, stats }，stats 記錄匯入與略過的數量。
 */
export function applyImport(userBanks, file, banksById, mode = "merge") {
  parseProgressFile(file);
  const stats = { banks: 0, results: 0, attempts: 0, skippedBanks: [], skippedQuestions: 0 };
  const imported = {};
  for (const [id, bp] of Object.entries(file.banks)) {
    const bank = banksById[id];
    if (!bank) {
      stats.skippedBanks.push(id);
      continue;
    }
    const valid = new Set(bank.questions.map((q) => String(q.n)));
    const lastResult = {};
    for (const [n, v] of Object.entries((bp && bp.lastResult) || {})) {
      if (valid.has(n) && Array.isArray(v) && v.length === 2) lastResult[n] = [v[0] ? 1 : 0, Number(v[1]) || 0];
      else stats.skippedQuestions++;
    }
    const attempts = ((bp && bp.attempts) || []).filter((t) => t && typeof t.at === "number" && t.mode);
    imported[id] = { bankVersion: (bp && bp.bankVersion) || bank.version, attempts, lastResult };
    stats.banks++;
    stats.results += Object.keys(lastResult).length;
    stats.attempts += attempts.length;
  }
  let banks;
  if (mode === "overwrite") banks = imported;
  else {
    banks = { ...userBanks };
    for (const [id, bp] of Object.entries(imported)) banks[id] = mergeBankProgress(userBanks[id], bp);
  }
  return { banks, stats };
}
