// 本機預覽資料夾版（資料夾版用 fetch 載入題庫，不能直接用 file:// 打開）。
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export function serve(dir = "dist/site", { port = 8080, host = "127.0.0.1" } = {}) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) throw new Error(`找不到 ${dir}，請先跑 build --format folder`);
  const isFile = fs.statSync(root).isFile();

  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file;
    if (isFile) file = root;
    else {
      if (rel.endsWith("/")) rel += "index.html";
      file = path.join(root, rel);
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403).end();
        return;
      }
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("找不到檔案");
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(body);
    });
  });
  server.listen(Number(port), host, () => {
    console.log(`預覽：http://${host}:${port}/（Ctrl+C 結束）`);
  });
  return server;
}
