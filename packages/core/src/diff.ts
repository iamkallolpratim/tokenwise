import { createTwoFilesPatch } from "diff";

export function unifiedDiff(repoPath: string, before: string, after: string): string {
  return createTwoFilesPatch(`a/${repoPath}`, `b/${repoPath}`, before, after, undefined, undefined, {
    context: 3,
  });
}
