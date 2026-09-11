import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { parseISO8601Duration } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

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
    const youtube = google.youtube({ version: 'v3', auth: apiKey });
    const res = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics', 'topicDetails'],
      id: [videoId],
    });

    const video = res.data.items?.[0];
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const durationSeconds = parseISO8601Duration(video.contentDetails?.duration || 'PT0S');

    return NextResponse.json({
      id: video.id!,
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
    });
  } catch (error) {
    console.error('YouTube API error:', error);
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 });
  }
}
