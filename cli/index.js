#!/usr/bin/env node
import { validate } from "./validate.js";
import { build } from "./build.js";
import { importCsv } from "./import-csv.js";
import { serve } from "./serve.js";

const HELP = `quizkit：把題庫 JSON 變成刷題網頁

用法：
  quizkit validate [路徑...]                     檢查題庫與進度檔格式（預設 banks/）
  quizkit build --banks <路徑> --out <輸出>      產生刷題網頁
        [--format single|folder]                single：單一 HTML（預設）；folder：資料夾
        [--title <標題>]                         網頁標題
        --banks 可以重複指定，或用逗號分隔多個路徑
  quizkit import-csv <檔案.csv> --id <ID> --group <分頁> --out <輸出.json>
        [--title <標題>] [--minutes <分鐘>] [--pass <及格百分比>] [--version <版本>]
  quizkit serve [資料夾] [--port 8080]            本機預覽資料夾版
`;

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("--")) {
      const [key, inline] = a.slice(2).split("=", 2);
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined) throw new Error(`--${key} 需要一個值`);
      if (key === "banks") (opts.banks ||= []).push(...value.split(",").filter(Boolean));
      else opts[key] = value;
    } else positional.push(a);
  }
  return { positional, opts };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(HELP);
    return;
  }
  const { positional, opts } = parseArgs(rest);
  if (opts.help) {
    console.log(HELP);
    return;
  }
  switch (cmd) {
    case "validate":
      if (!validate(positional)) process.exitCode = 1;
      break;
    case "build":
      await build({ banks: opts.banks || positional, out: opts.out, format: opts.format, title: opts.title });
      break;
    case "import-csv":
      if (!positional[0]) throw new Error("需要 CSV 檔案路徑");
      importCsv(positional[0], opts);
      break;
    case "serve":
      serve(positional[0], { port: opts.port || 8080, host: opts.host });
      break;
    default:
      throw new Error(`不認得的指令：${cmd}\n\n${HELP}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
