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

    // Read current state first
    const current = await client.execute({
      sql: "SELECT * FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    const currentRow = current.rows[0] as any;
    results.current_state = {
      id: currentRow?.id,
      name: currentRow?.name,
      location: currentRow?.location,
      genre: currentRow?.genre,
      user_id: currentRow?.user_id,
      biography: currentRow?.biography?.substring(0, 50),
      monthly_listeners: currentRow?.monthly_listeners,
    };

    const { createClient } = await import("@libsql/client");
    const newClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });

    // ── Test 1: DELETE + INSERT (replaces the row entirely) ──
    const testVal1 = `DELINS-${Date.now()}`;
    const del1 = await client.execute({
      sql: "DELETE FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    const ins1 = await client.execute({
      sql: `INSERT INTO artists (id, name, user_id, biography, press_text, press_highlights, genre, location, monthly_listeners, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        currentRow.id, currentRow.name, currentRow.user_id, currentRow.biography,
        currentRow.press_text, currentRow.press_highlights, currentRow.genre,
        testVal1, currentRow.monthly_listeners ?? 0, currentRow.created_at,
      ],
    });
    const sel1 = await newClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test1_delete_insert = {
      deleteRowsAffected: del1.rowsAffected,
      insertRowsAffected: ins1.rowsAffected,
      selectedLocation: (sel1.rows[0] as any)?.location,
      persisted: (sel1.rows[0] as any)?.location === testVal1,
    };

    // ── Test 2: INSERT OR REPLACE (full row) ──
    const testVal2 = `UPSERT-${Date.now()}`;
    const upsert2 = await client.execute({
      sql: `INSERT OR REPLACE INTO artists (id, name, user_id, biography, press_text, press_highlights, genre, location, monthly_listeners, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        currentRow.id, currentRow.name, currentRow.user_id, currentRow.biography,
        currentRow.press_text, currentRow.press_highlights, currentRow.genre,
        testVal2, currentRow.monthly_listeners ?? 0, currentRow.created_at,
      ],
    });
    const sel2 = await newClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test2_upsert = {
      rowsAffected: upsert2.rowsAffected,
      selectedLocation: (sel2.rows[0] as any)?.location,
      persisted: (sel2.rows[0] as any)?.location === testVal2,
    };

    // ── Test 3: batch() with write mode ──
    const testVal3 = `BATCH-${Date.now()}`;
    let batchResult: any = null;
    let batchError: string | null = null;
    try {
      batchResult = await client.batch(
        [{ sql: "UPDATE artists SET location = ? WHERE id = ?", args: [testVal3, ARTIST_ID] }],
        "write"
      );
    } catch (e) {
      batchError = String(e);
    }
    const sel3 = await newClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test3_batch_write = {
      batchResult: batchResult,
      batchError: batchError,
      selectedLocation: (sel3.rows[0] as any)?.location,
      persisted: (sel3?.rows[0] as any)?.location === testVal3,
    };

    // ── Test 4: transaction() with explicit commit ──
    const testVal4 = `TXN-${Date.now()}`;
    let txnError: string | null = null;
    try {
      const txn = await client.transaction("write");
      await txn.execute({
        sql: "UPDATE artists SET location = ? WHERE id = ?",
        args: [testVal4, ARTIST_ID],
      });
      await txn.commit();
    } catch (e) {
      txnError = String(e);
    }
    const sel4 = await newClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test4_transaction = {
      txnError: txnError,
      selectedLocation: (sel4.rows[0] as any)?.location,
      persisted: (sel4.rows[0] as any)?.location === testVal4,
    };

    // ── Test 5: Raw SQL via batch (no params) ──
    const testVal5 = `RAW-${Date.now()}`;
    let rawResult: any = null;
    let rawError: string | null = null;
    try {
      rawResult = await client.execute(
        `UPDATE artists SET location = '${testVal5}' WHERE id = '${ARTIST_ID}'`
      );
    } catch (e) {
      rawError = String(e);
    }
    const sel5 = await newClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test5_raw_sql = {
      rawResult: { rowsAffected: rawResult?.rowsAffected },
      rawError: rawError,
      selectedLocation: (sel5.rows[0] as any)?.location,
      persisted: (sel5.rows[0] as any)?.location === testVal5,
    };

    // ── Test 6: Write + wait 3s + read with fresh client ──
    const testVal6 = `WAIT-${Date.now()}`;
    await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [testVal6, ARTIST_ID],
    });
    // Wait 3 seconds for replica sync
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const freshClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const sel6 = await freshClient.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.test6_write_wait3s_read = {
      selectedLocation: (sel6.rows[0] as any)?.location,
      persisted: (sel6.rows[0] as any)?.location === testVal6,
    };

    // ── Test 7: Restore original location ──
    const restoreVal = currentRow?.location || "Naguanagua, Venezuela";
    await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [restoreVal, ARTIST_ID],
    });

    // ── Final state (immediate read — expected stale) ──
    const finalSel = await client.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.final_state = {
      location: (finalSel.rows[0] as any)?.location,
      note: "Stale read expected — replica lag",
    };

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error), results },
      { status: 500 }
    );
  }
}
