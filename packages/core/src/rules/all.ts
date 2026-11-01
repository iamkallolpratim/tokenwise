import { PHASE2_RULES } from "./index.ts";
import { CACHE001, LOOP001, LOOP002, LOOP003 } from "./loops.ts";
import { RAG001, RAG002, RAG003, RAG004 } from "./rag.ts";
import { TOOL001, TOOL002, TOOL003, TOOL004 } from "./tools.ts";
import type { Rule } from "./types.ts";

export const PHASE4_RULES: readonly Rule[] = [
  TOOL001,
  TOOL002,
  TOOL003,
  TOOL004,
  RAG001,
  RAG002,
  RAG003,
  RAG004,
  LOOP001,
  LOOP002,
  LOOP003,
  CACHE001,
];

/** Every registered rule, in execution order. */
export const ALL_RULES: readonly Rule[] = [...PHASE2_RULES, ...PHASE4_RULES];
