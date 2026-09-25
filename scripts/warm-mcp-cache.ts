import { execSync } from "child_process";
console.log("=== Pre-warming npx cache ===");
const pkgs = [
  "@modelcontextprotocol/server-filesystem",
  "@playwright/mcp",
  "@mokei/mcp-fetch",
];
for (const pkg of pkgs) {
  try {
    execSync(`npx -y ${pkg} --version`, { encoding: "utf-8", timeout: 120000, stdio: "pipe" });
    console.log(`OK: ${pkg}`);
  } catch (e: unknown) {
    console.log(`WARN ${pkg}:`, (e as Error).message.slice(0, 120));
  }
}
try {
  execSync("uvx mcp-server-git --help", { encoding: "utf-8", timeout: 120000, stdio: "pipe" });
  console.log("OK: mcp-server-git");
} catch (e: unknown) {
  console.log("WARN mcp-server-git:", (e as Error).message.slice(0, 120));
}
console.log("Pre-warming done");