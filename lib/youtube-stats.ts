const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeVideoStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  title: string;
  thumbnail: string;
}

export async function getVideoStats(videoId: string): Promise<YouTubeVideoStats | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${YOUTUBE_API_BASE}/videos?id=${videoId}&part=statistics,snippet&key=${apiKey}`
    );
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) return null;
    
    const item = data.items[0];
    const stats = item.statistics;
    const snippet = item.snippet;
    
    return {
      viewCount: parseInt(stats.viewCount || "0", 10),
      likeCount: parseInt(stats.likeCount || "0", 10),
      commentCount: parseInt(stats.commentCount || "0", 10),
      title: snippet.title || "",
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || "",
    };
  } catch {
    return null;
  }
}
