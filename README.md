# quizkit

把題庫 JSON 變成手機也能用的刷題網頁。

題庫放在這個 repo，跑一行指令就能產生刷題入口網頁（portal）：可以離線打開的單一 HTML 檔，或可以部署的資料夾。

> 遇到問題先看 [FAQ.md](FAQ.md)。

## 功能

- **多題庫**：同一個入口可以放多份題庫（例如 iPAS 初級、iPAS 中級、AWS），首頁依群組分頁。
- **練習模式**
  - 十題快速測驗：隨機抽 10 題，不計時。
  - 完整考卷：依題庫設定的時間計時，時間到自動交卷，可標記「稍後再看」。
  - 依領域練習：只抽某個領域的題目，找出弱項。
  - 錯題複習：只出答錯過的題目，答對就移出。
- **題型**：單選、複選（例如「選 2 個」）；題目、選項都可附圖；支援題組（多題共用一段說明）。
- **交卷後檢討**：只顯示錯題，點一下才展開詳解。
- **網址直達**：每份題庫有自己的網址結尾（例如 `#aws-saa-c03`），可存成書籤。
- **多使用者**：可新增、切換使用者，每人的進度分開存。
- **進度匯入／匯出**：把進度匯出成 JSON 檔，換裝置或換瀏覽器時再匯入。

---

## 快速開始

需要 Node.js 18 以上。

```bash
git clone https://github.com/cyhkelvin/quizkit.git
cd quizkit
npm install

# 檢查所有題庫格式
npx quizkit validate banks/

# 產生單一 HTML（題庫與圖片都包在裡面，可離線使用）
npx quizkit build --banks banks/ --out dist/portal.html
```

用瀏覽器打開 `dist/portal.html` 就能開始刷題。WSL 可以用 `explorer.exe "$(wslpath -w dist/portal.html)"` 打開。

---

## Repo 結構

```
quizkit/
├─ banks/                     題庫，一份題庫一個 JSON
│  ├─ aws/                    AWS 原創模擬題
│  ├─ examples/               格式範例（sample.json、sample.csv）
│  └─ private-*/              私有題庫（不進版控，見「加入私有題庫」）
├─ assets/                    題目附圖（依題庫分資料夾）
├─ schema/
│  ├─ bank.schema.json        題庫格式規範
│  └─ progress.schema.json    進度檔格式規範
├─ dist/                      build 輸出（不進版控）
├─ legacy/                    舊版 artifact 等私人檔案（不進版控，只有說明）
├─ app/                       刷題網頁的程式（React）
├─ cli/                       命令列工具
├─ scripts/                   格式轉換腳本
├─ test/                      測試
├─ README.md
└─ FAQ.md                     常見問題、錯誤排解、開發說明
```

---

## 目錄

