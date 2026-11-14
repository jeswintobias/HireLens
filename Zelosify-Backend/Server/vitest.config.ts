import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html"],
      exclude: ["**/tests/**", "**/__tests__/**", "**/node_modules/**"],
    },
    include: ["**/tests/**/*.test.ts", "**/__tests__/**/*.test.ts"],
    exclude: ["**/dist/**", "**/build/**", "**/node_modules/**"],
    setupFiles: ["./tests/setup/env.ts", "./tests/setup/mocks.ts"],
    // Integration + performance suites share one Postgres database and
    // measure latency, so test files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    // Drop the existing auth middlewares' debug console output.
    onConsoleLog: (log) =>
      !/Middleware Passed|Token verification failed|User not found|Error in file upload|Error decrypting/.test(log),
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
