'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { generateRoomSlug } from '@/lib/utils';
import { createClient } from '@/lib/supabase';
import {
  FiPlay,
  FiUsers,
  FiMessageSquare,
  FiList,
  FiYoutube,
  FiShield,
  FiZap,
  FiMonitor,
  FiArrowRight,
  FiGithub,
  FiTwitter,
} from 'react-icons/fi';

export default function HomePage() {
  const { user, isLoading, signInWithGitHub, signOut } = useAuth();
  const router = useRouter();
  const [roomTitle, setRoomTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [joinSlug, setJoinSlug] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);

  const handleCreateRoom = async () => {
    if (!roomTitle.trim() || !user) return;
    setIsCreating(true);

    try {
      const supabase = createClient();
      const slug = generateRoomSlug(roomTitle);
      
      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          title: roomTitle.trim(),
          slug,
          host_id: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Create room error:', error);
        if (error.code === '23505') {
          // Slug collision, add random suffix
          const newSlug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
          const { data: retry } = await supabase
            .from('rooms')
            .insert({
              title: roomTitle.trim(),
              slug: newSlug,
              host_id: user.id,
            })
            .select()
            .single();

          if (retry) {
            router.push(`/room/${retry.slug}`);
          }
        }
      } else if (room) {
        router.push(`/room/${room.slug}`);
      }
    } catch (err) {
      console.error('Create room error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    const input = joinSlug.trim();
    if (!input) return;
    
    // Extract slug from full URL if pasted, otherwise use as-is
    let slug = input.toLowerCase();
    const match = slug.match(/\/room\/([^?#/]+)/);
    if (match) slug = match[1];
    
    router.push(`/room/${slug}`);
  };

  const features = [
    {
      icon: FiYoutube,
      title: 'YouTube-First',
      description: 'Videos play through YouTube\'s official player. No downloads, mirrors, or restreams.',
    },
    {
      icon: FiZap,
      title: 'Real-Time Sync',
      description: 'Perfectly synchronized playback. Everyone watches together in perfect harmony.',
    },
    {
      icon: FiMessageSquare,
      title: 'Live Chat',
      description: 'React and discuss in real-time. Chat stays active even when videos change.',
    },
    {
      icon: FiList,
      title: 'Smart Queue',
      description: 'Queue videos, manage suggestions, and keep the party going seamlessly.',
    },
    {
      icon: FiShield,
      title: 'Creator Friendly',
      description: 'Original creators stay credited. Every video links back to the original YouTube source.',
    },
    {
      icon: FiMonitor,
      title: 'Session History',
      description: 'Track what you\'ve watched. Never lose a great video moment.',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                <FiPlay className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold text-white">CreatorFirst</span>
            </div>
            <div className="flex items-center gap-3">
              {isLoading ? (
                <div className="w-8 h-8 rounded-full bg-surface-700 animate-pulse" />
              ) : user ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="btn-ghost text-sm"
                  >
                    Dashboard
                  </button>
                  <div className="flex items-center gap-2">
                    {user.avatar && (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-8 h-8 rounded-full ring-2 ring-surface-700"
                      />
                    )}
                    <span className="text-sm text-surface-300 hidden sm:block">{user.name}</span>
                  </div>
                  <button onClick={signOut} className="btn-ghost text-xs">
                    Sign Out
                  </button>
                </div>
              ) : (
                <button onClick={signInWithGitHub} className="btn-primary text-sm">
                  Sign In with GitHub
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-950/50 via-surface-950 to-surface-950" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-3xl" />
        
        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 mb-6">
              <FiPlay className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-sm text-brand-300 font-medium">Reaction Content, Reimagined</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
              <span className="gradient-text">Watch together.</span>
              <br />
              React together.
              <br />
              <span className="gradient-text">Keep creators first.</span>
            </h1>

            <p className="text-lg sm:text-xl text-surface-400 max-w-2xl mx-auto mb-8">
              CreatorFirst is a synchronized YouTube watch-and-react platform that puts 
              original creators at the center. Watch videos together through YouTube's 
              official player — no downloads, no mirrors, no restreams.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {!user ? (
                <button onClick={signInWithGitHub} className="btn-primary text-base px-8 py-3">
                  Get Started Free
                  <FiArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-lg">
                  <input
                    type="text"
                    value={roomTitle}
                    onChange={(e) => setRoomTitle(e.target.value)}
                    placeholder="Name your room..."
                    className="input-field flex-1 text-center sm:text-left"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                  />
                  <button
                    onClick={handleCreateRoom}
                    disabled={!roomTitle.trim() || isCreating}
                    className="btn-primary text-base px-8 py-3 whitespace-nowrap"
                  >
                    {isCreating ? 'Creating...' : 'Create Room'}
                  </button>
                </div>
              )}

              <button
                onClick={() => showJoinInput ? handleJoinRoom() : setShowJoinInput(true)}
                className="btn-secondary text-base px-8 py-3"
              >
                {showJoinInput ? 'Join Room' : 'Join a Room'}
              </button>
            </div>

            <AnimatePresence>
              {showJoinInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 max-w-xs mx-auto"
                >
                  <input
                    type="text"
                    value={joinSlug}
                    onChange={(e) => setJoinSlug(e.target.value)}
                    placeholder="Room slug (e.g. rawr-reacts)"
                    className="input-field text-center"
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 border-t border-surface-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              How It <span className="gradient-text">Works</span>
            </h2>
            <p className="text-surface-400 max-w-xl mx-auto">
              Three simple steps to start watching YouTube together.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Create a Room',
                desc: 'Sign in with GitHub and name your watch party room. Get a shareable link instantly.',
              },
              {
                step: '02',
                title: 'Add Videos',
                desc: 'Paste YouTube URLs to build a queue. Viewers can suggest videos for approval.',
              },
              {
                step: '03',
                title: 'Watch Together',
                desc: 'Play, pause, and seek in perfect sync. Chat and react in real-time with everyone.',
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-panel p-8 text-center group hover:border-brand-500/30 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-brand-500/30 transition-colors">
                  <span className="text-brand-400 font-bold">{item.step}</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-surface-400 text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 border-t border-surface-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything You <span className="gradient-text">Need</span>
            </h2>
            <p className="text-surface-400 max-w-xl mx-auto">
              Built for creators, designed for communities.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel-hover p-6 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center mb-4 group-hover:bg-brand-500/30 transition-colors">
                    <Icon className="w-5 h-5 text-brand-400" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-surface-400 leading-relaxed">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 px-4 border-t border-surface-800/50 bg-surface-900/50">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-6">
              <FiShield className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Our <span className="gradient-text">Mission</span>
            </h2>
            <p className="text-lg text-surface-300 max-w-2xl mx-auto leading-relaxed">
              CreatorFirst exists to make reaction content more creator-friendly. 
              We believe in building a reaction ecosystem that supports original 
              creators instead of competing with them.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 mt-10 max-w-2xl mx-auto">
              {[
                'Videos watched through YouTube\'s official player',
                'Original creators remain the content source',
                'Content is never copied or redistributed',
                'Audience stays focused on the original video',
              ].map((principle, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-lg bg-surface-800/50">
                  <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="text-sm text-surface-300">{principle}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-surface-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                <FiPlay className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-semibold text-surface-300">CreatorFirst</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-xs text-surface-500">
                &copy; {new Date().getFullYear()} CreatorFirst. All rights reserved.
              </span>
              <a href="#" className="text-surface-500 hover:text-surface-300 transition-colors">
                <FiGithub className="w-4 h-4" />
              </a>
              <a href="#" className="text-surface-500 hover:text-surface-300 transition-colors">
                <FiTwitter className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
