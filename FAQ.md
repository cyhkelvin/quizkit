# quizkit 常見問題

使用方式與題庫格式見 [README.md](README.md)。

## 目錄

- 題庫
  - [build 怎麼找到題庫與附圖](#build-怎麼找到題庫與附圖)
  - [格式不符時怎麼處理](#格式不符時怎麼處理)
  - [validate 的錯誤訊息怎麼看](#validate-的錯誤訊息怎麼看)
  - [題庫原本是其他格式](#題庫原本是其他格式)
  - [附圖找不到](#附圖找不到)
  - [改了題庫，舊的進度會怎樣](#改了題庫舊的進度會怎樣)
- 網頁與進度
  - [資料夾版雙擊 index.html 打不開](#資料夾版雙擊-indexhtml-打不開)
  - [匯入進度時，要怎麼匯入到另一個使用者名稱](#匯入進度時要怎麼匯入到另一個使用者名稱)
  - [把 portal.html 給別人，對方怎麼用自己的進度](#把-portalhtml-給別人對方怎麼用自己的進度)
  - [重新 build 之後進度還在嗎](#重新-build-之後進度還在嗎)
  - [舊版 artifact 的進度怎麼搬過來](#舊版-artifact-的進度怎麼搬過來)
- [開發](#開發)

---

## 題庫

### build 怎麼找到題庫與附圖

**題庫**：沒有入口檔或清單。`--banks` 指定的路徑底下，每一個 `.json` 都會被當成一份題庫：

- 會遞迴進入子資料夾。
- 略過開頭是 `.` 的資料夾（例如 `.git/`）與 `node_modules/`。
- `build` 時略過名為 `examples` 的資料夾，除非 `--banks` 直接指定它；`validate` 不略過。
- 有 `"format"` 欄位的 JSON 視為進度檔，`build` 時略過。
- 檔名不重要，題庫身分以檔案內的 `id` 為準；`id` 重複時，後讀到的檔案會被跳過。
- 用多個 `--banks` 時，首頁分頁依讀到的順序排列；同一個分頁內，有 `date` 的題庫依日期新到舊排列，其餘依檔名順序。

**附圖**：`figures`、`optionFigures` 與題組 `img` 的路徑不是相對於題庫檔，而是從題庫檔所在的資料夾開始往上，找第一個存在的 `assets/<路徑>`。

以加入私有題庫後的結構為例：

```
quizkit/
├─ assets/examples/right-triangle.svg
└─ banks/                                  ← build --banks banks/
   ├─ aws/aws-saa-c03.json                 ← 題庫
   ├─ examples/sample.json                 ← build 時略過
   └─ private-ipas/                        ← 私有 repo
      ├─ .git/                             ← 略過
      ├─ banks/mid-114-2-s2.json           ← 題庫
      └─ assets/ipas/aiap-114-...webp      ← 附圖（不是 .json，不會被當成題庫）
```

`mid-114-2-s2.json` 裡的附圖寫成 `ipas/aiap-114-...webp`，找的順序是：

1. `banks/private-ipas/banks/assets/ipas/aiap-114-...webp`：不存在
2. `banks/private-ipas/assets/ipas/aiap-114-...webp`：找到

`banks/examples/sample.json` 的 `examples/right-triangle.svg` 則會一路往上找到 repo 根目錄的 `assets/`。

所以自己做題庫資料夾或私有 repo 時：

- 題庫 JSON 與 `assets/` 放在同一層，或讓 `assets/` 在較上層。
- 附圖放在以題庫命名的子資料夾（例如 `assets/ipas/`）。不同題庫用了同一個附圖路徑、但實際是不同檔案時，`build` 會停止並報錯。
- 資料夾裡不要放其他 JSON（例如 `package.json`、設定檔）。它們會被當成題庫檢查，因為不符格式而被跳過，build 時會多出一堆警告。

### 格式不符時怎麼處理

`validate` 與 `build` 都會依 [`schema/bank.schema.json`](schema/bank.schema.json) 檢查每個 JSON 檔，但處理方式不同：

- **`build`**：不符格式的檔案會**跳過**，列出原因後用其他題庫繼續產生網頁，結尾顯示跳過幾個檔案。全部都不符格式時才會停止。
- **`validate`**：檢查完所有檔案再一次列出問題；只要有一個檔案不通過，結束代碼就是 1，方便放進 CI。

`build` 跳過檔案時的輸出：

```
⚠ 跳過 banks/my/my-bank.json（不符合題庫格式）
    /id must match pattern "^[A-Za-z0-9-]+$"
    ...
共跳過 1 個檔案，用 quizkit validate 可以再檢查一次。

已產生 dist/portal.html：4 份題庫、270 題、0 張附圖，0.3 MB（跳過 1 個不符格式的檔案）
```

看到這段時，先用 `npx quizkit validate <那個檔案>` 看完整的錯誤，再照下一節修正。

### validate 的錯誤訊息怎麼看

檢查分兩階段：先檢查 schema，通過後才檢查內容（題號重複、答案超出選項範圍、`domain` 超出 `domains`、引用不存在的題組、題組列出的題號不存在、附圖檔不存在、題庫 ID 重複）。所以修完 schema 錯誤後，可能會再出現新的錯誤。

schema 錯誤範例：

```
✕ banks/my/my-bank.json
    /id must match pattern "^[A-Za-z0-9-]+$"
    /questions/0 must have required property 'q'
    /questions/0 must NOT have additional properties：question
    /questions/0/answer must be integer
    /questions/0/answer must be array
    /questions/0/answer must match exactly one schema in oneOf
```

- 開頭的路徑指出錯在哪裡；`/questions/0` 是第 1 題（從 0 開始數）。
- 上例的意思是：`id` 有空白；第 1 題用了 `question` 而不是 `q`；`answer` 填了 `"B"`，要改成數字 `1`。
- `answer` 的三行是同一個問題：`answer` 可以是數字或陣列，兩種都不符合時會各列一次。

內容錯誤範例：

```
✕ banks/my/b2.json
    第 1 題：答案 3 超出選項範圍（共 2 個選項）
    第 1 題：有 domain，但題庫沒有 domains
    找不到附圖 assets/x.png
```

常見原因：

| 訊息 | 處理 |
| --- | --- |
| `must have required property 'xxx'` | 缺必填欄位，見 README 的欄位表 |
| `must NOT have additional properties：xxx` | 欄位名稱打錯或不支援，例如 `question` 改成 `q`、`choices` 改成 `options` |
| `/answer must be integer` 等 | 答案寫成字母；改成從 0 開始的數字（A = 0） |
| `/id must match pattern` | `id` 只能用英數與 `-` |
| `答案 N 超出選項範圍` | 答案從 1 開始數了，或選項少填 |
| `有 domain，但題庫沒有 domains` | 補上題庫的 `domains`，或拿掉題目的 `domain` |
| `找不到題組` | 題目的 `passage` 和 `passages` 的 key 對不上；key 是字串，`"43"` 和 `43` 要一致 |
| `找不到附圖` | 見[附圖找不到](#附圖找不到) |
| `JSON 解析失敗` | JSON 語法錯誤，例如結尾多了逗號、字串沒有用雙引號 |

### 題庫原本是其他格式

先轉成 quizkit 格式再放進 `banks/`，不需要改 schema：

- **試算表或 CSV**：用 `npx quizkit import-csv`，見 README 的[從 CSV 匯入](README.md#建立自己的題庫)。
- **舊版 artifact 的題目檔**：用 `scripts/convert-legacy.js`，見 [legacy/README.md](legacy/README.md)。
- **其他 JSON 格式**：寫一個小腳本對應欄位，可以參考 [`scripts/convert-legacy.js`](scripts/convert-legacy.js) 的 `convertBank()`。轉完用 `validate` 檢查。

### 附圖找不到

`validate` 顯示 `找不到附圖 assets/xxx` 時，檢查：

1. 路徑不要寫 `assets/` 前綴：檔案在 `assets/my/a.png`，題目寫 `"my/a.png"`。
2. `assets/` 要在題庫檔的同一層或上層資料夾，不能在下層或旁邊的資料夾裡。
3. 大小寫要一致，Linux 與 GitHub Pages 會區分大小寫。

支援的圖片格式：`.webp`、`.png`、`.jpg`、`.jpeg`、`.gif`、`.svg`。

### 改了題庫，舊的進度會怎樣

進度依「題庫 `id` + 題號 `n`」記錄：

- 修改題目文字、選項或詳解：進度照常對應。
- 新增題目：沒問題，新題目顯示為未作答。
- 刪除題目：該題的舊結果會被忽略；匯入進度時會列出略過的數量。
- **重新編號**：舊結果會對到錯的題目，請避免。
- 改了 `id`：會被當成另一份題庫，舊進度不會出現。

改版時記得更新 `version`，題庫頁會顯示「題庫已從 A 更新為 B」。

---

## 網頁與進度

### 資料夾版雙擊 index.html 打不開

資料夾版用 `fetch` 載入題庫，瀏覽器不允許從 `file://` 這樣讀檔，所以會顯示「題庫載入失敗」。改用以下任一種：

- `npx quizkit serve dist/site/`，再開 `http://127.0.0.1:8080/`。
- 部署到 GitHub Pages 或其他靜態網站。
- 改用單一 HTML（`--format single`，預設），可以直接雙擊打開。

### 匯入進度時，要怎麼匯入到另一個使用者名稱

匯入一律套用到**目前選取的使用者**。匯入視窗裡「匯入「檔名」（我，2 份題庫）到「我」」中，括號裡的「我」是檔案裡記錄的名稱，後面的「到「我」」才是匯入目標。

要匯入到另一個名稱，例如 `test`：

- **改名**：在輸入框輸入 `test`，按「改目前名稱」，再匯入。
- **新增**：輸入 `test`，按「新增並切換」，再匯入。原本的使用者會保留。

先匯入再改名也可以，改名時進度會一起帶走。只在輸入框打字、沒有按按鈕，不會有任何改變。

### 把 portal.html 給別人，對方怎麼用自己的進度

不用任何設定。HTML 裡只有題庫，進度存在每個人自己的瀏覽器：

1. 對方打開時是全新狀態，使用者預設叫「我」。
2. 直接刷題，進度自動存在他的瀏覽器。
3. 想改名字，用右上角選單的「改目前名稱」。
4. 他有自己的進度檔時，用「匯入進度」。

同一台電腦、同一個瀏覽器有多人使用時，進度存在同一個地方，請各自「新增並切換」使用者。

### 重新 build 之後進度還在嗎

通常還在。進度存在瀏覽器裡，依題庫 `id` 對應，和 HTML 檔本身無關，所以覆蓋 `dist/portal.html` 後重新打開，進度照樣顯示。

例外：有些瀏覽器會依檔案位置分開存放本機檔案（`file://`）的資料，把 HTML 搬到別的資料夾可能就看不到原本的進度；清除瀏覽資料也會清掉進度。搬移或清除前，先用「匯出進度」備份。

### 舊版 artifact 的進度怎麼搬過來

舊版 artifact「證照刷題：iPAS＋AWS」的進度存在 Claude 帳號的 artifact 資料庫裡，頁面上沒有匯出按鈕。

1. 在 Claude（claude.ai 或 Claude Code）請 Claude 讀取該 artifact 資料庫裡你的進度，並轉成 `quizkit-progress/1` 格式的 JSON。
2. 在 portal.html 的使用者選單選「匯入進度」→「合併」。

舊格式與新格式的對應：

| 舊欄位 | 新欄位 |
| --- | --- |
| `papers` | `banks` |
| `attempts[].m` / `c` / `t` / `s` / `d` | `mode` / `correct` / `total` / `score` / `durationSec` |
| `r` | `lastResult` |

舊版的領域練習沒有記錄是第幾個領域，轉換時可以從作答題目的 `domain` 推回來。

---

## 開發

```bash
npm install
npm test                 # 單元測試
npm run validate         # 檢查 banks/
npm run build            # 產生 dist/portal.html
```

程式結構：

```
app/
├─ main.jsx              刷題網頁（React）
├─ progress.js           進度、使用者、匯入匯出的邏輯（純函式，有測試）
└─ index.html            外殼與 CSS
cli/
├─ index.js              指令入口與參數解析
├─ banks.js              題庫載入、schema 與內容檢查、附圖尋找（validate 與 build 共用）
├─ build.js              打包：用 esbuild 打包前端，單一 HTML 內嵌題庫與 base64 圖片
├─ validate.js
├─ import-csv.js
└─ serve.js
scripts/convert-legacy.js  舊版 artifact 題目檔轉新格式
test/                      node:test 測試
```

舊版 artifact 的題目檔（`n/d/q/o/a/e/p/f/of` 欄位）轉新格式：

```bash
node scripts/convert-legacy.js <舊題目檔...> --index <舊版 data/index.json> --out-dir <輸出資料夾> [--img-prefix ipas/]
```

詳細步驟見 [legacy/README.md](legacy/README.md)。
