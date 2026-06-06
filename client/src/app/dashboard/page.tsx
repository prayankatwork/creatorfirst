'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase';
import { generateRoomSlug } from '@/lib/utils';
import {
  FiPlus,
  FiCopy,
  FiExternalLink,
  FiUsers,
  FiClock,
  FiBarChart2,
  FiLogOut,
  FiTrash2,
  FiChevronRight,
  FiEye,
  FiMessageSquare,
  FiList,
  FiPlay,
  FiHome,
} from 'react-icons/fi';

interface RoomWithStats {
  id: string;
  slug: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  analytics?: {
    total_visitors: number;
    videos_watched: number;
    chat_activity: number;
  };
  member_count?: number;
}

export default function DashboardPage() {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomWithStats[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user) {
      fetchRooms();
    }
  }, [user]);

  const fetchRooms = async () => {
    if (!user) return;
    setIsLoadingRooms(true);

    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('rooms')
        .select(`
          *,
          analytics:room_analytics(*),
          members:room_members(count)
        `)
        .eq('host_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        setRooms(data.map((room: any) => ({
          ...room,
          member_count: room.members?.[0]?.count || 0,
          analytics: room.analytics || undefined,
        })));
      }
    } catch (err) {
      console.error('Fetch rooms error:', err);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!newRoomTitle.trim() || !user) return;
    setIsCreating(true);

    try {
      const supabase = createClient();
      const slug = generateRoomSlug(newRoomTitle);
      
      const { data, error } = await supabase
        .from('rooms')
        .insert({ title: newRoomTitle.trim(), slug, host_id: user.id })
        .select()
        .single();

      if (error?.code === '23505') {
        const newSlug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
        const { data: retry } = await supabase
          .from('rooms')
          .insert({ title: newRoomTitle.trim(), slug: newSlug, host_id: user.id })
          .select()
          .single();
        if (retry) {
          setShowCreateModal(false);
          setNewRoomTitle('');
          router.push(`/room/${retry.slug}`);
        }
      } else if (data) {
        setShowCreateModal(false);
        setNewRoomTitle('');
        router.push(`/room/${data.slug}`);
      }
    } catch (err) {
      console.error('Create room error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const copyRoomLink = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${slug}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center hover:opacity-90 transition-opacity"
              >
                <FiHome className="w-4 h-4 text-white" />
              </button>
              <span className="text-lg font-bold text-white">CreatorFirst</span>
              <span className="hidden sm:inline text-sm text-surface-500">/ Dashboard</span>
            </div>
            <div className="flex items-center gap-3">
              {user.avatar && (
                <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full ring-2 ring-surface-700" />
              )}
              <span className="text-sm text-surface-300 hidden sm:block">{user.name}</span>
              <button onClick={signOut} className="btn-ghost text-xs">
                <FiLogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Your Rooms</h1>
            <p className="text-surface-400 mt-1">Manage your watch party rooms</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <FiPlus className="w-4 h-4" />
            Create Room
          </button>
        </div>

        {/* Rooms Grid */}
        {isLoadingRooms ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-panel p-6 animate-pulse">
                <div className="h-5 bg-surface-700 rounded w-3/4 mb-3" />
                <div className="h-4 bg-surface-700 rounded w-1/2 mb-6" />
                <div className="flex gap-4">
                  <div className="h-4 bg-surface-700 rounded w-16" />
                  <div className="h-4 bg-surface-700 rounded w-16" />
                  <div className="h-4 bg-surface-700 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4">
              <FiPlay className="w-8 h-8 text-surface-500" />
            </div>
            <h3 className="text-lg font-semibold text-surface-300 mb-2">No rooms yet</h3>
            <p className="text-surface-500 mb-6">Create your first room to start watching together</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <FiPlus className="w-4 h-4" />
              Create Your First Room
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room, i) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel-hover p-6 group cursor-pointer"
                onClick={() => router.push(`/room/${room.slug}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg truncate max-w-[200px]">{room.title}</h3>
                    <p className="text-xs text-surface-500 font-mono">/{room.slug}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyRoomLink(room.slug);
                    }}
                    className="p-2 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-all opacity-0 group-hover:opacity-100"
                    title="Copy room link"
                  >
                    <FiCopy className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs text-surface-400 mb-4">
                  <span className="flex items-center gap-1">
                    <FiClock className="w-3 h-3" />
                    {new Date(room.created_at).toLocaleDateString()}
                  </span>
                  {room.analytics && (
                    <>
                      <span className="flex items-center gap-1">
                        <FiEye className="w-3 h-3" />
                        {room.analytics.total_visitors} visits
                      </span>
                      <span className="flex items-center gap-1">
                        <FiBarChart2 className="w-3 h-3" />
                        {room.analytics.videos_watched} videos
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`/room/${room.slug}`, '_blank');
                    }}
                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
                  >
                    <FiExternalLink className="w-3 h-3" />
                    Open Room
                  </button>
                  <FiChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 transition-colors" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-6 w-full max-w-md"
          >
            <h2 className="text-xl font-bold mb-2">Create a Room</h2>
            <p className="text-sm text-surface-400 mb-6">
              Name your room and get a shareable link instantly.
            </p>
            <input
              type="text"
              value={newRoomTitle}
              onChange={(e) => setNewRoomTitle(e.target.value)}
              placeholder="Room name (e.g. Rawr Reacts)"
              className="input-field mb-2"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
            />
            <p className="text-xs text-surface-500 mb-6">
              URL will be: /room/{generateRoomSlug(newRoomTitle) || 'your-room'}
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewRoomTitle('');
                }}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={!newRoomTitle.trim() || isCreating}
                className="btn-primary"
              >
                {isCreating ? 'Creating...' : 'Create Room'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
