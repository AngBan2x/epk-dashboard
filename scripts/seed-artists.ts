#!/usr/bin/env tsx

import { config } from "dotenv";
config({ path: ".env.local" });

import { createArtist, getArtistByName } from "../lib/db";

const artists = [
  {
    name: "Queen",
    biography: "Queen es una banda británica de rock formada en Londres en 1970. Con Freddie Mercury como vocalista, Brian May en guitarra, Roger Taylor en batería y John Deacon en bajo, la banda se convirtió en una de las más influyentes e innovadoras de la historia del rock. Su sonido fusionaba rock, ópera, music hall y pop, creando himnos atemporales como 'Bohemian Rhapsody', 'We Will Rock You' y 'Don't Stop Me Now'.",
    pressText: "Queen es considerada una de las mejores bandas de rock de todos los tiempos. Han vendido más de 300 millones de discos en todo el mundo y fueron incluidos en el Rock and Roll Hall of Fame en 2001. Su actuación en Live Aid 1985 es ampliamente considerada como una de las mejores presentaciones en vivo de la historia.",
    pressHighlights: [
      "Rock and Roll Hall of Fame (2001)",
      "Grammy Lifetime Achievement Award (2018)",
      "Mejor actuación en vivo de la historia - Live Aid (1985)",
      "Más de 300 millones de discos vendidos",
      "Band sonora de 'Bohemian Rhapsody' - Premio Oscar (2019)"
    ],
    genre: "Rock / Pop Rock / Opera Rock",
    location: "Londres, Reino Unido",
    monthly_listeners: 45000000,
  },
  {
    name: "Nirvana",
    biography: "Nirvana fue una banda estadounidense de grunge formada en Aberdeen, Washington, en 1987 por Kurt Cobain (voz/guitarra) y Krist Novoselic (bajo), con Dave Grohl uniéndose como baterista en 1990. Su álbum 'Nevermind' (1991) catapultó al grunge al mainstream y definió una generación. Con himnos como 'Smells Like Teen Spirit', 'Come As You Are' y 'Lithium', Nirvana cambió el panorama musical de los 90.",
    pressText: "Nirvana es la banda insignia del movimiento grunge de Seattle. A pesar de su corta carrera (1987-1994), su impacto cultural es inmenso. 'Nevermind' ha vendido más de 30 millones de copias en todo el mundo. Kurt Cobain se convirtió en un ícono generacional. La banda fue incluida en el Rock and Roll Hall of Fame en 2014.",
    pressHighlights: [
      "Rock and Roll Hall of Fame (2014)",
      "'Nevermind' - 30+ millones de copias vendidas",
      "Definieron el movimiento grunge de Seattle",
      "Grammy Lifetime Achievement Award (2023)",
      "Influencia duradera en rock alternativo y punk"
    ],
    genre: "Grunge / Alternative Rock",
    location: "Aberdeen, Washington, EE. UU.",
    monthly_listeners: 38000000,
  },
  {
    name: "The Weeknd",
    biography: "Abel Tesfaye, conocido profesionalmente como The Weeknd, es un cantautor y productor canadiense nacido en Toronto en 1990. Comenzó subiendo música anónimamente a YouTube en 2010, y su mixtape 'House of Balloons' (2011) recibió aclamación crítica. Su sonido fusiona R&B contemporáneo, pop, synthwave y new wave. Ha ganado 4 premios Grammy y múltiples Billboard Music Awards.",
    pressText: "The Weeknd es uno de los artistas más exitosos de la década de 2010 y 2020. 'Blinding Lights' rompió récords como la canción con más semanas en el Top 10 del Billboard Hot 100. Su álbum 'After Hours' (2020) y 'Dawn FM' (2022) recibieron aclamación universal. Su Super Bowl LV Halftime Show (2021) fue visto por más de 96 millones de espectadores.",
    pressHighlights: [
      "4 premios Grammy, 19 Billboard Music Awards",
      "'Blinding Lights' - Récord Billboard Hot 100 (90 semanas en Top 10)",
      "Super Bowl LV Halftime Show (2021)",
      "Artista #1 global en Spotify (2023)",
      "Más de 100 millones de oyentes mensuales en Spotify"
    ],
    genre: "R&B / Pop / Synthwave",
    location: "Toronto, Canadá",
    monthly_listeners: 110000000,
  },
  {
    name: "Eagles",
    biography: "Eagles es una banda estadounidense de rock formada en Los Ángeles en 1971. Con Glenn Frey, Don Henley, Bernie Leadon y Randy Meisner como miembros fundadores, la banda definió el sonido del soft rock y country rock de los 70. Su álbum 'Hotel California' (1976) es uno de los más vendidos de la historia. La banda ha vendido más de 200 millones de discos mundialmente.",
    pressText: "Eagles es una de las bandas más vendidas de la historia de la música estadounidense. 'Hotel California' ganó el Grammy a Grabación del Año (1978). La banda fue incluida en el Rock and Roll Hall of Fame en 1998. Su armonía vocal característica y composición sofisticada han influenciado a generaciones de músicos.",
    pressHighlights: [
      "Rock and Roll Hall of Fame (1998)",
      "6 premios Grammy",
      "'Hotel California' - Grabación del Año Grammy (1978)",
      "Más de 200 millones de discos vendidos",
      "Greatest Hits 1971-1975 - Álbum más vendido en EE.UU. (38M)"
    ],
    genre: "Soft Rock / Country Rock",
    location: "Los Ángeles, California, EE. UU.",
    monthly_listeners: 25000000,
  },
  {
    name: "Ed Sheeran",
    biography: "Edward Christopher Sheeran es un cantautor británico nacido en Halifax en 1991. Comenzó tocando en pequeños locales y subiendo música a internet. Su álbum debut '+' (2011) fue un éxito masivo. Con su característico estilo de loop station en vivo y composición sincera, se ha convertido en uno de los artistas más exitosos de la era del streaming. Ha ganado 4 premios Grammy.",
    pressText: "Ed Sheeran es el artista más escuchado de la historia en Spotify. 'Shape of You' fue la canción más streamed de la década de 2010. Sus giras '÷ Tour' (2017-2019) y 'Mathematics Tour' (2022-2025) rompieron récords de asistencia. Es conocido por su filantropía y composiciones para otros artistas (Justin Bieber, Taylor Swift, etc.).",
    pressHighlights: [
      "4 premios Grammy, 6 Brit Awards",
      "Artista más escuchado en la historia de Spotify",
      "'Shape of You' - Canción más streamed de la década (2010s)",
      "Gira '÷ Tour' - Gira más taquillera de un solista",
      "MBE por servicios a la música y caridad (2017)"
    ],
    genre: "Pop / Folk Pop / Singer-Songwriter",
    location: "Halifax, Reino Unido",
    monthly_listeners: 95000000,
  },
  {
    name: "Kate Bush",
    biography: "Catherine Bush es una cantautora, productora y bailarina británica nacida en Bexleyheath en 1958. Firmó con EMI a los 16 años y lanzó su debut 'The Kick Inside' (1978) con 'Wuthering Heights', convirtiéndose en la primera mujer en alcanzar el #1 en UK con una canción propia. Su arte experimental, voces teatrales y producción innovadora la han convertido en una de las artistas más influyentes de la historia.",
    pressText: "Kate Bush es considerada una pionera del art pop y la música experimental. Su álbum 'Hounds of Love' (1985) es aclamado como una obra maestra. 'Running Up That Hill' resurgió en 2022 gracias a 'Stranger Things', alcanzando #1 global 37 años después. Fue incluida en el Rock and Roll Hall of Fame en 2023.",
    pressHighlights: [
      "Rock and Roll Hall of Fame (2023)",
      "Primera mujer en UK #1 con canción propia ('Wuthering Heights')",
      "'Running Up That Hill' - #1 global 37 años después (2022)",
      "Ivor Novello Award por contribución excepcional a la música británica",
      "Influencia citada por Björk, Tori Amos, Florence Welch, Big Boi, OutKast"
    ],
    genre: "Art Pop / Experimental / Progressive Pop",
    location: "Bexleyheath, Reino Unido",
    monthly_listeners: 18000000,
  },
];

console.log("🌱 Sembrando artistas...\n");

for (const artistData of artists) {
  const existing = getArtistByName(artistData.name);
  if (existing) {
    console.log(`  ⏭️  ${artistData.name} ya existe, saltando...`);
    continue;
  }
  
  const artist = createArtist(artistData);
  console.log(`  ✅ Creado: ${artist.name} (${artist.id})`);
}

console.log("\n✅ Seed de artistas completado");