import { keyLine, walk } from "./structured.ts";
import type { DraftFinding, FileContext, Rule } from "./types.ts";

const TOP_K = new Set(["top_k", "topK", "similarity_top_k", "n_results", "nResults"]);
/** Generic names, used only when no specific top-k key exists. */
const TOP_K_FALLBACK = new Set(["k", "limit"]);
const FILTER = new Set([
  "filter",
  "filters",
  "where",
  "metadata_filter",
  "metadataFilter",
  "metadata_filters",
  "namespace",
]);
const RERANK = new Set(["rerank", "reranker", "reranking", "rerank_model", "rerankModel"]);
const OVERLAP = new Set(["chunk_overlap", "chunkOverlap", "overlap"]);
const SIZE = new Set(["chunk_size", "chunkSize"]);

function ragFiles(files: FileContext[]): FileContext[] {
  return files.filter((f) => f.file.category === "rag-config");
}

interface RagFacts {
  topK?: { value: number; key: string };
  hasFilter: boolean;
  rerank?: { value: unknown; key: string };
  overlap?: { value: number; key: string };
  size?: { value: number; key: string };
}

function facts(fc: FileContext): RagFacts {
  const f: RagFacts = { hasFilter: false };
  let fallback: RagFacts["topK"];
  walk(fc.structured, ({ key, value }) => {
    if (typeof value === "number" && TOP_K.has(key)) f.topK ??= { value, key };
    if (typeof value === "number" && TOP_K_FALLBACK.has(key)) fallback ??= { value, key };
    if (FILTER.has(key) && value !== null && value !== false) f.hasFilter = true;
    if (RERANK.has(key)) f.rerank ??= { value, key };
    if (OVERLAP.has(key) && typeof value === "number") f.overlap ??= { value, key };
    if (SIZE.has(key) && typeof value === "number") f.size ??= { value, key };
  });
  f.topK ??= fallback;
  return f;
}

const base = {
  autoFixable: false,
  kind: "recommendation" as const,
  confirmWith:
    "Run retrieval or answer-quality evals before and after the change; static config cannot show retrieved token volume.",
};

export const RAG001: Rule = {
  id: "RAG-001",
  category: "rag",
  defaultSeverity: "MEDIUM",
  description: "Retrieval limit above threshold",
  method: "A top_k (or similar) retrieval limit above thresholds.ragTopK (10) in RAG configuration.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ragFiles(ctx.files)) {
      const { topK, size } = facts(fc);
      if (!topK || topK.value <= ctx.config.thresholds.ragTopK) continue;
      const line = keyLine(fc.file.file.text, topK.key);
      out.push({
        ...base,
        severity: "MEDIUM",
        file: fc.file.path,
        range: { startLine: line, endLine: line },
        description: `${topK.key}: ${topK.value} retrieves more than ${ctx.config.thresholds.ragTopK} chunks per query${size ? ` (up to ~${(topK.value * size.value).toLocaleString("en-US")} characters at ${size.key} ${size.value})` : ""}.`,
        evidence: `${topK.key}: ${topK.value}`,
        risk: "Fewer chunks can drop the passage that answers the question; measure recall before lowering it.",
        recommendation: `Lower ${topK.key} toward ${ctx.config.thresholds.ragTopK} and add reranking or filters so the top chunks are the right ones.`,
      });
    }
    return out;
  },
};

export const RAG002: Rule = {
  id: "RAG-002",
  category: "rag",
  defaultSeverity: "LOW",
  description: "No metadata filters on retrieval",
  method: "Retrieval configuration with no metadata filter keys.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ragFiles(ctx.files)) {
      const f = facts(fc);
      if (f.hasFilter || !f.topK) continue;
      out.push({
        ...base,
        severity: "LOW",
        file: fc.file.path,
        range: { startLine: 1, endLine: 1 },
        description: "Retrieval config has no metadata filter (filter, where, namespace…).",
        evidence: "no filter keys found",
        risk: "Filters wrongly scoped hide relevant documents.",
        recommendation:
          "Filter by metadata the query already implies (product, tenant, document type) so fewer irrelevant chunks are retrieved.",
      });
    }
    return out;
  },
};

export const RAG003: Rule = {
  id: "RAG-003",
  category: "rag",
  defaultSeverity: "LOW",
  description: "No reranking step",
  method: "Retrieval configuration where reranking is absent or disabled.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ragFiles(ctx.files)) {
      const f = facts(fc);
      if (!f.topK) continue;
      if (f.rerank && f.rerank.value !== false && f.rerank.value !== null && f.rerank.value !== "none")
        continue;
      const line = f.rerank ? keyLine(fc.file.file.text, f.rerank.key) : 1;
      out.push({
        ...base,
        severity: "LOW",
        file: fc.file.path,
        range: { startLine: line, endLine: line },
        description: f.rerank ? `${f.rerank.key} is disabled.` : "Retrieval config has no reranking step.",
        evidence: f.rerank ? `${f.rerank.key}: ${String(f.rerank.value)}` : "no rerank keys found",
        risk: "A reranker adds latency and its own cost.",
        recommendation: "Retrieve broadly, rerank, and pass only the top few chunks to the model.",
      });
    }
    return out;
  },
};

export const RAG004: Rule = {
  id: "RAG-004",
  category: "rag",
  defaultSeverity: "MEDIUM",
  description: "Chunk overlap likely to duplicate content",
  method: "Chunk overlap of at least 25% of the chunk size.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ragFiles(ctx.files)) {
      const { overlap, size } = facts(fc);
      if (!overlap || !size || size.value <= 0) continue;
      const ratio = overlap.value / size.value;
      if (ratio < 0.25) continue;
      const line = keyLine(fc.file.file.text, overlap.key);
      out.push({
        ...base,
        severity: "MEDIUM",
        file: fc.file.path,
        range: { startLine: line, endLine: line },
        description: `${overlap.key} ${overlap.value} is ${(ratio * 100).toFixed(0)}% of ${size.key} ${size.value}; adjacent retrieved chunks repeat that much text.`,
        evidence: `${overlap.key}: ${overlap.value}, ${size.key}: ${size.value}`,
        risk: "Too little overlap can split a fact across chunks.",
        recommendation:
          "Keep overlap around 10–20% of chunk size, or deduplicate overlapping spans before building the prompt.",
      });
    }
    return out;
  },
};
