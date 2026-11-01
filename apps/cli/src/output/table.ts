import { stripVTControlCharacters } from "node:util";

export interface Column {
  header: string;
  align?: "left" | "right";
}

const width = (s: string) => Array.from(stripVTControlCharacters(s)).length;

export function renderTable(columns: Column[], rows: string[][]): string {
  const widths = columns.map((c, i) => Math.max(width(c.header), ...rows.map((r) => width(r[i] ?? ""))));
  const fmt = (cells: string[]) =>
    cells
      .map((cell, i) => {
        const w = widths[i] ?? 0;
        const pad = " ".repeat(Math.max(0, w - width(cell)));
        return columns[i]?.align === "right" ? pad + cell : cell + pad;
      })
      .join("  ")
      .trimEnd();
  return [fmt(columns.map((c) => c.header)), ...rows.map(fmt)].join("\n");
}
