import path from "path";

// Set up DB path before importing db
const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

async function main() {
  console.log("=== Test: updateArtist ===\n");

  // Dynamic import to ensure DB_PATH is set
  const { getAllArtists, updateArtist, getArtistById } = await import("../lib/db");

  // 1. Find Angel Bandres
  const artists = await getAllArtists();
  const angel = artists.find(a => a.name === "Angel Bandres");
  if (!angel) {
    console.log("❌ Angel Bandres not found in DB");
    console.log("Available artists:", artists.map(a => a.name));
    return;
  }
  console.log("✅ Found Angel Bandres:", angel.id);
  console.log("   Before:", {
    name: angel.name,
    location: angel.location,
    monthly_listeners: angel.monthly_listeners,
    genre: angel.genre,
  });

  // 2. Update with test data
  console.log("\nUpdating with test data...");
  const updated = await updateArtist(angel.id, {
    name: "Angel Bandres",
    location: "Naguanagua, Venezuela",
    monthly_listeners: 5,
    genre: "Rock Alternativo",
  });

  if (!updated) {
    console.log("❌ updateArtist returned null");
    return;
  }

  console.log("✅ Update successful!");
  console.log("   After:", {
    name: updated.name,
    location: updated.location,
    monthly_listeners: updated.monthly_listeners,
    genre: updated.genre,
  });

  // 3. Verify by reading again
  const verify = await getArtistById(angel.id);
  console.log("\n✅ Verification read:", {
    name: verify?.name,
    location: verify?.location,
    monthly_listeners: verify?.monthly_listeners,
  });

  // 4. Restore original data
  console.log("\nRestoring original data...");
  await updateArtist(angel.id, {
    name: "Angel Bandres",
    location: "Madrid, España",
    monthly_listeners: 15000,
    genre: "Rock Alternativo",
  });
  console.log("✅ Restored!");
}

main().catch(console.error);
