import { NextResponse } from "next/server";
import { getTurso } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const ARTIST_ID = "art-1788275587598";
  const results: Record<string, unknown> = {};

  try {
    const client = getTurso();
    if (!client) {
      return NextResponse.json({ error: "Turso not configured" }, { status: 500 });
    }

    // ── Test 1: Same singleton, UPDATE + SELECT ──
    const testValue1 = `TEST1-${Date.now()}`;
    const upd1 = await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [testValue1, ARTIST_ID],
    });
    const sel1 = await client.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test1_same_singleton = {
      updateRowsAffected: upd1.rowsAffected,
      selectedLocation: (sel1.rows[0] as any)?.location,
      persisted: (sel1.rows[0] as any)?.location === testValue1,
    };

    // ── Test 2: New connection, UPDATE + SELECT ──
    const testValue2 = `TEST2-${Date.now()}`;
    const upd2 = await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [testValue2, ARTIST_ID],
    });
    const { createClient } = await import("@libsql/client");
    const newClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const sel2 = await newClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test2_new_connection = {
      updateRowsAffected: upd2.rowsAffected,
      selectedLocation: (sel2.rows[0] as any)?.location,
      persisted: (sel2.rows[0] as any)?.location === testValue2,
    };

    // ── Test 3: lib/db.ts singleton UPDATE + lib/turso.ts singleton SELECT ──
    const testValue3 = `TEST3-${Date.now()}`;
    const upd3 = await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [testValue3, ARTIST_ID],
    });
    const { getTursoClient: getTursoClient2 } = await import("@/lib/turso");
    const client2 = getTursoClient2();
    const sel3 = client2
      ? await client2.execute({
          sql: "SELECT location FROM artists WHERE id = ?",
          args: [ARTIST_ID],
        })
      : null;
    results.test3_cross_singleton = {
      updateRowsAffected: upd3.rowsAffected,
      selectedLocation: (sel3?.rows[0] as any)?.location,
      persisted: (sel3?.rows[0] as any)?.location === testValue3,
      client2Available: !!client2,
    };

    // ── Test 4: INSERT + SELECT with new connection ──
    const testId = `debug-${Date.now()}`;
    const ins4 = await client.execute({
      sql: "INSERT INTO artists (id, name, genre, location) VALUES (?, ?, ?, ?)",
      args: [testId, "Debug Test", "Test", `INSERT-${Date.now()}`],
    });
    const sel4 = await newClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [testId],
    });
    results.test4_insert_new_connection = {
      insertRowsAffected: ins4.rowsAffected,
      selectedLocation: (sel4.rows[0] as any)?.location,
      persisted: !!(sel4.rows[0] as any)?.location,
    };

    // ── Test 5: Final state ──
    const finalSel = await client.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.final_state = {
      location: (finalSel.rows[0] as any)?.location,
    };

    // ── Cleanup: remove debug artist ──
    await client.execute({ sql: "DELETE FROM artists WHERE id = ?", args: [testId] });

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error), results },
      { status: 500 }
    );
  }
}
