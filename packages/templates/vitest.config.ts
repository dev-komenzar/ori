import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts",
      "ddd-vsa-hex-typescript/apps/**/*.test.ts",
      "ddd-vsa-hex-typescript-tauri/apps/**/*.test.ts",
    ],
  },
});
