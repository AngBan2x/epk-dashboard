#!/usr/bin/env tsx
/**
 * Diagnostic script for testing artist update on production
 * Usage: npx tsx scripts/test-update-diagnostic.ts <artist_id>
 */

const PROD_URL = "https://epk-dashboard.vercel.app";

async function main() {
  const artistId = process.argv[2];

  if (!artistId) {
    console.log("Usage: npx tsx scripts/test-update-diagnostic.ts <artist_id>");
    console.log("\nFetching all artists first...\n");

    const res = await fetch(`${PROD_URL}/api/artists`);
    const data = await res.json();

    if (!data.artists || data.artists.length === 0) {
      console.log("No artists found or error:", data);
      return;
    }

    console.log("Available artists:\n");
    for (const a of data.artists) {
      console.log(`  ID: ${a.id}`);
      console.log(`  Name: ${a.name}`);
      console.log(`  Location: ${a.location}`);
      console.log(`  Genre: ${a.genre}`);
      console.log(`  Monthly Listeners: ${a.monthly_listeners}`);
      console.log("");
    }

    console.log("Run again with: npx tsx scripts/test-update-diagnostic.ts <artist_id>");
    return;
  }

  // Create admin session cookie
  const session = Buffer.from(JSON.stringify({ userId: "admin-1", role: "admin" })).toString("base64");

  console.log(`Testing PUT /api/artists/${artistId}`);
  console.log("─".repeat(50));

  // First: read current state
  console.log("\n1. Reading current artist state...");
  const getRes = await fetch(`${PROD_URL}/api/artists`);
  const getData = await getRes.json();
  const artist = getData.artists?.find((a: { id: string }) => a.id === artistId);

  if (!artist) {
    console.error("Artist not found! Available IDs:", getData.artists?.map((a: { id: string }) => a.id));
    return;
  }

  console.log("Current state:");
  console.log(`  name: "${artist.name}"`);
  console.log(`  genre: "${artist.genre}"`);
  console.log(`  location: "${artist.location}"`);
  console.log(`  biography: "${(artist.biography || "").substring(0, 50)}..."`);
  console.log(`  monthly_listeners: ${artist.monthly_listeners}`);

  // Second: update with test data
  const testLocation = `TEST-${Date.now()}`;
  console.log(`\n2. Sending PUT with location="${testLocation}"...`);

  const putRes = await fetch(`${PROD_URL}/api/artists/${artistId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `auth_session=${session}`,
    },
    body: JSON.stringify({
      name: artist.name,
      genre: artist.genre,
      location: testLocation,
      biography: artist.biography,
      press_text: artist.press_text,
      press_highlights: artist.press_highlights || [],
      monthly_listeners: artist.monthly_listeners,
    }),
  });

  console.log(`PUT Status: ${putRes.status} ${putRes.statusText}`);
  const putBody = await putRes.text();
  console.log(`PUT Response: ${putBody.substring(0, 300)}`);

  // Third: re-read to verify persistence
  console.log("\n3. Re-reading artist after update...");
  await new Promise(r => setTimeout(r, 500));
  const verifyRes = await fetch(`${PROD_URL}/api/artists`);
  const verifyData = await verifyRes.json();
  const verifyArtist = verifyData.artists?.find((a: { id: string }) => a.id === artistId);

  if (verifyArtist) {
    console.log("After update:");
    console.log(`  location: "${verifyArtist.location}"`);
    const persisted = verifyArtist.location === testLocation;
    console.log(`\n  ${persisted ? "✅ PERSISTED" : "❌ NOT PERSISTED"}`);
    if (!persisted) {
      console.log(`  Expected: "${testLocation}"`);
      console.log(`  Got: "${verifyArtist.location}"`);
    }
  }

  // Fourth: restore original
  console.log("\n4. Restoring original location...");
  const restoreRes = await fetch(`${PROD_URL}/api/artists/${artistId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `auth_session=${session}`,
    },
    body: JSON.stringify({
      name: artist.name,
      genre: artist.genre,
      location: artist.location,
      biography: artist.biography,
      press_text: artist.press_text,
      press_highlights: artist.press_highlights || [],
      monthly_listeners: artist.monthly_listeners,
    }),
  });
  console.log(`Restore status: ${restoreRes.status}`);
}

main().catch(console.error);
