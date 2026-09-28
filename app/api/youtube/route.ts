import { NextRequest, NextResponse } from 'next/server';
import { parseISO8601Duration, parseYouTubeChapters } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

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
    const url = `${YOUTUBE_API_BASE}/videos?id=${encodeURIComponent(videoId)}&part=snippet,contentDetails,statistics,topicDetails&key=${apiKey}`;
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
    });
  } catch (error) {
    console.error('YouTube API error:', error);
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 });
  }
}
