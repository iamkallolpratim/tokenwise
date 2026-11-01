import type { Finding, Severity } from "@tokenwise/shared";
import { formatInt, ruleDocsUrl, SEVERITY_ORDER } from "@tokenwise/shared";
import type { Colors } from "./io.ts";

export function savingsLabel(f: Finding): string {
  const s = f.estimatedSavings;
  if (!s) return "n/a";
  return `~${formatInt(s.tokens)} tokens (${s.basis}${s.method ? `, ${s.method} count` : ""}, ${s.confidence} confidence)`;
}

export function location(f: Finding): string {
  return f.range
    ? `${f.file}:${f.range.startLine}${f.range.endLine !== f.range.startLine ? `-${f.range.endLine}` : ""}`
    : f.file;
}

export function severityCounts(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

function sevColor(c: Colors, s: Severity): (t: string) => string {
  return s === "CRITICAL"
    ? (t) => c.bold(c.red(t))
    : s === "HIGH"
      ? c.red
      : s === "MEDIUM"
        ? c.yellow
        : c.dim;
}

export function renderFindingsText(
  findings: Finding[],
  c: Colors,
  verbose: boolean,
  docsBase: string | null = null,
): string {
  if (findings.length === 0) return "No findings.";
  const out: string[] = [];
  for (const sev of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    out.push(sevColor(c, sev)(`${sev} (${group.length})`));
    for (const f of group) {
      out.push(`  ${c.bold(f.ruleId)}  ${location(f)}  ${f.description}`);
      out.push(`      evidence: ${c.dim(f.evidence)}`);
      if (f.relatedLocations?.length)
        out.push(`      related:  ${f.relatedLocations.map((l) => `${l.file}:${l.startLine}`).join(", ")}`);
      out.push(
        `      savings:  ${savingsLabel(f)}${f.autoFixable ? c.green("  [auto-fixable]") : ""}${f.kind === "recommendation" ? "  [recommendation]" : ""}`,
      );
      out.push(`      risk:     ${f.risk}`);
      const rec = verbose ? f.recommendation : (f.recommendation.split("\n")[0] ?? "");
      out.push(`      fix:      ${rec.replace(/\n/g, "\n                ")}`);
      if (f.confirmWith && verbose) out.push(`      confirm:  ${f.confirmWith}`);
      if (docsBase) out.push(`      docs:     ${c.dim(ruleDocsUrl(docsBase, f.ruleId))}`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

export function renderSummaryLine(findings: Finding[]): string {
  const c = severityCounts(findings);
  const fixable = findings.filter((f) => f.autoFixable).length;
  return `${findings.length} findings: ${c.CRITICAL} critical, ${c.HIGH} high, ${c.MEDIUM} medium, ${c.LOW} low. ${fixable} auto-fixable (preview with: tokenwise optimize).`;
}

const md = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");

export function renderFindingsMarkdown(findings: Finding[]): string {
  const out = ["# TokenWise audit", "", renderSummaryLine(findings), ""];
  for (const sev of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    out.push(
      `## ${sev} (${group.length})`,
      "",
      "| Rule | Location | Finding | Savings | Risk | Recommendation |",
      "|---|---|---|---|---|---|",
    );
    for (const f of group) {
      out.push(
        `| ${f.ruleId} | \`${location(f)}\` | ${md(f.description)} | ${md(savingsLabel(f))} | ${md(f.risk)} | ${md(f.recommendation)} |`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}
