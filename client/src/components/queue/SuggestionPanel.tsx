'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Suggestion } from '@/types';
import { getYoutubeThumbnail, extractYoutubeId, formatDate } from '@/lib/utils';
import { FiCheck, FiX, FiSend, FiSearch, FiYoutube } from 'react-icons/fi';

interface SuggestionPanelProps {
  suggestions: Suggestion[];
  isHost: boolean;
  onApprove: (suggestionId: string) => void;
  onReject: (suggestionId: string) => void;
  onSubmit: (data: { youtube_video_id: string; title?: string; channel_name?: string; thumbnail_url?: string }) => void;
}

export default function SuggestionPanel({
  suggestions,
  isHost,
  onApprove,
  onReject,
  onSubmit,
}: SuggestionPanelProps) {
  const [urlInput, setUrlInput] = useState('');

  const pendingSuggests = suggestions.filter(s => s.status === 'pending');
  const reviewedSuggests = suggestions.filter(s => s.status !== 'pending');

  const handleSubmit = () => {
    const videoId = extractYoutubeId(urlInput);
    if (videoId) {
      onSubmit({
        youtube_video_id: videoId,
        thumbnail_url: getYoutubeThumbnail(videoId),
      });
      setUrlInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {/* Pending Suggestions */}
        {isHost && pendingSuggests.length > 0 && (
          <div className="p-3 border-b border-surface-800/50">
            <p className="text-[10px] text-surface-500 uppercase tracking-wider font-medium mb-2">
              Pending Review ({pendingSuggests.length})
            </p>
            <div className="space-y-2">
              <AnimatePresence>
                {pendingSuggests.map((suggestion) => (
                  <motion.div
                    key={suggestion.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center gap-2 p-2 rounded-lg bg-surface-800/50 border border-surface-700/50"
                  >
                    <img
                      src={suggestion.thumbnail_url || getYoutubeThumbnail(suggestion.youtube_video_id, 'default')}
                      alt=""
                      className="w-10 h-7 rounded object-cover flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate text-surface-200">
                        {suggestion.title || suggestion.youtube_video_id}
                      </p>
                      <p className="text-[10px] text-surface-500">
                        Suggested by {suggestion.username}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onApprove(suggestion.id)}
                        className="p-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-all"
                        title="Approve"
                      >
                        <FiCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onReject(suggestion.id)}
                        className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all"
                        title="Reject"
                      >
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* All Suggestions */}
        <div className="p-3">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider font-medium mb-2">
            {isHost ? 'History' : 'Your Suggestions'}
          </p>
          {suggestions.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center mx-auto mb-2">
                <FiYoutube className="w-5 h-5 text-surface-500" />
              </div>
              <p className="text-xs text-surface-500">No suggestions yet</p>
              {!isHost && (
                <p className="text-[10px] text-surface-600">Suggest a video to the host!</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {suggestions.slice(0, 30).map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-800/30"
                >
                  <img
                    src={suggestion.thumbnail_url || getYoutubeThumbnail(suggestion.youtube_video_id, 'default')}
                    alt=""
                    className="w-8 h-6 rounded object-cover flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate text-surface-300">
                      {suggestion.title || suggestion.youtube_video_id}
                    </p>
                    <p className="text-[10px] text-surface-500">
                      {suggestion.username} &middot; {formatDate(suggestion.created_at)}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    suggestion.status === 'approved'
                      ? 'bg-green-500/20 text-green-300'
                      : suggestion.status === 'rejected'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-yellow-500/20 text-yellow-300'
                  }`}>
                    {suggestion.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Suggest input (viewers) */}
      {!isHost && (
        <div className="border-t border-surface-800/50 p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Suggest a YouTube video..."
              className="input-field text-sm h-9 flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <button
              onClick={handleSubmit}
              disabled={!extractYoutubeId(urlInput)}
              className="btn-primary text-xs h-9 px-3"
            >
              <FiSend className="w-3.5 h-3.5" />
              Suggest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
