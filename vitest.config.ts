import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts", "tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "e2e",
          include: ["tests/integration/**/*.test.ts", "tests/e2e/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
