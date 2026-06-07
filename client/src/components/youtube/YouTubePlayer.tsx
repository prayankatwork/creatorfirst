'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '@/types';
import { FiWifi, FiWifiOff, FiRefreshCw } from 'react-icons/fi';

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

type SyncState = 'connecting' | 'synced' | 'syncing' | 'drifted';

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
  const [syncState, setSyncState] = useState<SyncState>('connecting');
  const [syncOffset, setSyncOffset] = useState<number>(0);
  const isHostRef = useRef(isHost);
  const roomStateRef = useRef(roomState);
  const onSeekRef = useRef(onSeek);

  isHostRef.current = isHost;
  roomStateRef.current = roomState;
  onSeekRef.current = onSeek;

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
    window.onYouTubeIframeAPIReady = () => setIsPlayerReady(true);
    if (window.YT?.Player) setIsPlayerReady(true);
  }, []);

  // Create/destroy player
  useEffect(() => {
    if (!isPlayerReady || !playerContainerRef.current) return;

    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
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
          if (state === 1) onPlay();
          else if (state === 2) onPause();
          else if (state === 0) {
            if (isHostRef.current && onVideoEnded) onVideoEnded();
            else onPause();
          }
        },
      },
    });

    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, [isPlayerReady, roomState.playback?.youtube_video_id]);

  // ── HOST: Send precise timestamp every 1 second ──
  useEffect(() => {
    if (!isHost || !isPlayerReady) return;

    const interval = setInterval(() => {
      if (playerRef.current?.getCurrentTime) {
        try {
          const time = playerRef.current.getCurrentTime();
          onSeekRef.current(time);
        } catch {}
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isHost, isPlayerReady]);

  // ── VIEWER: Continuous sync loop every 500ms ──
  useEffect(() => {
    if (isHost || !isPlayerReady || !playerRef.current) return;

    // Initial short delay to let player initialize
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        if (!playerRef.current?.getCurrentTime) return;

        try {
          // Use refs to always read latest values (avoids stale closure)
          const sync = roomStateRef.current.playback;
          if (!sync) return;

          const currentTime = playerRef.current.getCurrentTime();
          const currentState = playerRef.current.getPlayerState();
          const timeDiff = Math.abs(currentTime - sync.timestamp);

          setSyncOffset(Math.round(timeDiff * 100) / 100);

          // Sync playback state (play/pause)
          if (sync.playback_state === 'playing' && currentState !== 1) {
            setSyncState('syncing');
            playerRef.current.playVideo();
          } else if (sync.playback_state === 'paused' && currentState === 1) {
            setSyncState('syncing');
            playerRef.current.pauseVideo();
          }

          // Sync position — very aggressive correction for extreme sync
          if (sync.timestamp > 0) {
            if (timeDiff > 0.3) {
              setSyncState('syncing');
              playerRef.current.seekTo(sync.timestamp, true);
            } else if (timeDiff > 0.1) {
              setSyncState('drifted');
            } else {
              setSyncState('synced');
            }
          } else {
            setSyncState('synced');
          }
        } catch {
          setSyncState('connecting');
        }
      }, 500);

      return () => clearInterval(interval);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isHost, isPlayerReady]);

  if (!roomState.playback?.youtube_video_id) {
    return (
      <div className="aspect-video bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-3">
            <FiRefreshCw className="w-8 h-8 text-surface-500" />
          </div>
          <p className="text-surface-400 text-sm">Waiting for host to play a video...</p>
          {isHost && (
            <p className="text-surface-500 text-xs mt-1">Paste a YouTube URL below to get started</p>
          )}
        </div>
      </div>
    );
  }

  // ── Sync meter colors ──
  const syncColor =
    syncState === 'synced' ? 'bg-green-400' :
    syncState === 'drifted' ? 'bg-yellow-400' :
    syncState === 'syncing' ? 'bg-brand-400' :
    'bg-red-400';

  const syncLabel =
    syncState === 'synced' ? `${syncOffset}s` :
    syncState === 'drifted' ? `${syncOffset}s` :
    syncState === 'syncing' ? 'Syncing...' :
    'Connecting...';

  const syncIcon =
    syncState === 'synced' ? null :
    syncState === 'drifted' ? null :
    <FiRefreshCw className="w-3 h-3 animate-spin" />;

  return (
    <div className="relative">
      <div
        ref={playerContainerRef}
        className="aspect-video bg-black"
        style={{ pointerEvents: isHost ? 'auto' : 'none' }}
      />

      {/* Sync meter — top-right shows exact sync status */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-950/80 backdrop-blur-sm border border-surface-700/50">
        {syncIcon}
        <div className={`w-2 h-2 rounded-full ${syncColor} transition-colors duration-300`} />
        <span className={`text-xs font-medium tabular-nums ${
          syncState === 'synced' ? 'text-green-300' :
          syncState === 'drifted' ? 'text-yellow-300' :
          syncState === 'syncing' ? 'text-brand-300' :
          'text-red-300'
        }`}>
          {syncLabel}
        </span>
        {/* Sync offset bar */}
        {!isHost && (
          <div className="hidden sm:flex items-center gap-1 ml-1">
            <div className="w-12 h-1.5 rounded-full bg-surface-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  syncOffset <= 0.1 ? 'bg-green-400' :
                  syncOffset <= 0.3 ? 'bg-yellow-400' :
                  'bg-red-400'
                }`}
                style={{ width: `${Math.min(syncOffset * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Playback status — bottom-left */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-950/80 backdrop-blur-sm border border-surface-700/50">
        {roomState.playback?.playback_state === 'playing' ? (
          <FiWifi className="w-3 h-3 text-green-400" />
        ) : (
          <FiWifiOff className="w-3 h-3 text-yellow-400" />
        )}
        <span className="text-xs text-surface-400">
          {roomState.playback?.playback_state === 'playing' ? 'Live' : 'Paused'}
        </span>
        {isHost && (
          <span className="text-[10px] text-brand-400 font-medium ml-1">HOST</span>
        )}
      </div>
    </div>
  );
}
