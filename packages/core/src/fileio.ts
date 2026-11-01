import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { detectLineEnding, type LineEnding } from "@tokenwise/shared";

export type TextEncoding = "utf8" | "utf16le" | "utf16be";

export interface TextFile {
  text: string;
  encoding: TextEncoding;
  bom: boolean;
  lineEnding: LineEnding;
  mode: number;
}

export function decode(buf: Buffer): Omit<TextFile, "mode"> {
  let encoding: TextEncoding = "utf8";
  let bom = false;
  let body = buf;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    bom = true;
    body = buf.subarray(3);
  } else if (buf[0] === 0xff && buf[1] === 0xfe) {
    encoding = "utf16le";
    bom = true;
    body = buf.subarray(2);
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    encoding = "utf16be";
    bom = true;
    body = buf.subarray(2);
  }
  let text: string;
  if (encoding === "utf16be") {
    const swapped = Buffer.from(body);
    swapped.swap16();
    text = swapped.toString("utf16le");
  } else {
    text = body.toString(encoding);
  }
  return { text, encoding, bom, lineEnding: detectLineEnding(text) };
}

export function encode(file: Pick<TextFile, "text" | "encoding" | "bom">): Buffer {
  if (file.encoding === "utf8") {
    const body = Buffer.from(file.text, "utf8");
    return file.bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
  }
  const le = Buffer.from(file.text, "utf16le");
  if (file.encoding === "utf16le") return file.bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), le]) : le;
  le.swap16();
  return file.bom ? Buffer.concat([Buffer.from([0xfe, 0xff]), le]) : le;
}

export function isProbablyBinary(buf: Buffer): boolean {
  if (buf[0] === 0xff && buf[1] === 0xfe) return false;
  if (buf[0] === 0xfe && buf[1] === 0xff) return false;
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export async function readTextFile(abs: string): Promise<TextFile> {
  const [buf, st] = await Promise.all([fs.readFile(abs), fs.stat(abs)]);
  return { ...decode(buf), mode: st.mode & 0o7777 };
}

/** Atomic write: temp file in the same directory, then rename. Preserves mode. */
export async function writeFileAtomic(abs: string, data: Buffer, mode?: number): Promise<void> {
  const dir = path.dirname(abs);
  const tmp = path.join(dir, `.${path.basename(abs)}.tokenwise-${process.pid}-${Date.now()}.tmp`);
  const handle = await fs.open(tmp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode ?? 0o644);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (mode !== undefined) await fs.chmod(tmp, mode);
  try {
    await fs.rename(tmp, abs);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}
