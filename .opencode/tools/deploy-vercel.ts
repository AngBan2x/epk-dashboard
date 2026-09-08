import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Deploy a Vercel usando la CLI",
  args: {
    production: tool.schema.boolean().optional().describe("Deploy a producción (default: true)"),
  },
  async execute(args) {
    const { execSync } = await import("child_process");
    const flag = args.production !== false ? "--prod" : "";
    try {
      const output = execSync(`npx vercel ${flag} --yes 2>&1`, {
        encoding: "utf-8",
        timeout: 120000,
      });
      return `✅ Deploy exitoso:\n${output}`;
    } catch (error: any) {
      return `❌ Deploy error:\n${error.stdout || error.message}`;
    }
  },
});
