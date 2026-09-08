import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Ejecutar quality gates completos: typecheck + unit tests + build",
  args: {},
  async execute() {
    const { execSync } = await import("child_process");
    const results: string[] = [];

    // 1. Typecheck
    try {
      execSync("npx tsc --noEmit 2>&1", { encoding: "utf-8", timeout: 60000 });
      results.push("✅ TypeScript: 0 errores");
    } catch (error: any) {
      results.push(`❌ TypeScript:\n${error.stdout || error.message}`);
    }

    // 2. Unit tests
    try {
      const testOutput = execSync("pnpm test:unit 2>&1", {
        encoding: "utf-8",
        timeout: 60000,
      });
      const passed = testOutput.includes("passed");
      results.push(passed ? `✅ Tests: ${testOutput.match(/(\d+) passed/)?.[1] || "all"} passing` : `❌ Tests failed`);
    } catch (error: any) {
      results.push(`❌ Tests:\n${error.stdout || error.message}`);
    }

    // 3. Build
    try {
      execSync("pnpm build 2>&1", { encoding: "utf-8", timeout: 120000 });
      results.push("✅ Build: exitoso");
    } catch (error: any) {
      results.push(`❌ Build:\n${error.stdout?.slice(-500) || error.message}`);
    }

    return results.join("\n\n");
  },
});
