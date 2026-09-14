/**
 * fix-release-status.ts
 * 
 * Migración de datos: todos los tracks con status NULL → 'approved'
 * Ejecutar contra Turso (producción) o SQLite (local)
 * 
 * Uso: npx tsx scripts/fix-release-status.ts
 */

import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.error("❌ TURSO_DATABASE_URL no configurado");
    process.exit(1);
  }

  const client = createClient({
    url,
    authToken: authToken || undefined,
  });

  console.log("🔗 Conectando a Turso...");
  console.log(`   URL: ${url}`);

  // 1. Contar tracks con status NULL
  const countResult = await client.execute(
    "SELECT COUNT(*) as total FROM tracks WHERE status IS NULL"
  );
  const totalNull = Number((countResult.rows[0] as any)?.total || 0);
  console.log(`\n📊 Tracks con status NULL: ${totalNull}`);

  if (totalNull === 0) {
    console.log("✅ No hay tracks para migrar. Todos ya tienen status.");
    return;
  }

  // 2. Mostrar preview de tracks a migrar
  const previewResult = await client.execute(
    "SELECT id, title, artist_name, status FROM tracks WHERE status IS NULL LIMIT 10"
  );
  console.log("\n📋 Preview de tracks a migrar:");
  for (const row of previewResult.rows) {
    console.log(`   - ${row.title} (${row.artist_name}) [${row.id}]`);
  }

  // 3. Ejecutar migración
  console.log("\n🔄 Ejecutando migración: NULL → 'approved'...");
  const updateResult = await client.execute(
    "UPDATE tracks SET status = 'approved' WHERE status IS NULL"
  );
  const rowsAffected = Number(updateResult.rowsAffected || 0);
  console.log(`✅ ${rowsAffected} tracks actualizados a 'approved'`);

  // 4. Verificar resultado
  const verifyResult = await client.execute(
    "SELECT status, COUNT(*) as count FROM tracks GROUP BY status"
  );
  console.log("\n📊 Distribución de status después de la migración:");
  for (const row of verifyResult.rows) {
    console.log(`   ${row.status || 'NULL'}: ${row.count}`);
  }

  console.log("\n✅ Migración completada exitosamente");
}

main().catch((err) => {
  console.error("❌ Error durante la migración:", err);
  process.exit(1);
});
