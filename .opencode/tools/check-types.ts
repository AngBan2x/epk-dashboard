import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Ejecutar TypeScript typecheck y reportar errores",
  args: {},
  async execute() {
    const { execSync } = await import("child_process");
    try {
      const output = execSync("npx tsc --noEmit 2>&1", {
        encoding: "utf-8",
        timeout: 60000,
      });
      if (output.trim() === "") {
        return "✅ TypeScript: 0 errores";
      }
      return `❌ TypeScript errors:\n${output}`;
    } catch (error: any) {
      return `❌ TypeScript errors:\n${error.stdout || error.message}`;
    }
  },
});
