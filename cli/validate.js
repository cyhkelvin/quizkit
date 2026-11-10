import fs from "node:fs";
import { findJsonFiles, checkBank, checkProgress } from "./banks.js";

/** 檢查題庫與進度檔；回傳是否全部通過。 */
export function validate(targets) {
  if (!targets.length) targets = ["banks/"];
  let ok = true;
  const ids = new Map();
  let count = 0;
  for (const target of targets) {
    if (!fs.existsSync(target)) {
      console.error(`✕ 找不到 ${target}`);
      ok = false;
      continue;
    }
    for (const file of findJsonFiles(target)) {
      count++;
      let data;
      try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        console.error(`✕ ${file}\n    JSON 解析失敗：${e.message}`);
        ok = false;
        continue;
      }
      const isProgress = typeof data.format === "string";
      const errors = isProgress ? checkProgress(data) : checkBank(data, file);
      if (!isProgress && !errors.length) {
        if (ids.has(data.id)) errors.push(`題庫 ID "${data.id}" 與 ${ids.get(data.id)} 重複`);
        else ids.set(data.id, file);
      }
      if (errors.length) {
        ok = false;
        console.error(`✕ ${file}`);
        errors.forEach((e) => console.error(`    ${e}`));
      } else {
        const what = isProgress ? "進度檔" : `${data.questions.length} 題`;
        console.log(`✓ ${file}（${what}）`);
      }
    }
  }
  if (!count) {
    console.error("沒有找到任何 .json 檔");
    ok = false;
  }
  console.log(ok ? `\n全部 ${count} 個檔案通過檢查。` : "\n有檔案沒有通過檢查。");
  return ok;
}
