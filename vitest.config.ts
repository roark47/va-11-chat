import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 10_000,
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
