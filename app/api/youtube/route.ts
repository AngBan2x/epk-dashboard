import { NextRequest, NextResponse } from 'next/server';
import {
  isVideoEmbedAllowed,
  needsMadeForKidsDisclosure,
  parseISO8601Duration,
  parseYouTubeChapters,
} from '@/lib/youtube';

export const dynamic = 'force-dynamic';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * RC.32 · agente H — `part=status` estaba **ausente** y sin él no había forma de
 * leer `embeddable`, `privacyStatus` ni `madeForKids`. No es cosmético: las
 * YouTube API Services Developer Policies exigen comprobar el flag **Made For
 * Kids** en cada vídeo embebido, y este proyecto embebe en un iframe 1×1 con
 * `opacity:0` y `zIndex:-1` (`lib/youtube-player.ts:118-148`, con `disablekb:1`,
 * `controls:0`, `modestbranding:1`) donde el aviso del reproductor no se ve. En
 * todo el repo no había ni un `madeForKids`.
 *
 * El dato se expone aunque la UI todavía no lo use: `embedAllowed` y
 * `madeForKidsDisclosureRequired` son derivados, para que quien consuma esto no
 * tenga que recalcularlo, y la decisión de qué hacer sigue SIN tomar y
 * documentada aquí en vez de cerrada en silencio.
 */
const VIDEO_PARTS = 'snippet,contentDetails,statistics,topicDetails,status';

interface YouTubeVideoResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: Record<string, unknown>;
      publishedAt?: string;
      channelTitle?: string;
      tags?: string[];
    };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string };
    topicDetails?: { topicCategories?: string[] };
    status?: {
      uploadStatus?: string;
      privacyStatus?: string;
      embeddable?: boolean;
      license?: string;
      publicStatsViewable?: boolean;
      madeForKids?: boolean;
      selfDeclaredMadeForKids?: boolean;
    };
  }>;
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('id');
  if (!videoId) {
    return NextResponse.json({ error: 'Video ID required' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 503 });
  }

  try {
    const url = `${YOUTUBE_API_BASE}/videos?id=${encodeURIComponent(videoId)}&part=${VIDEO_PARTS}&key=${encodeURIComponent(apiKey)}`;
    const upstream = await fetch(url, { next: { revalidate: 300 } });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'YouTube API error' }, { status: upstream.status });
    }

    const data = (await upstream.json()) as YouTubeVideoResponse;
    const video = data.items?.[0];
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const durationSeconds = parseISO8601Duration(video.contentDetails?.duration || 'PT0S');
    const chapters = parseYouTubeChapters(video.snippet?.description || '', durationSeconds);

    const embeddable = video.status?.embeddable ?? null;
    const privacyStatus = video.status?.privacyStatus ?? null;
    const madeForKids = video.status?.madeForKids ?? null;
    const selfDeclaredMadeForKids = video.status?.selfDeclaredMadeForKids ?? null;

    return NextResponse.json({
      id: video.id ?? videoId,
      title: video.snippet?.title || '',
      description: video.snippet?.description || '',
      duration: video.contentDetails?.duration || 'PT0S',
      durationSeconds,
      thumbnails: video.snippet?.thumbnails || {},
      publishedAt: video.snippet?.publishedAt || '',
      channelTitle: video.snippet?.channelTitle || '',
      tags: video.snippet?.tags || [],
      viewCount: video.statistics?.viewCount || '0',
      likeCount: video.statistics?.likeCount || '0',
      topicCategories: video.topicDetails?.topicCategories || [],
      chapters,
      // `part=status`. `null` = YouTube no lo mandó en esta respuesta, que NO es
      // lo mismo que `false`.
      uploadStatus: video.status?.uploadStatus ?? null,
      privacyStatus,
      embeddable,
      license: video.status?.license ?? null,
      publicStatsViewable: video.status?.publicStatsViewable ?? null,
      madeForKids,
      selfDeclaredMadeForKids,
      embedAllowed: isVideoEmbedAllowed({ embeddable, privacyStatus }),
      madeForKidsDisclosureRequired: needsMadeForKidsDisclosure({
        madeForKids,
        selfDeclaredMadeForKids,
      }),
    });
  } catch (error) {
    console.error('YouTube API error:', error);
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 });
  }
}
