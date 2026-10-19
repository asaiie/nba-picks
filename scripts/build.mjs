import { mkdir, copyFile, cp } from "node:fs/promises";
await mkdir("public", { recursive: true });
for (const file of [
  "index.html",
  "app.js",
  "style.css",
  "shared.js",
  "award-directory.js",
  "_headers",
])
  await copyFile(file, `public/${file}`);
await cp("fonts", "public/fonts", { recursive: true });
await cp("data", "public/data", { recursive: true });
console.log("Built public/");
