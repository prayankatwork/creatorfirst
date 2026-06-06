'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '@/types';
import { formatDate } from '@/lib/utils';
import { FiSend, FiTrash2, FiMic, FiMicOff, FiSmile } from 'react-icons/fi';

interface ChatPanelProps {
  messages: ChatMessage[];
  mutedUsers: string[];
  currentUserId: string;
  isHost: boolean;
  onSend: (message: string) => void;
  onDelete: (messageId: string) => void;
  onMute: (userId: string) => void;
  onUnmute: (userId: string) => void;
}

export default function ChatPanel({
  messages,
  mutedUsers,
  currentUserId,
  isHost,
  onSend,
  onDelete,
  onMute,
  onUnmute,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isUserMuted = (userId: string) => mutedUsers.includes(userId);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center mx-auto mb-2">
                <FiSmile className="w-5 h-5 text-surface-500" />
              </div>
              <p className="text-xs text-surface-500">No messages yet</p>
              <p className="text-[10px] text-surface-600">Be the first to say something!</p>
            </div>
          )}

          {messages.slice(-100).map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`group flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                msg.is_deleted ? 'opacity-50' : 'hover:bg-surface-800/30'
              }`}
            >
              {/* Avatar */}
              <div className="w-6 h-6 rounded-full bg-surface-700 flex-shrink-0 overflow-hidden mt-0.5">
                {msg.avatar ? (
                  <img src={msg.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[10px] text-surface-400 font-medium">
                      {msg.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Message content */}
              <div className="flex-1 min-w-0">
                {msg.is_deleted ? (
                  <p className="text-xs text-surface-600 italic">Message deleted</p>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-surface-200 truncate max-w-[100px]">
                        {msg.username}
                      </span>
                      {msg.user_id === currentUserId && (
                        <span className="text-[10px] text-brand-400">YOU</span>
                      )}
                      <span className="text-[10px] text-surface-600 ml-auto">
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-surface-300 mt-0.5 break-words">
                      {msg.message}
                    </p>
                  </>
                )}
              </div>

              {/* Actions (host only) */}
              {isHost && !msg.is_deleted && (
                <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => onDelete(msg.id)}
                    className="p-1 rounded hover:bg-surface-700 text-surface-500 hover:text-red-400 transition-colors"
                    title="Delete message"
                  >
                    <FiTrash2 className="w-3 h-3" />
                  </button>
                  {isUserMuted(msg.user_id) ? (
                    <button
                      onClick={() => onUnmute(msg.user_id)}
                      className="p-1 rounded hover:bg-surface-700 text-surface-500 hover:text-green-400 transition-colors"
                      title="Unmute user"
                    >
                      <FiMicOff className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onMute(msg.user_id)}
                      className="p-1 rounded hover:bg-surface-700 text-surface-500 hover:text-yellow-400 transition-colors"
                      title="Mute user"
                    >
                      <FiMic className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-surface-800/50 p-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isUserMuted(currentUserId) ? 'You are muted' : 'Type a message...'}
            disabled={isUserMuted(currentUserId)}
            className="input-field text-sm h-9 flex-1"
            maxLength={500}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isUserMuted(currentUserId)}
            className="btn-primary text-xs h-9 w-9 p-0 flex items-center justify-center"
          >
            <FiSend className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
