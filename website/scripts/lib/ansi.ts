// Minimal ANSI SGR → HTML converter for captured CLI output. Handles what picocolors emits
// (bold, dim, standard and bright foreground colors, resets); other escape codes are dropped.

const COLORS: Record<number, string> = {
  30: "black",
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
  90: "gray",
  91: "red",
  92: "green",
  93: "yellow",
  94: "blue",
  95: "magenta",
  96: "cyan",
  97: "white",
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences is the point.
  return s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}

export function ansiToHtml(input: string): string {
  let bold = false;
  let dim = false;
  let color: string | null = null;
  let out = "";
  let open = false;
  const openSpan = () => {
    const cls = [bold ? "a-bold" : "", dim ? "a-dim" : "", color ? `a-${color}` : ""].filter(Boolean);
    if (cls.length) {
      out += `<span class="${cls.join(" ")}">`;
      open = true;
    }
  };
  const closeSpan = () => {
    if (open) out += "</span>";
    open = false;
  };
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences is the point.
  const re = /\u001b\[([0-9;]*)([A-Za-z])/g;
  let last = 0;
  for (let m = re.exec(input); m; m = re.exec(input)) {
    out += escapeHtml(input.slice(last, m.index));
    last = re.lastIndex;
    if (m[2] !== "m") continue;
    const codes = (m[1] || "0").split(";").map(Number);
    closeSpan();
    for (const c of codes) {
      if (c === 0) {
        bold = false;
        dim = false;
        color = null;
      } else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) {
        bold = false;
        dim = false;
      } else if (c === 39) color = null;
      else if (COLORS[c]) color = COLORS[c] ?? null;
    }
    openSpan();
  }
  out += escapeHtml(input.slice(last));
  closeSpan();
  return out;
}
