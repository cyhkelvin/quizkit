# legacy：加入 iPAS 題庫

這個資料夾除了本說明以外都不進版控（見 `.gitignore`），用來放舊版 artifact 的檔案或其他私人資料。

iPAS 題目著作權屬官方，不放在公開 repo。以下兩種方法擇一，把 iPAS 題庫放進 `banks/private-ipas/`（`banks/private-*/` 同樣不進版控），再和公開題庫一起 build。

以下指令都在 quizkit repo 根目錄執行，且已經跑過 `npm install`。

## 方法 A：clone 私有題庫 repo（建議）

需要 `cyhkelvin/quizkit-banks-ipas` 的讀取權限。

```bash
git clone https://github.com/cyhkelvin/quizkit-banks-ipas.git banks/private-ipas
npx quizkit validate banks/private-ipas
npx quizkit build --banks banks/ --out dist/portal.html
```

題庫更新時：

```bash
git -C banks/private-ipas pull
npx quizkit build --banks banks/ --out dist/portal.html
```

## 方法 B：從舊版 artifact 的壓縮檔轉換

適合沒有私有 repo 權限、但手上有舊版 artifact 下載檔（`證照刷題：iPAS＋AWS.zip`，內含 `data/*.json` 與 `img/*.webp`）的情況。

1. 把壓縮檔解到 `legacy/artifact/`：

   ```bash
   unzip "/path/to/證照刷題：iPAS＋AWS.zip" -d legacy/artifact
   ```

2. 把 iPAS 題目檔（`elem-*`、`mid-*`）轉成 quizkit 格式，輸出到 `banks/private-ipas/banks/`。`data/index.json` 是舊版的試卷目錄，提供題庫名稱、時間與及格分數：

   ```bash
   node scripts/convert-legacy.js legacy/artifact/data/elem-*.json legacy/artifact/data/mid-*.json \
     --index legacy/artifact/data/index.json \
     --out-dir banks/private-ipas/banks \
     --img-prefix ipas/
   ```

   AWS 題庫已經在 `banks/aws/`，不用轉。

3. 複製附圖。題庫裡的附圖路徑是 `ipas/<檔名>`，會在 `banks/private-ipas/assets/` 底下找：

   ```bash
   mkdir -p banks/private-ipas/assets/ipas
   cp legacy/artifact/img/* banks/private-ipas/assets/ipas/
   ```

4. 檢查並 build：

   ```bash
   npx quizkit validate banks/private-ipas
   npx quizkit build --banks banks/ --out dist/portal.html
   ```

成功的話，`validate` 會列出 14 份 iPAS 題庫都通過；`build` 會顯示「18 份題庫、970 題、72 張附圖」，`dist/portal.html` 約 3.2 MB。

## 只要 iPAS、或調整分頁順序

```bash
# 只打包 iPAS
npx quizkit build --banks banks/private-ipas --out dist/ipas.html

# iPAS 分頁排在 AWS 前面
npx quizkit build --banks banks/private-ipas --banks banks/aws --out dist/portal.html
```

## 注意

- build 出來的 HTML 內含 iPAS 題目，分享前請留意。
- 方法 B 轉出的題庫缺少私有 repo 裡的補充說明（例如 115 年第三次初級「未與官方 PDF 核對」的提醒），題目內容相同。