- [功能](#功能)
- [快速開始](#快速開始)
- [Repo 結構](#repo-結構)
- [建立自己的題庫](#建立自己的題庫)：題庫格式、題組、附圖擺放、CSV 匯入、格式檢查
- [產生刷題網頁](#產生刷題網頁)：build 選項、輸出格式、加入私有題庫
- [進度與使用者](#進度與使用者)：使用者切換、匯出／匯入、進度檔格式
- [授權](#授權)
- [常見問題（FAQ.md）](FAQ.md)

各段先列重點，點「▸」展開完整說明。

---

## 建立自己的題庫

一份題庫一個 JSON，放在 `banks/` 底下任何資料夾；附圖放在 `assets/`。範例見 [`banks/examples/sample.json`](banks/examples/sample.json)。

```bash
# 用試算表出題，再轉成 JSON
npx quizkit import-csv my-questions.csv --id my-bank --group 自訂 --out banks/my/my-bank.json

# 檢查格式
npx quizkit validate banks/my/
```

最少需要的欄位：題庫的 `id`、`group`、`title`、`version`、`minutes`、`passPercent`、`questions`；每題的 `n`、`q`、`options`、`answer`（0 = A）。

<details>
<summary><b>完整說明：題庫格式、題組、附圖擺放、CSV 匯入、格式檢查</b></summary>

#### 題庫格式

每份題庫一個 JSON 檔，格式規範在 [`schema/bank.schema.json`](schema/bank.schema.json)。完整範例見 [`banks/examples/sample.json`](banks/examples/sample.json)。

```json
{
  "id": "aws-saa-c03",
  "group": "AWS",
  "title": "Solutions Architect – Associate",
  "version": "2026.11.1",
  "minutes": 130,
  "passPercent": 72,
  "shuffleFull": true,
  "domains": ["設計安全的架構", "設計具韌性的架構", "設計高效能的架構", "設計成本最佳化的架構"],
  "source": "原創模擬題，依 AWS 官方 exam guide 的領域配分撰寫",
  "questions": [
    {
      "n": 1,
      "domain": 1,
      "q": "位於私有子網路的 EC2 需要下載作業系統更新，但不能讓網際網路主動連入。應使用？",
      "options": [
        "在公有子網路建立 NAT 閘道，並在私有子網路路由表加入指向它的預設路由",
        "把 EC2 移到公有子網路並給公有 IP",
        "在私有子網路附加網際網路閘道",
        "建立 VPC 對等連線"
      ],
      "answer": 0,
      "explanation": "NAT 閘道讓私有子網路能主動連出，但外部無法主動連入。"
    }
  ]
}
```

題庫欄位：

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| `id` | 是 | 題庫唯一 ID，也是網址結尾，只用英數與 `-` |
| `group` | 是 | 首頁分頁名稱，例如 `AWS`、`iPAS 初級` |
| `title` | 是 | 題庫名稱 |
| `version` | 是 | 題庫版本，匯入進度時用來比對 |
| `minutes` / `passPercent` | 是 | 完整考卷的時間（分鐘）與及格百分比 |
| `questions` | 是 | 題目陣列，欄位見下表 |
| `section` | 否 | 分頁內的小標題，例如「115 年第一次（考試日 2026-03-21）」 |
| `subtitle` / `code` / `note` | 否 | 副標、考試代碼、補充說明 |
| `date` | 否 | 考試日（`YYYY-MM-DD`）；同一分頁內依日期新到舊排列 |
| `shuffleFull` | 否 | 完整考卷是否打亂題目順序 |
| `source` | 否 | 題目來源與授權，顯示在題庫頁底部 |
| `domains` | 否 | 領域名稱；有填才會出現「依領域練習」 |
| `passages` | 否 | 題組共用說明，見[題組](#建立自己的題庫) |

題目欄位：

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| `n` | 是 | 題號，同一份題庫內不能重複；進度依題號記錄，改版時請勿重新編號 |
| `q` | 是 | 題目 |
| `options` | 是 | 選項，2–8 個 |
| `answer` | 是 | 單選填數字（0 = A）；複選填陣列，例如 `[0, 2]` |
| `explanation` | 否 | 詳解 |
| `domain` | 否 | 第幾個領域，從 1 開始，對應題庫的 `domains` |
| `passage` | 否 | 引用的題組 key |
| `figures` | 否 | 題目附圖路徑陣列，見[題庫與附圖放在哪裡](#建立自己的題庫) |
| `optionFigures` | 否 | 選項附圖，依選項順序，每個選項是路徑陣列或 `null` |

題庫和題目都不允許表上沒有的欄位，避免欄位名稱打錯卻沒發現。

#### 題組

多題共用一段說明時，放在題庫的 `passages`，題目用 `"passage": "<key>"` 引用：

```json
"passages": {
  "weather": {
    "questions": [4, 5],
    "blocks": [
      { "type": "text", "value": "下表是某城市一週的最高氣溫：" },
      { "type": "pre", "value": "一 二 三\n28 30 31" },
      { "type": "img", "value": "examples/chart.webp" }
    ]
  }
}
```

- `questions`：共用這段說明的題號，顯示「第 4–5 題共用」用。
- `text` 是一般段落，`pre` 保留空白與換行（適合程式碼、表格），`img` 是附圖。

#### 題庫與附圖放在哪裡

- `build --banks <路徑>` 會把路徑底下（含子資料夾）**每個 `.json` 都當成一份題庫**，不需要清單或入口檔；檔名不重要，以檔案內的 `id` 為準。
- 附圖路徑不是相對於題庫檔，而是相對於 `assets/`：從題庫檔所在的資料夾開始往上，找第一個存在的 `assets/<路徑>`。

建議的擺放方式：

```
quizkit/
├─ assets/my-bank/fig1.webp          ← 題目寫 "figures": ["my-bank/fig1.webp"]
└─ banks/
   ├─ my/my-bank.json
   └─ private-xxx/                   ← 自己的私有題庫資料夾或 repo
      ├─ banks/*.json
      └─ assets/xxx/*.webp           ← 題目寫 "xxx/<檔名>"
```

- 附圖放在以題庫命名的子資料夾，避免不同題庫的同名圖片衝突。
- 題庫資料夾裡不要放其他 JSON（例如 `package.json`），它們會被當成題庫檢查。

尋找規則的完整說明見 [FAQ：build 怎麼找到題庫與附圖](FAQ.md#build-怎麼找到題庫與附圖)。

#### 從 CSV 匯入

自己出題時可以用試算表編輯，再轉成 JSON：

```bash
npx quizkit import-csv my-questions.csv --id my-bank --group 自訂 --out banks/my/my-bank.json
```

CSV 欄位：`domain, question, A, B, C, D, E, answer, explanation`，複選答案寫成 `A;C`。範例見 [`banks/examples/sample.csv`](banks/examples/sample.csv)。

- 第一列是標題列；`domain`、`E`、`explanation` 可以省略或留空。
- `domain` 可以填名稱（依出現順序編號）或數字。
- 可另外指定 `--title`、`--minutes`（預設每題 1.5 分鐘）、`--pass`（預設 70）、`--version`（預設 1）。

#### 檢查格式

```bash
npx quizkit validate banks/            # 檢查整個資料夾
npx quizkit validate banks/my/my-bank.json
```

除了 schema，也會檢查題號重複、答案超出選項範圍、引用不存在的題組或領域、附圖檔不存在、題庫 ID 重複。看不懂錯誤訊息、或題庫原本是其他格式時，見 [FAQ：格式不符時怎麼處理](FAQ.md#格式不符時怎麼處理)。

</details>

---

## 產生刷題網頁

```bash
npx quizkit build --banks banks/ --out dist/portal.html                   # 單一 HTML，可離線
npx quizkit build --banks banks/ --out dist/site/ --format folder         # 資料夾版，放網站用
git clone https://github.com/cyhkelvin/quizkit-banks-ipas.git banks/private-ipas   # 加入私有題庫
```

私有題庫的資料夾名稱要以 `private-` 開頭，才不會被提交到公開 repo。不符格式的題庫會被跳過並列出原因，其他題庫照樣產生。

<details>
<summary><b>完整說明：build 選項、輸出格式、加入私有題庫</b></summary>

#### build 選項

```bash
# 全部題庫，單一 HTML
npx quizkit build --banks banks/ --out dist/portal.html

# 只打包部分題庫
npx quizkit build --banks banks/aws --out dist/aws.html

# 指定分頁順序：先讀到的分頁排前面
npx quizkit build --banks banks/private-ipas --banks banks/aws --out dist/portal.html

# 資料夾版，並在本機預覽
npx quizkit build --banks banks/ --out dist/site/ --format folder
npx quizkit serve dist/site/
```

| 選項 | 說明 |
| --- | --- |
| `--banks <路徑>` | 題庫所在的資料夾或檔案；可以重複指定或用逗號分隔，預設 `banks/` |
| `--out <路徑>` | 輸出的 HTML 檔或資料夾 |
| `--format single\|folder` | 輸出格式，預設 `single` |
| `--title <標題>` | 網頁標題，預設「quizkit 刷題」 |

- `banks/examples/` 是格式範例，用 `--banks banks/` 時不會打包；要看範例請直接指定 `--banks banks/examples`。
- 不符格式的題庫會被跳過並列出原因，其他題庫照樣產生。

#### 輸出格式

| 格式 | 指令 | 適合 |
| --- | --- | --- |
| 單一 HTML | `--format single`（預設） | 離線使用、直接傳檔給別人 |
| 資料夾 | `--format folder` | GitHub Pages、內部網站；題庫多、圖片多時載入較快 |

- 單一 HTML 會把題庫、圖片與程式都內嵌，不需要網路，檔案會隨題庫變大。例如 iPAS 全部 14 份題庫加 AWS 4 份，打包後約 3.2 MB。
- 資料夾版要透過網頁伺服器開啟（`npx quizkit serve` 或 GitHub Pages），直接雙擊 `index.html` 會載入失敗。

#### 加入私有題庫

`banks/` 底下以 `private-` 開頭的資料夾不進版控（列在 `.gitignore`），可以把私有 repo clone 進來一起 build：

```bash
git clone https://github.com/cyhkelvin/quizkit-banks-ipas.git banks/private-ipas
npx quizkit build --banks banks/ --out dist/portal.html

# 之後更新
git -C banks/private-ipas pull
npx quizkit build --banks banks/ --out dist/portal.html
```

- 資料夾名稱一定要以 `private-` 開頭，否則私有題庫可能被提交到公開 repo。
- 產生的 HTML 含有私有題庫內容，分享前請留意。
- 沒有私有 repo 權限、但有舊版 artifact 壓縮檔時，見 [legacy/README.md](legacy/README.md)。

</details>

---

## 進度與使用者

HTML 裡只有題庫，進度存在打開它的瀏覽器（localStorage）。傳給別人時，對方是全新狀態，看不到你的進度。

- 右上角「👤 名稱 ▾」選單可以新增、切換、改名、刪除使用者。
- 換瀏覽器或換電腦時，用選單的「匯出進度」／「匯入進度」搬移。匯入會套用到**目前選取的使用者**。

<details>
<summary><b>完整說明：使用者、匯出／匯入、進度檔格式、進度存在哪裡</b></summary>

#### 使用者

首頁右上角的「👤 名稱 ▾」選單可以：

- **新增並切換**：建立新使用者，每人的進度分開存。同一台電腦多人共用時使用。
- **改目前名稱**：重新命名，進度會跟著保留。
- **切換**、**刪除這位使用者**。

輸入框打的名稱要按上面兩個按鈕之一才會生效。

#### 匯出／匯入

- **匯出進度**：下載 `quizkit-progress-<使用者>-<日期>.json`。
- **匯入進度**：選擇進度檔，套用到**目前選取的使用者**。檔案裡記錄的使用者名稱不影響匯入目標；要匯入到別的名稱，先改名或新增並切換，再匯入。
  - **合併**：作答紀錄合併；同一題保留較新的結果。
  - **覆蓋**：以匯入檔取代目前使用者的進度。

題庫改版後刪掉的題目、或這個網頁裡沒有的題庫，匯入時會略過並列出數量。每份題庫最多保留最近 100 筆作答紀錄。

#### 進度檔格式

格式規範在 [`schema/progress.schema.json`](schema/progress.schema.json)。範例（AWS AI Practitioner 領域 1 練習一次，10 題答對 8 題）：

```json
{
  "format": "quizkit-progress/1",
  "user": "我",
  "exportedAt": "2026-11-10T13:57:00+08:00",
  "banks": {
    "aws-aif-c01": {
      "bankVersion": "2026.11.1",
      "attempts": [
        { "mode": "domain", "domain": 1, "correct": 8, "total": 10, "score": 80, "at": 1794290013738, "durationSec": 173 }
      ],
      "lastResult": {
        "1": [1, 1794290013738],
        "2": [1, 1794290013738],
        "8": [0, 1794290013738],
        "11": [0, 1794290013738]
      }
    }
  }
}
```

- `attempts`：每次作答一筆。`mode` 為 `quick`（十題）、`full`（完整考卷）、`wrong`（錯題複習）或 `domain`（領域練習，`domain` 記錄第幾個領域）；`at` 是作答時間（毫秒時間戳）。
- `lastResult`：每題最近一次的結果，key 是題號，值是 `[是否答對, 時間戳]`，`1` 答對、`0` 答錯。答錯的題目會出現在錯題複習裡。

#### 進度存在哪裡

| 使用方式 | 進度位置 | 換裝置 |
| --- | --- | --- |
| 單一 HTML 檔（本機打開） | 該瀏覽器的 localStorage | 匯出／匯入 |
| 資料夾版（GitHub Pages 等） | 該瀏覽器的 localStorage | 匯出／匯入 |

清除瀏覽資料會一併清掉進度，請定期匯出備份。

</details>

---

## 授權

- **程式碼**：[MIT License](LICENSE)。
- **AWS 模擬題**（`banks/aws/`）：原創題目，依 AWS 官方 exam guide 的題數、題型與領域配分撰寫，不含任何外流真題，與程式碼同樣採 MIT License。
- **iPAS 題庫**：不在這個公開 repo 中。題目為 iPAS 官方公告試題，著作權屬官方；部分詳解取自 [yazelin/ipas-ai-quiz](https://github.com/yazelin/ipas-ai-quiz)（MIT License, © 2026 林亞澤）。iPAS 題庫放在私有 repo，見[加入私有題庫](#產生刷題網頁)。
- **你自己的題庫**：授權由你決定，建議寫在題庫的 `source` 欄位，會顯示在題庫頁底部。
