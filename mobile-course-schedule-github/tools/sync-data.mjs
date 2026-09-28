import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const sourcePath = resolve(projectDir, "courses.json");
const targetPath = resolve(projectDir, "data", "courses.data.js");

const source = await readFile(sourcePath, "utf8");
const parsed = JSON.parse(source);

const output = [
  "// 此文件由 tools/sync-data.mjs 根据 courses.json 生成。",
  "// 它用于直接双击 index.html 时的离线回退；通过网站访问时优先读取 courses.json。",
  `window.COURSE_DATA = ${JSON.stringify(parsed, null, 2)};`,
  "",
].join("\n");

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, output, "utf8");

console.log(`已同步 ${parsed.courses.length} 条课程记录到 data/courses.data.js`);
