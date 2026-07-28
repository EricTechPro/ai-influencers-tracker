import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    // app/**/*.test.ts is here only for route handlers (e.g. assets/channels/[id]/route.ts):
    // page.tsx and layout.tsx under app/ still have no test coverage of their own.
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx", "app/**/*.test.ts"],
    environment: "node",
  },
})
