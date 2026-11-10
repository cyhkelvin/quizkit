import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  normalizeStore,
  addUser,
  switchUser,
  renameUser,
  deleteUser,
  answerList,
  isMulti,
  isAnswered,
  isCorrect,
  recordAttempt,
  bankStatus,
  wrongNumbers,
  exportProgress,
  exportFileName,
  parseProgressFile,
  applyImport,
} from "./progress.js";

const KEYS = "ABCDEFGH".split("");
const LS_KEY = "quizkit:progress:v1";
const MODE_LABEL = { quick: "十題快速", full: "完整考卷", wrong: "錯題複習", domain: "領域練習" };

/* ---------- 資料來源：單一 HTML 內嵌，或資料夾版用 fetch ---------- */
const EMBEDDED = typeof window !== "undefined" ? window.QUIZKIT_DATA : null;

function assetSrc(p) {
  if (EMBEDDED && EMBEDDED.assets && EMBEDDED.assets[p]) return EMBEDDED.assets[p];
  return "assets/" + p.split("/").map(encodeURIComponent).join("/");
}

async function loadIndex() {
  if (EMBEDDED) {
    return {
      title: EMBEDDED.title,
      banks: EMBEDDED.banks.map(({ questions, passages, ...m }) => ({ ...m, count: questions.length })),
    };
  }
  const r = await fetch("data/index.json");
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

const bankCache = {};
async function loadBank(id) {
  if (EMBEDDED) return EMBEDDED.banks.find((b) => b.id === id);
  if (!bankCache[id]) {
    bankCache[id] = fetch(`data/${encodeURIComponent(id)}.json`).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    });
  }
  return bankCache[id];
}

/* ---------- 進度存在 localStorage ---------- */
function loadStore() {
  try {
    return normalizeStore(JSON.parse(localStorage.getItem(LS_KEY)));
  } catch (e) {
    return normalizeStore(null);
  }
}
function saveStore(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch (e) {}
}

