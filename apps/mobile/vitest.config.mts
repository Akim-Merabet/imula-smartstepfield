import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests des modules purs (règles, calculs, encodage) : sans React Native.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
