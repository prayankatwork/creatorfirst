'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { extractYoutubeId, getYoutubeThumbnail } from '@/lib/utils';
import { FiPlus, FiList, FiX, FiYoutube, FiSearch } from 'react-icons/fi';

interface VideoInputProps {
  onAdd: (url: string) => void;
  onQueueAdd: (url: string) => void;
}

export default function VideoInput({ onAdd, onQueueAdd }: VideoInputProps) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<{ videoId: string; isValid: boolean } | null>(null);

  const handleChange = (value: string) => {
    setUrl(value);
    const videoId = extractYoutubeId(value);
    setPreview(videoId ? { videoId, isValid: true } : value ? { videoId: value, isValid: false } : null);
  };

  const handlePlayNow = () => {
    if (preview?.isValid) {
      onAdd(url);
      setUrl('');
      setPreview(null);
    }
  };

  const handleAddToQueue = () => {
    if (preview?.isValid) {
      onQueueAdd(url);
      setUrl('');
      setPreview(null);
    }
  };

  const handleClear = () => {
    setUrl('');
    setPreview(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
          <input
            type="text"
            value={url}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Paste YouTube URL or video ID..."
            className="input-field pl-9 pr-8 text-sm h-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && preview?.isValid) {
                handlePlayNow();
              }
            }}
          />
          {url && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
            >
              <FiX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={handlePlayNow}
          disabled={!preview?.isValid}
          className="btn-primary text-xs h-9 px-3"
          title="Play now"
        >
          Play
        </button>
        <button
          onClick={handleAddToQueue}
          disabled={!preview?.isValid}
          className="btn-secondary text-xs h-9 px-3"
          title="Add to queue"
        >
          <FiList className="w-3.5 h-3.5" />
          Queue
        </button>
      </div>

      <AnimatePresence>
        {preview && preview.isValid && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 p-2 rounded-lg bg-surface-800/50 border border-surface-700/50"
          >
            <img
              src={getYoutubeThumbnail(preview.videoId, 'hq')}
              alt=""
              className="w-12 h-9 rounded object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-surface-400 truncate">
                {preview.videoId}
              </p>
              <p className="text-[10px] text-surface-500">
                Ready to play
              </p>
            </div>
            <FiYoutube className="w-4 h-4 text-red-400" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
