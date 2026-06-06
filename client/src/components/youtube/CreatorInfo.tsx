'use client';

import { FiYoutube, FiExternalLink } from 'react-icons/fi';

interface CreatorInfoProps {
  currentVideo: {
    video_id: string;
    title: string;
    channel_name: string;
    channel_avatar: string;
  } | null;
}

export default function CreatorInfo({ currentVideo }: CreatorInfoProps) {
  if (!currentVideo || !currentVideo.video_id) {
    return (
      <div className="px-3 py-2.5">
        <p className="text-xs text-surface-500">No video playing</p>
      </div>
    );
  }

  const youtubeUrl = `https://youtube.com/watch?v=${currentVideo.video_id}`;

  return (
    <div className="px-3 py-2.5 flex items-center gap-3">
      {/* Channel avatar */}
      <div className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {currentVideo.channel_avatar ? (
          <img
            src={currentVideo.channel_avatar}
            alt={currentVideo.channel_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <FiYoutube className="w-4 h-4 text-surface-400" />
        )}
      </div>

      {/* Video info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-surface-200">
          {currentVideo.title || 'Untitled Video'}
        </p>
        <p className="text-xs text-surface-500 truncate">
          {currentVideo.channel_name || 'Unknown Channel'}
        </p>
      </div>

      {/* Watch on YouTube button */}
      <a
        href={youtubeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 hover:border-red-600/50 text-red-400 text-xs font-medium transition-all whitespace-nowrap"
      >
        <FiYoutube className="w-3.5 h-3.5" />
        Watch on YouTube
        <FiExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
