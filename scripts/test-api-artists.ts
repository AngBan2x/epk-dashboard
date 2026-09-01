async function test() {
  const Database = (await import("better-sqlite3")).default;
  const db = new Database("data/music_catalog.db");
  const artist = db.prepare("SELECT id, name FROM artists LIMIT 1").get() as any;

  if (!artist) {
    console.log("No artists in DB");
    db.close();
    return;
  }

  const session = Buffer.from(JSON.stringify({ userId: "admin-1", role: "admin" })).toString("base64");

  console.log(`Testing PUT /api/artists?id=${artist.id}`);
  console.log(`Current name: ${artist.name}`);

  try {
    const res = await fetch(`http://localhost:3000/api/artists?id=${artist.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_session=${session}`,
      },
      body: JSON.stringify({
        name: artist.name,
        biography: "Test update",
      }),
    });

    console.log(`Status: ${res.status}`);
    console.log(`Headers:`, Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log(`Body: ${text}`);

    try {
      console.log(`Parsed:`, JSON.parse(text));
    } catch {
      console.log("(Not JSON)");
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }

  db.close();
}

test();
