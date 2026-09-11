/**
 * YouTube IFrame API wrapper for audio playback.
 * Creates a hidden iframe and controls playback via the YouTube API.
 */

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement, config: YTPlayerConfig) => YTPlayerInstance;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerConfig {
  videoId: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
    onError?: (event: { data: number }) => void;
  };
}

interface YTPlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getVolume(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

export interface YouTubePlayerEvents {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onError?: (error: number) => void;
}

// YouTube Player States
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

let apiLoading = false;
let apiLoaded = false;
let apiReadyPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiLoaded) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    if (window.YT && window.YT.Player) {
      apiLoaded = true;
      resolve();
      return;
    }

    apiLoading = true;

    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      apiLoading = false;
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return apiReadyPromise;
}

export class YouTubePlayerManager {
  private player: YTPlayerInstance | null = null;
  private iframeContainer: HTMLDivElement | null = null;
  private events: YouTubePlayerEvents = {};
  private currentVideoId: string | null = null;
  private ready = false;

  async init(videoId: string, events: YouTubePlayerEvents = {}): Promise<void> {
    this.events = events;
    this.currentVideoId = videoId;

    await loadYouTubeAPI();

    if (!window.YT || !window.YT.Player) {
      console.error("YouTube IFrame API not loaded");
      return;
    }

    // Create hidden container for iframe
    if (!this.iframeContainer) {
      this.iframeContainer = document.createElement("div");
      this.iframeContainer.style.position = "fixed";
      this.iframeContainer.style.bottom = "0";
      this.iframeContainer.style.left = "0";
      this.iframeContainer.style.width = "1px";
      this.iframeContainer.style.height = "1px";
      this.iframeContainer.style.opacity = "0";
      this.iframeContainer.style.pointerEvents = "none";
      this.iframeContainer.style.zIndex = "-1";
      document.body.appendChild(this.iframeContainer);
    }

    // Destroy existing player
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }

    this.ready = false;

    this.player = new window.YT.Player(this.iframeContainer, {
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
      },
      events: {
        onReady: () => {
          this.ready = true;
          this.events.onReady?.();
        },
        onStateChange: (event) => {
          this.events.onStateChange?.(event.data);
        },
        onError: (event) => {
          this.events.onError?.(event.data);
        },
      },
    });
  }

  async loadVideo(videoId: string): Promise<void> {
    if (videoId === this.currentVideoId && this.player && this.ready) {
      return;
    }

    await this.init(videoId, this.events);
  }

  play(): void {
    if (this.player && this.ready) {
      this.player.playVideo();
    }
  }

  pause(): void {
    if (this.player && this.ready) {
      this.player.pauseVideo();
    }
  }

  seek(seconds: number): void {
    if (this.player && this.ready) {
      this.player.seekTo(seconds, true);
    }
  }

  setVolume(volume: number): void {
    if (this.player && this.ready) {
      // YouTube uses 0-100, we use 0-1
      this.player.setVolume(Math.round(volume * 100));
    }
  }

  getVolume(): number {
    if (this.player && this.ready) {
      return this.player.getVolume() / 100;
    }
    return 0.85;
  }

  getCurrentTime(): number {
    if (this.player && this.ready) {
      return this.player.getCurrentTime();
    }
    return 0;
  }

  getDuration(): number {
    if (this.player && this.ready) {
      return this.player.getDuration();
    }
    return 0;
  }

  getState(): number {
    if (this.player && this.ready) {
      return this.player.getPlayerState();
    }
    return YT_STATE.UNSTARTED;
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    if (this.iframeContainer) {
      this.iframeContainer.remove();
      this.iframeContainer = null;
    }
    this.ready = false;
    this.currentVideoId = null;
  }
}

// Singleton instance for global use
let globalInstance: YouTubePlayerManager | null = null;

export function getYouTubePlayer(): YouTubePlayerManager {
  if (!globalInstance) {
    globalInstance = new YouTubePlayerManager();
  }
  return globalInstance;
}

export function destroyYouTubePlayer(): void {
  if (globalInstance) {
    globalInstance.destroy();
    globalInstance = null;
  }
}
