import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Tomar screenshot de una página con Playwright",
  args: {
    url: tool.schema.string().describe("URL de la página a capturar"),
    filename: tool.schema.string().optional().describe("Nombre del archivo de salida (sin extensión)"),
    fullPage: tool.schema.boolean().optional().describe("Capturar página completa (default: true)"),
  },
  async execute(args) {
    const { execSync } = await import("child_process");
    const name = args.filename || "screenshot";
    const full = args.fullPage !== false ? "--full-page" : "";
    try {
      execSync(
        `npx playwright screenshot ${full} --browser chromium "${args.url}" "tests/screenshots/${name}.png" 2>&1`,
        { encoding: "utf-8", timeout: 30000 }
      );
      return `✅ Screenshot guardado en tests/screenshots/${name}.png`;
    } catch (error: any) {
      return `❌ Screenshot error:\n${error.stdout || error.message}`;
    }
  },
});
