import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * Best-effort local file cache for generated media. On read-only filesystems
 * (e.g. Vercel) writes fail silently and media is simply regenerated per
 * request — Anki keeps its own copy once the file is stored there.
 */
const CACHE_DIR =
  process.env.MEDIA_CACHE_DIR || path.join(process.cwd(), "data", "media");

/**
 * Fold accents and strip anything that isn't filename-safe ASCII.
 * Falls back to a content hash for words that don't survive folding
 * (e.g. non-Latin scripts).
 */
export function sanitizeForFilename(text: string): string {
  const folded = text
    .toLowerCase()
    .replace(/\s+/g, "_")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const cleaned = [...folded].filter((c) => /[a-z0-9_-]/.test(c)).join("");
  return cleaned || shortHash(text);
}

export function shortHash(text: string, length = 10): string {
  return createHash("sha256").update(text).digest("hex").substring(0, length);
}

/** Read cached text (e.g. a generated image prompt); null on miss */
export async function readCachedText(filename: string): Promise<string | null> {
  const data = await readCachedMedia(filename);
  return data ? data.toString("utf-8") : null;
}

export async function writeCachedText(
  filename: string,
  text: string,
): Promise<void> {
  await writeCachedMedia(filename, Buffer.from(text, "utf-8"));
}

export async function readCachedMedia(
  filename: string,
): Promise<Buffer | null> {
  try {
    return await readFile(path.join(CACHE_DIR, filename));
  } catch {
    return null;
  }
}

export async function writeCachedMedia(
  filename: string,
  data: Buffer,
): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, filename), data);
  } catch (error) {
    console.warn(`Media cache write failed for ${filename}:`, error);
  }
}
