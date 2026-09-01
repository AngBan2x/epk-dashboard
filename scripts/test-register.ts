import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const res = await fetch("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test API User",
      email: `test-api-${Date.now()}@example.com`,
      password: "TestPass123!"
    })
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));
}

main();
