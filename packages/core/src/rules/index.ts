import { CTX001, CTX002, CTX003 } from "./context.ts";
import { FMT001 } from "./format.ts";
import { RED001, RED002, RED003, RED004, RED005 } from "./redundancy.ts";
import { SEC001, SEC002 } from "./security.ts";
import type { Rule } from "./types.ts";
import { VERB001, VERB002 } from "./verbosity.ts";

export const PHASE2_RULES: readonly Rule[] = [
  RED001,
  RED002,
  RED003,
  RED004,
  RED005,
  FMT001,
  VERB001,
  VERB002,
  CTX001,
  CTX002,
  CTX003,
  SEC001,
  SEC002,
];

export type { DraftFinding, FileContext, Rule, RuleContext } from "./types.ts";
