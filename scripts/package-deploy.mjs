import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ZipFile } from "yazl";

export const DEPLOY_ZIP_NAME = "finfolio.zip";

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".turbo",
  ".vs",
  "coverage",
  "dist",
  "node_modules",
  "postgres-data",
]);

export function shouldIncludePath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (!normalized || normalized === DEPLOY_ZIP_NAME) return false;
  if (normalized.endsWith(".log")) return false;
  return !normalized
    .split("/")
    .some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

async function collectFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    if (!shouldIncludePath(relativePath)) continue;

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: relativePath.split(path.sep).join("/"),
      });
    }
  }

  return files;
}

export async function createDeployZip(
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
) {
  const zipPath = path.join(rootDir, DEPLOY_ZIP_NAME);
  await rm(zipPath, { force: true });
  await mkdir(path.dirname(zipPath), { recursive: true });

  const zipFile = new ZipFile();
  const output = createWriteStream(zipPath);
  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    zipFile.outputStream.on("error", reject);
  });
  zipFile.outputStream.pipe(output);

  const files = await collectFiles(rootDir);
  for (const file of files) {
    zipFile.addFile(file.absolutePath, file.relativePath);
  }
  zipFile.end();
  await done;

  const size = (await stat(zipPath)).size;
  return { zipPath, files: files.length, size };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await createDeployZip();
  console.log(`Created ${result.zipPath}`);
  console.log(`Files: ${result.files}`);
  console.log(`Size: ${result.size} bytes`);
  console.warn("WARNING: deploy zip includes .env files. Keep it private.");
}
