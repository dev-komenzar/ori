import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts",
      "ddd-typescript/src/**/*.test.ts",
    ],
  },
});
