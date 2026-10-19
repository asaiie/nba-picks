import { mkdir, copyFile } from "node:fs/promises";
await mkdir("public", { recursive: true });
for (const file of [
  "index.html",
  "app.js",
  "style.css",
  "shared.js",
  "_headers",
])
  await copyFile(file, `public/${file}`);
console.log("Built public/");
