'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { RoomState } from '@/types';
import { FiPlay, FiPause, FiRefreshCw } from 'react-icons/fi';

interface YouTubePlayerProps {
  roomState: RoomState;
  isHost: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (timestamp: number) => void;
  onChangeVideo: (data: { youtube_video_id: string }) => void;
  onSync: () => void;
  isFullscreen: boolean;
  onVideoEnded?: () => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export default function YouTubePlayer({
  roomState,
  isHost,
  onPlay,
  onPause,
  onSeek,
  onChangeVideo,
  onSync,
  isFullscreen,
  onVideoEnded,
}: YouTubePlayerProps) {
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const isHostRef = useRef(isHost);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSeekingRef = useRef(false);

  isHostRef.current = isHost;

  // Load YouTube IFrame API
  useEffect(() => {
    if (!document.querySelector('#youtube-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Initialize player when API is ready
  useEffect(() => {
    const onReady = () => {
      setIsPlayerReady(true);
    };

    window.onYouTubeIframeAPIReady = () => {
      onReady();
    };

    // If API already loaded
    if (window.YT?.Player) {
      onReady();
    }
  }, []);

  // Create/destroy player
  useEffect(() => {
    if (!isPlayerReady || !playerContainerRef.current) return;

    if (playerRef.current) {
      playerRef.current.destroy();
    }

    const videoId = roomState.playback?.youtube_video_id || '';

    playerRef.current = new window.YT.Player(playerContainerRef.current, {
      height: '100%',
      width: '100%',
      videoId,
      playerVars: {
        autoplay: 0,
        controls: isHost ? 1 : 0,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        iv_load_policy: 3,
        cc_load_policy: 0,
        fs: 0,
        playsinline: 1,
      },
      events: {
        onReady: (event: any) => {
          if (roomState.playback?.timestamp) {
            event.target.seekTo(roomState.playback.timestamp, true);
          }
          if (roomState.playback?.playback_state === 'playing') {
            event.target.playVideo();
          }
        },
        onStateChange: (event: any) => {
          if (!isHostRef.current) return;

          const state = event.data;
          if (isSeekingRef.current) return;

          if (state === 1) {
            // Playing
            onPlay();
          } else if (state === 2) {
            // Paused
            onPause();
          } else if (state === 0) {
            // Ended - auto play next video in queue
            if (isHostRef.current && onVideoEnded) {
              onVideoEnded();
            } else {
              onPause();
            }
          }
        },
      },
    });

    setCurrentVideoId(videoId);

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [isPlayerReady, roomState.playback?.youtube_video_id]);

  // Sync timestamp changes from host
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;
    
    const sync = roomState.playback;
    if (!sync) return;

    if (isHostRef.current) return;

    const currentPlayerState = playerRef.current.getPlayerState();
    const currentTime = playerRef.current.getCurrentTime();
    const timeDiff = Math.abs(currentTime - sync.timestamp);

    // Only seek if the difference is more than 2 seconds
    if (timeDiff > 2 && sync.timestamp > 0) {
      playerRef.current.seekTo(sync.timestamp, true);
    }

    if (sync.playback_state === 'playing' && currentPlayerState !== 1) {
      playerRef.current.playVideo();
    } else if (sync.playback_state === 'paused' && currentPlayerState === 1) {
      playerRef.current.pauseVideo();
    }
  }, [roomState.playback?.timestamp, roomState.playback?.playback_state]);

  // Sync interval (for continuous sync during playback)
  useEffect(() => {
    if (!isHostRef.current) return;

    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        try {
          const time = playerRef.current.getCurrentTime();
          onSeek(time);
        } catch {}
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleVideoChange = () => {
    // Handled by parent via VideoInput
  };

  if (!roomState.playback?.youtube_video_id) {
    return (
      <div className="aspect-video bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-3">
            <FiPlay className="w-8 h-8 text-surface-500" />
          </div>
          <p className="text-surface-400 text-sm">Waiting for host to play a video...</p>
          {isHost && (
            <p className="text-surface-500 text-xs mt-1">Paste a YouTube URL below to get started</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={playerContainerRef}
        className="aspect-video bg-black"
        style={{ pointerEvents: isHost ? 'auto' : 'none' }}
      />

      {/* Sync indicator */}
      {isSyncing && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-900/80 backdrop-blur-sm">
          <FiRefreshCw className="w-3 h-3 text-brand-400 animate-spin" />
          <span className="text-xs text-brand-300">Syncing...</span>
        </div>
      )}

      {/* Connection status */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-900/80 backdrop-blur-sm">
        <div className={`w-1.5 h-1.5 rounded-full ${roomState.playback?.playback_state === 'playing' ? 'bg-green-400' : 'bg-yellow-400'}`} />
        <span className="text-xs text-surface-400">
          {roomState.playback?.playback_state === 'playing' ? 'Live' : 'Paused'}
        </span>
      </div>
    </div>
  );
}
