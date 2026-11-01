import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decode, encode, readTextFile, writeFileAtomic } from "@tokenwise/core";
import { describe, expect, it } from "vitest";
import { tempDir } from "../helpers/cli.ts";

describe("file IO", () => {
  it.each([
    ["utf8", Buffer.from("héllo\nworld\n", "utf8")],
    ["utf8 BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("hi\r\nthere\r\n")])],
    ["utf16le BOM", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("hi\nthere", "utf16le")])],
  ])("round-trips %s byte-for-byte", (_n, buf) => {
    expect(encode(decode(buf)).equals(buf)).toBe(true);
  });

  it("detects CRLF", () => {
    expect(decode(Buffer.from("a\r\nb\r\n")).lineEnding).toBe("\r\n");
    expect(decode(Buffer.from("a\nb\n")).lineEnding).toBe("\n");
  });

  it("writes atomically and preserves mode", async () => {
    const dir = tempDir();
    const f = path.join(dir, "x.md");
    writeFileSync(f, "old", { mode: 0o640 });
    const before = await readTextFile(f);
    await writeFileAtomic(f, Buffer.from("new"), before.mode);
    expect(readFileSync(f, "utf8")).toBe("new");
    if (process.platform !== "win32") expect(statSync(f).mode & 0o777).toBe(0o640);
  });
});
