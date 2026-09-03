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

    // ── Test A: SELECT * vs SELECT location — is cache keyed by SQL? ──
    const selStar = await client.execute({
      sql: "SELECT * FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.testA_select_star = {
      location: (selStar.rows[0] as any)?.location,
    };

    const selLoc = await client.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.testB_select_location = {
      location: (selLoc.rows[0] as any)?.location,
    };

    // ── Test C: Update to unique value ──
    const testValC = `TESTC-${Date.now()}`;
    await client.execute({
      sql: "UPDATE artists SET location = ? WHERE id = ?",
      args: [testValC, ARTIST_ID],
    });

    // ── Test D: Read with SAME client using SELECT * ──
    const selD = await client.execute({
      sql: "SELECT * FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.testD_same_client_star = {
      location: (selD.rows[0] as any)?.location,
      persisted: (selD.rows[0] as any)?.location === testValC,
    };

    // ── Test E: Read with SAME client using SELECT location ──
    const selE = await client.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.testE_same_client_loc = {
      location: (selE.rows[0] as any)?.location,
      persisted: (selE.rows[0] as any)?.location === testValC,
    };

    // ── Test F: Read with FRESH client using SELECT * ──
    const freshA = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const selF = await freshA.execute({
      sql: "SELECT * FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.testF_fresh_star = {
      location: (selF.rows[0] as any)?.location,
      persisted: (selF.rows[0] as any)?.location === testValC,
    };

    // ── Test G: Read with FRESH client using SELECT location ──
    const freshB = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const selG = await freshB.execute({
      sql: "SELECT location FROM artists WHERE id = ?",
      args: [ARTIST_ID],
    });
    results.testG_fresh_loc = {
      location: (selG.rows[0] as any)?.location,
      persisted: (selG.rows[0] as any)?.location === testValC,
    };

    // ── Test H: Use execute with named params instead of positional ──
    const freshC = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const selH = await freshC.execute({
      sql: "SELECT location FROM artists WHERE id = $id",
      args: { $id: ARTIST_ID },
    });
    results.testH_named_params = {
      location: (selH.rows[0] as any)?.location,
      persisted: (selH.rows[0] as any)?.location === testValC,
    };

    // ── Test I: Different SQL entirely — use a subquery ──
    const freshD = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const selI = await freshD.execute({
      sql: "SELECT a.location FROM artists a WHERE a.id = ?",
      args: [ARTIST_ID],
    });
    results.testI_subquery = {
      location: (selI.rows[0] as any)?.location,
      persisted: (selI.rows[0] as any)?.location === testValC,
    };

    // ── Restore ──
    // (Don't restore — let's keep the test value to verify on next run)

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error), results },
      { status: 500 }
    );
  }
}