/* ---------- 小工具 ---------- */
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function getHash() {
  return decodeURIComponent((location.hash || "").replace(/^#/, ""));
}
function modeLabel(a, bank) {
  if (a.mode === "domain" && a.domain) return `領域 ${a.domain}`;
  return MODE_LABEL[a.mode] || a.mode;
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- app ---------- */
function App() {
  const [index, setIndex] = useState(null);
  const [err, setErr] = useState(null);
  const [store, setStoreState] = useState(loadStore);
  const [route, setRoute] = useState(getHash());
  const [group, setGroup] = useState(null);
  const [bank, setBank] = useState(null);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [menu, setMenu] = useState(false);

  const setStore = useCallback((f) => {
    setStoreState((s) => {
      const next = typeof f === "function" ? f(s) : f;
      saveStore(next);
      return next;
    });
  }, []);

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch(() => setErr("題庫載入失敗，請重新整理"));
  }, []);
  useEffect(() => {
    const f = () => {
      setRoute(getHash());
      setSession(null);
      setResult(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  // 其他分頁改了進度時同步
  useEffect(() => {
    const f = (e) => {
      if (e.key === LS_KEY) setStoreState(loadStore());
    };
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);
  useEffect(() => {
    if (index) document.title = index.title;
  }, [index]);

  const meta = useMemo(() => index && index.banks.find((m) => m.id === route), [index, route]);
  useEffect(() => {
    if (meta) setGroup(meta.group);
  }, [meta]);
  useEffect(() => {
    if (!meta) {
      setBank(null);
      return;
    }
    if (bank && bank.id === meta.id) return;
    setBank(null);
    loadBank(meta.id)
      .then(setBank)
      .catch(() => setErr("題庫載入失敗，請重新整理"));
  }, [meta]);

  const user = store.current;
  const userBanks = store.users[user].banks;

  const record = useCallback(
    (b, s, answers, durationSec) => {
      const res = recordAttempt(store.users[store.current].banks[b.id], {
        bank: b,
        mode: s.mode,
        domain: s.domain,
        questions: s.qs,
        answers,
        durationSec,
      });
      setStore((st) => ({
        ...st,
        users: {
          ...st.users,
          [st.current]: { banks: { ...st.users[st.current].banks, [b.id]: res.progress } },
        },
      }));
      return res;
    },
    [store, setStore],
  );

  if (err) return <div className="wrap"><div className="card">{err}</div></div>;
  if (!index) return <div className="wrap"><div className="sub">載入中…</div></div>;

  const userMenu = menu && (
    <UserMenu store={store} setStore={setStore} index={index} onClose={() => setMenu(false)} />
  );
  const userButton = (
    <button className="user" onClick={() => setMenu(true)} aria-label="使用者選單">
      👤 {user} ▾
    </button>
  );

  if (route && !meta) {
    return (
      <div className="wrap">
        <div className="card">找不到這份題庫：#{route}</div>
        <a className="btn ghost" href="#">回首頁</a>
      </div>
    );
  }

  function startQuiz(key) {
    const all = bank.questions;
    let mode = key;
    let domain;
    let qs;
    if (key === "quick") qs = shuffle(all).slice(0, 10);
    else if (key.startsWith("domain:")) {
      mode = "domain";
      domain = +key.split(":")[1];
      qs = shuffle(all.filter((q) => q.domain === domain)).slice(0, 10);
    } else if (key === "wrong") {
      const w = wrongNumbers(userBanks[bank.id]);
      qs = shuffle(all.filter((q) => w.has(q.n))).slice(0, 10);
    } else qs = bank.shuffleFull ? shuffle(all) : all.slice();
    if (!qs.length) return;
    setSession({ mode, domain, key, qs, start: Date.now(), limit: mode === "full" ? bank.minutes * 60 : null });
    window.scrollTo(0, 0);
  }

  if (meta) {
    if (!bank) return <div className="wrap"><div className="sub">載入題庫中…</div></div>;
    if (result) {
      return (
        <Result
          bank={bank}
          res={result}
          onBack={() => {
            setResult(null);
            window.scrollTo(0, 0);
          }}
          onRetry={() => {
            const k = result.key;
            setResult(null);
            startQuiz(k);
          }}
        />
      );
    }
    if (session) {
      return (
        <Quiz
          bank={bank}
          s={session}
          onQuit={() => {
            setSession(null);
            window.scrollTo(0, 0);
          }}
          onSubmit={(answers, dur) => {
            const { correct, score } = record(bank, session, answers, dur);
            setResult({ ...session, answers, correct, score, dur });
            setSession(null);
            window.scrollTo(0, 0);
          }}
        />
      );
    }
    return (
      <>
        <BankPage bank={bank} bp={userBanks[bank.id]} onStart={startQuiz} user={user} userButton={userButton} />
        {userMenu}
      </>
    );
  }

  return (
    <>
      <Home index={index} userBanks={userBanks} group={group} setGroup={setGroup} user={user} userButton={userButton} />
      {userMenu}
    </>
  );
}

/* ---------- 使用者選單 ---------- */
function UserMenu({ store, setStore, index, onClose }) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null); // 等待選擇合併或覆蓋的匯入檔
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const others = Object.keys(store.users).filter((u) => u !== store.current);
  const run = (f) => {
    try {
      setStore(f(store));
      setMsg(null);
      return true;
    } catch (e) {
      setMsg({ bad: true, text: e.message });
      return false;
    }
  };

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      setPending({ name: f.name, data: parseProgressFile(JSON.parse(await f.text())) });
      setMsg(null);
    } catch (err) {
      setMsg({ bad: true, text: `無法匯入：${err.message}` });
    }
  }

  async function doImport(mode) {
    setBusy(true);
    try {
      const ids = Object.keys(pending.data.banks).filter((id) => index.banks.some((b) => b.id === id));
      const banksById = {};
      for (const id of ids) banksById[id] = await loadBank(id);
      const { banks, stats } = applyImport(store.users[store.current].banks, pending.data, banksById, mode);
      setStore((s) => ({ ...s, users: { ...s.users, [s.current]: { banks } } }));
      const parts = [`已${mode === "merge" ? "合併" : "覆蓋"}匯入 ${stats.banks} 份題庫、${stats.results} 題的結果、${stats.attempts} 筆作答紀錄。`];
      if (stats.skippedQuestions) parts.push(`略過 ${stats.skippedQuestions} 題（題庫改版後已刪除）。`);
      if (stats.skippedBanks.length) parts.push(`略過 ${stats.skippedBanks.length} 份這裡沒有的題庫：${stats.skippedBanks.join("、")}。`);
      setMsg({ text: parts.join("") });
      setPending(null);
    } catch (err) {
      setMsg({ bad: true, text: `匯入失敗：${err.message}` });
    }
    setBusy(false);
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="top" style={{ marginBottom: 8 }}>
          <b style={{ color: "var(--ink)", fontSize: 15 }}>使用者：{store.current}</b>
          <button className="link" onClick={onClose}>關閉</button>
        </div>

        {others.length > 0 && (
          <>
            <div className="hint" style={{ marginTop: 0 }}>切換使用者</div>
            {others.map((u) => (
              <button key={u} className="opt" style={{ marginBottom: 6 }} onClick={() => run((s) => switchUser(s, u))}>
                <span className="ot">👤 {u}</span>
              </button>
            ))}
          </>
        )}

        <div className="hint">新增或重新命名</div>
        <input className="input" value={name} placeholder="名稱" onChange={(e) => setName(e.target.value)} />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn plain" disabled={!name.trim()} onClick={() => run((s) => addUser(s, name)) && setName("")}>新增並切換</button>
          <button className="btn plain" disabled={!name.trim()} onClick={() => run((s) => renameUser(s, s.current, name)) && setName("")}>改目前名稱</button>
        </div>

        <div className="hint">進度</div>
        <div className="row">
          <button
            className="btn ghost"
            onClick={() => download(exportFileName(store.current), JSON.stringify(exportProgress(store), null, 2))}
          >
            匯出進度
          </button>
          <button className="btn ghost" onClick={() => fileRef.current.click()}>匯入進度</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={onFile} />

        {pending && (
          <div className="card" style={{ marginTop: 10, background: "var(--code)" }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              匯入「{pending.name}」（{pending.data.user}，{Object.keys(pending.data.banks).length} 份題庫）到「{store.current}」：
            </div>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => doImport("merge")}>合併<small>同一題保留較新的結果</small></button>
              <button className="btn plain" disabled={busy} onClick={() => doImport("overwrite")}>覆蓋<small>取代目前的進度</small></button>
            </div>
            <button className="link" style={{ marginTop: 8 }} onClick={() => setPending(null)}>取消</button>
          </div>
        )}

        {msg && <div className={"msg" + (msg.bad ? " bad" : "")}>{msg.text}</div>}

        <div style={{ marginTop: 14 }}>
          <button
            className="link danger"
            onClick={() => {
              if (window.confirm(`刪除「${store.current}」和他的所有進度？刪除後無法復原。`)) run((s) => deleteUser(s, s.current));
            }}
          >
            刪除這位使用者
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 首頁 ---------- */
function Home({ index, userBanks, group, setGroup, user, userButton }) {
  const groups = [...new Set(index.banks.map((b) => b.group))];
  const current = groups.includes(group) ? group : groups[0];
  const list = index.banks.filter((b) => b.group === current);
  const sections = [];
  for (const b of list) {
    let s = sections.find((x) => x.name === (b.section || ""));
    if (!s) sections.push((s = { name: b.section || "", banks: [] }));
    s.banks.push(b);
  }
  const done = index.banks.filter((b) => userBanks[b.id] && (userBanks[b.id].attempts || []).length).length;
  const total = index.banks.reduce((n, b) => n + b.count, 0);
  return (
    <div className="wrap">
      <div className="head">
        <h1>{index.title}</h1>
        {userButton}
      </div>
      <div className="sub">共 {index.banks.length} 份・{total} 題｜{user} 已練過 {done} 份</div>
      {groups.length > 1 && (
        <div className="tabs">
          {groups.map((g) => (
            <button key={g} className={current === g ? "on" : ""} onClick={() => setGroup(g)}>{g}</button>
          ))}
        </div>
      )}
      {sections.map((s) => (
        <div key={s.name}>
          {s.name && <h2>{s.name}</h2>}
          {s.banks.map((b) => (
            <BankCard key={b.id} b={b} bp={userBanks[b.id]} />
          ))}
        </div>
      ))}
      <div className="foot">
        進度存在這台裝置的瀏覽器，換裝置請用右上角選單匯出／匯入。<br />
        由 <a href="https://github.com/cyhkelvin/quizkit">quizkit</a> 產生。
      </div>
    </div>
  );
}

function BankCard({ b, bp }) {
  const st = bankStatus(bp, b.count);
  return (
    <a href={"#" + b.id} className="card paper" style={{ textDecoration: "none" }}>
      <div className="t">{b.title}</div>
      <div className="m">#{b.id}・{b.subtitle ? b.subtitle + "・" : ""}{b.count} 題・{b.minutes} 分鐘</div>
      <div className="badges">
        {!st.attempts.length && <span className="b">未做過</span>}
        {st.attempts.length > 0 && <span className="b brand">做過 {st.attempts.length} 次</span>}
        {st.last && (
          <span className={"b " + (st.last.score >= b.passPercent ? "ok" : "bad")}>
            最近 {st.last.score} 分（{modeLabel(st.last, b)}）
          </span>
        )}
        {st.fullCount > 0 && (
          <span className={"b " + (st.bestFull >= b.passPercent ? "ok" : "bad")}>完整卷最高 {st.bestFull} 分</span>
        )}
        {st.wrong > 0 && <span className="b warn">錯題 {st.wrong}</span>}
      </div>
      {st.seen > 0 && <div className="prog"><i style={{ width: Math.min(100, (st.seen / st.total) * 100) + "%" }} /></div>}
      {st.seen > 0 && <div className="m">已作答 {st.seen}/{st.total} 題</div>}
    </a>
  );
}

/* ---------- 題庫頁 ---------- */
function BankPage({ bank, bp, onStart, user, userButton }) {
  const count = bank.questions.length;
  const st = bankStatus(bp, count);
  const hist = st.attempts.slice().reverse();
  const r = (bp && bp.lastResult) || {};
  const versionChanged = bp && bp.bankVersion && bp.bankVersion !== bank.version;
  return (
    <div className="wrap">
      <div className="head">
        <a className="link" href="#">‹ 全部題庫</a>
        {userButton}
      </div>
      <h1 style={{ marginTop: 10 }}>{bank.group}｜{bank.title}</h1>
      <div className="sub">{bank.subtitle ? bank.subtitle + "・" : ""}#{bank.id}・版本 {bank.version}</div>
      {bank.note && <div className="sub" style={{ marginTop: 4 }}>{bank.note}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        {!st.attempts.length ? (
          <div><span className="b">{user} 還沒做過這份</span></div>
        ) : (
          <div className="badges" style={{ marginTop: 0 }}>
            <span className="b brand">做過 {st.attempts.length} 次</span>
            {st.fullCount > 0 ? (
              <span className={"b " + (st.bestFull >= bank.passPercent ? "ok" : "bad")}>
                完整卷 {st.fullCount} 次・最高 {st.bestFull} 分
              </span>
            ) : (
              <span className="b">完整卷未做</span>
            )}
            <span className="b">已作答 {st.seen}/{st.total}</span>
            {st.wrong > 0 && <span className="b warn">錯題 {st.wrong}</span>}
          </div>
        )}
        {st.seen > 0 && <div className="prog"><i style={{ width: Math.min(100, (st.seen / st.total) * 100) + "%" }} /></div>}
        {versionChanged && <div className="sub" style={{ marginTop: 6 }}>題庫已從 {bp.bankVersion} 更新為 {bank.version}。</div>}
      </div>

      <button className="btn" onClick={() => onStart("quick")}>十題快速測驗<small>隨機抽 10 題・不計時</small></button>
      <div style={{ height: 8 }} />
      <button className="btn ghost" onClick={() => onStart("full")}>
        完整考卷<small>{count} 題・{bank.minutes} 分鐘計時・{bank.passPercent} 分及格・時間到自動交卷</small>
      </button>
      <div style={{ height: 8 }} />
      <button className="btn plain" disabled={!st.wrong} onClick={() => onStart("wrong")}>
        錯題複習<small>{st.wrong ? `目前 ${st.wrong} 題，每次最多 10 題，答對就移出` : "目前沒有錯題"}</small>
      </button>

      {bank.domains && (
        <>
          <h2>依領域練習（每次最多 10 題）</h2>
          {bank.domains.map((d, i) => {
            const qs = bank.questions.filter((q) => q.domain === i + 1);
            const seen = qs.filter((q) => r[q.n]).length;
            const right = qs.filter((q) => r[q.n] && r[q.n][0] === 1).length;
            return (
              <button key={i} className="card paper" disabled={!qs.length} onClick={() => onStart("domain:" + (i + 1))}>
                <div className="t" style={{ fontSize: 14 }}>領域 {i + 1}：{d}</div>
                <div className="m">{qs.length} 題{seen ? `・已作答 ${seen}・最近答對 ${right}` : "・未練習"}</div>
              </button>
            );
          })}
        </>
      )}

      {hist.length > 0 && (
        <>
          <h2>作答紀錄</h2>
          <div className="card">
            {hist.map((a) => (
              <div className="hist" key={a.at + a.mode}>
                <span>{fmtDate(a.at)}・{modeLabel(a, bank)}</span>
                <span className={a.score >= bank.passPercent ? "pass" : "fail"}>{a.score} 分（{a.correct}/{a.total}）</span>
              </div>
            ))}
          </div>
        </>
      )}
      {bank.source && <div className="foot">{bank.source}</div>}
    </div>
  );
}

/* ---------- 題目內容 ---------- */
function Fig({ src, alt }) {
  return <img className="fig" src={assetSrc(src)} alt={alt} loading="lazy" />;
}

function Passage({ bank, q, open }) {
  const p = q.passage !== undefined && bank.passages ? bank.passages[q.passage] : null;
  if (!p) return null;
  const nums = p.questions || [];
  return (
    <details className="passage" open={open}>
      <summary>題組說明{nums.length ? `（第 ${nums[0]}–${nums[nums.length - 1]} 題共用）` : ""}</summary>
      {p.blocks.map((b, i) =>
        b.type === "img" ? <Fig key={i} src={b.value} alt="題組附圖" /> : b.type === "pre" ? <pre key={i}>{b.value}</pre> : <p key={i}>{b.value}</p>,
      )}
    </details>
  );
}

function OptionBody({ q, i }) {
  const imgs = q.optionFigures && q.optionFigures[i];
  return (
    <span className="ot">
      {q.options[i]}
      {imgs && imgs.map((s, j) => <Fig key={j} src={s} alt={`選項 ${KEYS[i]}`} />)}
    </span>
  );
}

/* ---------- 作答 ---------- */
function Quiz({ bank, s, onQuit, onSubmit }) {
  const { qs, mode, limit, start } = s;
  const [answers, setAnswers] = useState({});
  const [flags, setFlags] = useState({});
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [modal, setModal] = useState(null);
  const submitted = useRef(false);
  const q = qs[idx];
  const done = qs.filter((x) => isAnswered(x, answers[x.n])).length;
  const left = limit ? limit - (now - start) / 1000 : null;
  const flagged = Object.values(flags).filter(Boolean).length;

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    onSubmit(answers, (Date.now() - start) / 1000);
  }, [answers, onSubmit, start]);
  useEffect(() => {
    if (!limit) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [limit]);
  useEffect(() => {
    if (limit && left <= 0) submit();
  }, [left, limit, submit]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [idx]);

  const pick = (i) =>
    setAnswers((a) => {
      if (!isMulti(q)) return { ...a, [q.n]: i };
      const cur = a[q.n] || [];
      if (cur.includes(i)) return { ...a, [q.n]: cur.filter((x) => x !== i) };
      if (cur.length >= q.answer.length) return { ...a, [q.n]: [...cur.slice(1), i] };
      return { ...a, [q.n]: [...cur, i] };
    });
  const selected = (i) => (isMulti(q) ? (answers[q.n] || []).includes(i) : answers[q.n] === i);

  return (
    <div className="wrap">
      <div className="top">
        <button className="link" onClick={() => setModal("quit")}>‹ 離開</button>
        <span>{MODE_LABEL[mode]}｜已答 {done}/{qs.length}</span>
        {limit ? <span className={"timer" + (left < 300 ? " low" : "")}>⏱ {fmtTime(left)}</span> : <span />}
      </div>
      <div className="bar"><i style={{ width: ((idx + 1) / qs.length) * 100 + "%" }} /></div>
      <div className="card">
        <div className="qno">
          <span className="b brand">第 {idx + 1} / {qs.length} 題</span>
          {q.domain && bank.domains ? <span className="b">領域 {q.domain}</span> : mode !== "full" && <span className="b">原卷第 {q.n} 題</span>}
          {isMulti(q) && <span className="b warn">複選：選 {q.answer.length} 個</span>}
          {mode === "full" && (
            <button className={"b " + (flags[q.n] ? "warn" : "")} style={{ border: "none", cursor: "pointer" }} onClick={() => setFlags((f) => ({ ...f, [q.n]: !f[q.n] }))}>
              {flags[q.n] ? "★ 已標記" : "☆ 標記稍後再看"}
            </button>
          )}
        </div>
        <Passage bank={bank} q={q} open={true} />
        <div className="q">{q.q}</div>
        {q.figures && q.figures.map((src, i) => <Fig key={i} src={src} alt="題目附圖" />)}
        {q.options.map((t, i) => (
          <button key={i} className={"opt" + (selected(i) ? " sel" : "")} onClick={() => pick(i)}>
            <span className="k">{KEYS[i]}</span>
            <OptionBody q={q} i={i} />
          </button>
        ))}
      </div>
      <div className="hint">題號（點選跳題{mode === "full" ? "，橘點＝已標記" : ""}）</div>
      <div className="dots">
        {qs.map((x, i) => (
          <button key={x.n} className={(isAnswered(x, answers[x.n]) ? "done " : "") + (i === idx ? "cur " : "") + (flags[x.n] ? "flag" : "")} onClick={() => setIdx(i)}>
            {i + 1}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}><button className="btn plain" onClick={() => setModal("submit")}>交卷</button></div>

      <div className="sticky">
        <div className="inner row">
          <button className="btn ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>上一題</button>
          {idx === qs.length - 1 ? (
            <button className="btn" onClick={() => setModal("submit")}>交卷</button>
          ) : (
            <button className="btn" onClick={() => setIdx(idx + 1)}>下一題</button>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal" onClick={() => setModal(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            {modal === "submit" ? (
              <>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>確定交卷？</div>
                <div className="sub" style={{ marginBottom: 12 }}>
                  {done < qs.length ? `還有 ${qs.length - done} 題未作答，未答以答錯計。` : "全部題目都已作答。"}
                  {flagged ? ` 有 ${flagged} 題標記待確認。` : ""}
                </div>
                <div className="row">
                  <button className="btn plain" onClick={() => setModal(null)}>繼續作答</button>
                  <button className="btn" onClick={submit}>交卷</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>離開這次測驗？</div>
                <div className="sub" style={{ marginBottom: 12 }}>這次的作答不會儲存。</div>
                <div className="row">
                  <button className="btn plain" onClick={() => setModal(null)}>繼續作答</button>
                  <button className="btn" onClick={onQuit}>離開</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 交卷結果 ---------- */
function Result({ bank, res, onBack, onRetry }) {
  const { qs, answers, correct, score, mode, dur } = res;
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState("wrong");
  const pass = score >= bank.passPercent;
  const wrongN = qs.length - correct;
  const shown = qs.map((q, i) => ({ q, i })).filter(({ q }) => filter === "all" || !isCorrect(q, answers[q.n]));
  return (
    <div className="wrap">
      <div className="top"><span>{bank.group}｜{bank.title}</span><span>{MODE_LABEL[mode]}</span></div>
      <div className="card score" style={{ marginTop: 8 }}>
        <div className="sub">本次成績</div>
        <div className={"big " + (pass ? "pass" : "fail")}>{score}</div>
        <div style={{ marginTop: 8 }}>答對 {correct} / {qs.length} 題｜{pass ? "及格" : `未達 ${bank.passPercent} 分`}</div>
        <div className="sub">用時 {fmtTime(dur)}</div>
      </div>
      <div className="seg">
        <button className={filter === "wrong" ? "on" : ""} onClick={() => setFilter("wrong")}>只看錯題（{wrongN}）</button>
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>全部（{qs.length}）</button>
      </div>
      <div className="hint" style={{ marginTop: 0 }}>答錯的題目點一下才會展開詳解</div>
      {shown.map(({ q, i }) => {
        const my = answers[q.n];
        const ok = isCorrect(q, my);
        const answered = isAnswered(q, my);
        const isOpen = !!open[q.n];
        return (
          <div className="ritem" key={q.n}>
            <button className={"rhead" + (ok ? "" : " click")} onClick={ok ? undefined : () => setOpen((o) => ({ ...o, [q.n]: !o[q.n] }))}>
              <span className={"mark " + (ok ? "ok" : !answered ? "skip" : "bad")}>{ok ? "✓" : !answered ? "–" : "✕"}</span>
              <span className="rt">{i + 1}. {q.q}</span>
              {!ok && <span className="chev">{isOpen ? "▲" : "▼"}</span>}
            </button>
            {!ok && isOpen && (
              <div className="detail">
                <Passage bank={bank} q={q} open={false} />
                <div className="full">{q.q}</div>
                {q.figures && q.figures.map((src, j) => <Fig key={j} src={src} alt="題目附圖" />)}
                <div className="line you">
                  你的答案：
                  {!answered
                    ? "未作答"
                    : (isMulti(q) ? my.slice().sort((x, y) => x - y) : [my]).map((k) => (
                        <div key={k}>（{KEYS[k]}）<OptionBody q={q} i={k} /></div>
                      ))}
                </div>
                <div className="line ans">
                  正確答案：
                  {answerList(q).map((k) => (
                    <div key={k}>（{KEYS[k]}）<OptionBody q={q} i={k} /></div>
                  ))}
                </div>
                {q.explanation && <div className="exp"><b>詳解</b>　{q.explanation}</div>}
                <div className="sub" style={{ marginTop: 6 }}>
                  {q.domain && bank.domains ? `領域 ${q.domain}：${bank.domains[q.domain - 1]}・` : ""}原卷第 {q.n} 題
                </div>
              </div>
            )}
          </div>
        );
      })}
      {shown.length === 0 && <div className="card sub">全部答對，沒有錯題。</div>}
      <div className="sticky">
        <div className="inner row">
          <button className="btn ghost" onClick={onBack}>回這份題庫</button>
          <button className="btn" onClick={onRetry}>再做一次</button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
