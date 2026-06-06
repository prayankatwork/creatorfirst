'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Video } from '@/types';
import { getYoutubeThumbnail, extractYoutubeId } from '@/lib/utils';
import {
  FiPlay,
  FiTrash2,
  FiSkipForward,
  FiX,
  FiPlus,
  FiList,
  FiSearch,
} from 'react-icons/fi';

interface VideoQueueProps {
  queue: Video[];
  currentVideoId?: string;
  isHost: boolean;
  onRemove: (videoId: string) => void;
  onReorder: (videoIds: string[]) => void;
  onSkip: () => void;
  onPlayNow: (videoId: string) => void;
  onClear: () => void;
  onAddToQueue: (data: { youtube_video_id: string }) => void;
}

export default function VideoQueue({
  queue,
  currentVideoId,
  isHost,
  onRemove,
  onReorder,
  onSkip,
  onPlayNow,
  onClear,
  onAddToQueue,
}: VideoQueueProps) {
  const [urlInput, setUrlInput] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const queuedVideos = queue.filter(v => v.status === 'queued');
  const currentVideo = queue.find(v => v.is_current || v.status === 'playing');

  const handleAddUrl = () => {
    const videoId = extractYoutubeId(urlInput);
    if (videoId) {
      onAddToQueue({ youtube_video_id: videoId });
      setUrlInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {/* Now Playing */}
        {currentVideo && (
          <div className="p-3 border-b border-surface-800/50">
            <p className="text-[10px] text-surface-500 uppercase tracking-wider font-medium mb-2">
              Now Playing
            </p>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-brand-500/10 border border-brand-500/20">
              <img
                src={getYoutubeThumbnail(currentVideo.youtube_video_id, 'mq')}
                alt=""
                className="w-10 h-7 rounded object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate text-surface-200">
                  {currentVideo.title || currentVideo.youtube_video_id}
                </p>
                <p className="text-[10px] text-surface-500">{currentVideo.channel_name}</p>
              </div>
              <FiPlay className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
            </div>
          </div>
        )}

        {/* Queue Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-surface-800/50">
          <div className="flex items-center gap-2">
            <FiList className="w-3.5 h-3.5 text-surface-400" />
            <span className="text-xs font-medium text-surface-300">
              Queue ({queuedVideos.length})
            </span>
          </div>
          {isHost && queuedVideos.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={onSkip}
                className="btn-ghost text-[10px] px-2 py-1"
              >
                <FiSkipForward className="w-3 h-3" />
                Skip
              </button>
              <button
                onClick={onClear}
                className="btn-ghost text-[10px] px-2 py-1 text-red-400 hover:text-red-300"
              >
                <FiX className="w-3 h-3" />
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Queue Items */}
        <div className="space-y-0.5 p-2">
          <AnimatePresence>
            {queuedVideos.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center mx-auto mb-2">
                  <FiList className="w-5 h-5 text-surface-500" />
                </div>
                <p className="text-xs text-surface-500">Queue is empty</p>
                <p className="text-[10px] text-surface-600">
                  {isHost ? 'Add videos to start the party' : 'Suggest a video!'}
                </p>
              </div>
            ) : (
              queuedVideos.map((video, index) => (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className={`flex items-center gap-2 p-2 rounded-lg transition-all group ${
                    dragIndex === index
                      ? 'bg-brand-500/20 ring-1 ring-brand-500/30'
                      : 'hover:bg-surface-800/50'
                  }`}
                  draggable={isHost}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragIndex(index);
                  }}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== index) {
                      const items = [...queuedVideos];
                      const [moved] = items.splice(dragIndex, 1);
                      items.splice(index, 0, moved);
                      onReorder(items.map(v => v.id));
                    }
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <span className="text-[10px] text-surface-600 font-mono w-4 text-right">
                    {index + 1}
                  </span>
                  <img
                    src={getYoutubeThumbnail(video.youtube_video_id, 'default')}
                    alt=""
                    className="w-10 h-7 rounded object-cover flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate text-surface-300">
                      {video.title || video.youtube_video_id}
                    </p>
                    <p className="text-[10px] text-surface-500">{video.channel_name}</p>
                  </div>
                  {isHost && (
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        onClick={() => onPlayNow(video.id)}
                        className="p-1 rounded hover:bg-surface-700 text-surface-500 hover:text-brand-400 transition-colors"
                        title="Play now"
                      >
                        <FiPlay className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onRemove(video.id)}
                        className="p-1 rounded hover:bg-surface-700 text-surface-500 hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <FiTrash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add to queue (host only) */}
      {isHost && (
        <div className="border-t border-surface-800/50 p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="YouTube URL to queue..."
              className="input-field text-sm h-9 flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            />
            <button
              onClick={handleAddUrl}
              disabled={!extractYoutubeId(urlInput)}
              className="btn-primary text-xs h-9 px-3"
            >
              <FiPlus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
