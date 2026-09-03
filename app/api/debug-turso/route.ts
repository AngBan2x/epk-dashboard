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

    const { createClient } = await import("@libsql/client");

    // Read current state
    const current = await client.execute({
      sql: "SELECT * FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    const currentRow = current.rows[0] as any;
    results.current_state = {
      location: currentRow?.location,
      name: currentRow?.name,
    };

    // ── Test 1: UPDATE + immediate read (fresh client) ──
    const testVal1 = `IMMEDIATE-${Date.now()}`;
    await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [testVal1, ARTIST_ID],
    });
    const immClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const sel1 = await immClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test1_immediate = {
      selectedLocation: (sel1.rows[0] as any)?.location,
      persisted: (sel1.rows[0] as any)?.location === testVal1,
    };

    // ── Test 2: UPDATE + wait 3s + fresh client ──
    const testVal2 = `WAIT3S-${Date.now()}`;
    await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [testVal2, ARTIST_ID],
    });
    await new Promise((r) => setTimeout(r, 3000));
    const waitClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const sel2 = await waitClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test2_wait3s = {
      selectedLocation: (sel2.rows[0] as any)?.location,
      persisted: (sel2.rows[0] as any)?.location === testVal2,
    };

    // ── Test 3: UPDATE + wait 10s + fresh client ──
    const testVal3 = `WAIT10S-${Date.now()}`;
    await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [testVal3, ARTIST_ID],
    });
    await new Promise((r) => setTimeout(r, 10000));
    const wait10Client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const sel3 = await wait10Client.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test3_wait10s = {
      selectedLocation: (sel3.rows[0] as any)?.location,
      persisted: (sel3.rows[0] as any)?.location === testVal3,
    };

    // ── Restore original location ──
    const restoreVal = currentRow?.location || "Naguanagua, Venezuela";
    await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [restoreVal, ARTIST_ID],
    });

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error), results },
      { status: 500 }
    );
  }
}
