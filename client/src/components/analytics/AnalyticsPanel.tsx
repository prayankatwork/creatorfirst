'use client';

import type { RoomAnalytics, RoomMember, SessionHistoryEntry } from '@/types';
import { formatTimestamp } from '@/lib/utils';
import {
  FiUsers,
  FiEye,
  FiClock,
  FiBarChart2,
  FiMessageSquare,
  FiList,
  FiYoutube,
  FiActivity,
  FiTrendingUp,
} from 'react-icons/fi';

interface AnalyticsPanelProps {
  analytics: RoomAnalytics | null;
  members: RoomMember[];
  history: SessionHistoryEntry[];
}

export default function AnalyticsPanel({ analytics, members, history }: AnalyticsPanelProps) {
  const stats = [
    {
      icon: FiEye,
      label: 'Total Visitors',
      value: analytics?.total_visitors || 0,
      color: 'text-blue-400 bg-blue-500/20',
    },
    {
      icon: FiUsers,
      label: 'Peak Concurrent',
      value: analytics?.peak_concurrent || 0,
      color: 'text-purple-400 bg-purple-500/20',
    },
    {
      icon: FiClock,
      label: 'Session Duration',
      value: analytics?.session_duration_seconds 
        ? formatTimestamp(analytics.session_duration_seconds)
        : '0:00',
      color: 'text-green-400 bg-green-500/20',
    },
    {
      icon: FiYoutube,
      label: 'Videos Watched',
      value: analytics?.videos_watched || 0,
      color: 'text-red-400 bg-red-500/20',
    },
    {
      icon: FiList,
      label: 'Queue Activity',
      value: analytics?.queue_activity || 0,
      color: 'text-yellow-400 bg-yellow-500/20',
    },
    {
      icon: FiMessageSquare,
      label: 'Chat Messages',
      value: analytics?.chat_activity || 0,
      color: 'text-brand-400 bg-brand-500/20',
    },
    {
      icon: FiActivity,
      label: 'Suggestions',
      value: analytics?.suggestions_count || 0,
      color: 'text-teal-400 bg-teal-500/20',
    },
    {
      icon: FiUsers,
      label: 'Current Viewers',
      value: members.length,
      color: 'text-cyan-400 bg-cyan-500/20',
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="p-3 rounded-lg bg-surface-800/50 border border-surface-700/50"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-lg ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-3 h-3" />
                </div>
              </div>
              <p className="text-lg font-bold text-surface-100">{stat.value}</p>
              <p className="text-[10px] text-surface-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Active Viewers */}
      <div>
        <p className="text-[10px] text-surface-500 uppercase tracking-wider font-medium mb-2">
          Active Viewers
        </p>
        <div className="space-y-1">
          {members.length === 0 ? (
            <p className="text-xs text-surface-600 text-center py-4">No viewers in the room</p>
          ) : (
            members.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-800/30"
              >
                <div className={`w-2 h-2 rounded-full ${member.last_active_at ? 'bg-green-400' : 'bg-surface-600'}`} />
                <span className="text-xs text-surface-300 flex-1 truncate">
                  {member.profile?.name || 'Anonymous'}
                </span>
                {member.role === 'host' && (
                  <span className="text-[10px] text-brand-400 font-medium">HOST</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Session History */}
      {history.length > 0 && (
        <div>
          <p className="text-[10px] text-surface-500 uppercase tracking-wider font-medium mb-2">
            Recently Watched
          </p>
          <div className="space-y-1">
            {history.slice(0, 10).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-800/30 transition-colors"
              >
                <FiYoutube className="w-3 h-3 text-red-400 flex-shrink-0" />
                <span className="text-xs text-surface-400 truncate flex-1">
                  {entry.title || entry.youtube_video_id}
                </span>
                <span className="text-[10px] text-surface-600">
                  {new Date(entry.watched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
