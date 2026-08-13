import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**",
        "src/stores/**",
        "src/hooks/**",
        "src/app/api/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
