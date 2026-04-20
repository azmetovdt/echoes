/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info } from 'lucide-react';
import CircleVisualizer from './CircleVisualizer';
import NoiseCoordinates from './NoiseCoordinates';
import type { AudioSettings } from '../services/settings';

interface Props {
  settings: AudioSettings;
  batchUpdate: (updates: Partial<AudioSettings>) => void;
  isPlaying: boolean;
  onBegin: () => void;
  loading: boolean;
  error: string | null;
  location: { lat: number; lon: number } | null;
  onSwitchToControl: () => void;
  getSmoothedRms: () => number;
}

export default function ImmersiveView({
  settings, batchUpdate: _batchUpdate, isPlaying, onBegin, loading, error, location, onSwitchToControl, getSmoothedRms,
}: Props) {
  const [phase, setPhase] = useState<'warning' | 'active'>('warning');
  const [geoState, setGeoState] = useState<PermissionState | 'unknown'>('unknown');

  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then(res => {
          setGeoState(res.state);
          res.onchange = () => setGeoState(res.state);
        })
        .catch(() => {});
    }
  }, []);

  const isRu = window.location.pathname.includes('/ru');

  const handleBegin = useCallback(() => {
    setPhase('active');
    onBegin();
  }, [onBegin]);

  // Hidden trigger: 5 taps in bottom-right corner within 3 seconds
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCornerTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 3000);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      onSwitchToControl();
    }
  }, [onSwitchToControl]);

  return (
    <div className="min-h-screen bg-[#050302] text-[#e0d8d0] font-serif flex flex-col items-center justify-center relative overflow-hidden select-none">
      <div className="absolute inset-0 immersive-atmosphere pointer-events-none" />

      {/* Info Button */}
      <div className="absolute top-6 left-6 z-10 flex flex-col items-start group">
        <button 
          className="p-2 -ml-2 text-white/20 hover:text-white/60 transition-colors"
          aria-label={isRu ? "О приложении" : "About"}
        >
          <Info className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
        <div className="absolute top-full left-0 mt-1 w-64 p-3 bg-[#0a0503]/90 border border-orange-500/10 rounded-xl text-[11px] leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none backdrop-blur-md">
          {isRu 
            ? "Генеративная звуковая среда. Захватывает аудио вокруг вашей геопозиции через Freesound и плавно синтезирует звук." 
            : "Generative soundscape. Sources audio around your location via Freesound and continuously synthesizes it."}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'warning' ? (
          <motion.div
            key="warning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            className="flex flex-col items-center gap-14 text-center px-10 max-w-xs"
          >
            <motion.p
              className="text-xs leading-loose tracking-wide"
              style={{ opacity: 0.45 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.45, y: 0 }}
              transition={{ delay: 0.6, duration: 1.2 }}
            >
              {isRu ? 'Эта среда воспроизводит звук' : 'This experience uses sound'}
              {geoState !== 'granted' && (
                isRu ? ' и требует вашей геопозиции.' : ' and requires your location.'
              )}
              {error && (
                <span className="text-orange-400/70 mt-3 block">{error}</span>
              )}
            </motion.p>

            <motion.button
              onClick={handleBegin}
              disabled={loading}
              className="text-[11px] uppercase tracking-[0.35em] border-b border-current pb-1 transition-opacity disabled:opacity-20 cursor-pointer"
              style={{ opacity: 0.35 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.35 }}
              transition={{ delay: 1.4, duration: 1 }}
              whileHover={{ opacity: 0.75 }}
            >
              {loading 
                ? (isRu ? 'поиск\u2026' : 'locating\u2026') 
                : (isRu ? 'начать' : 'begin')}
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2.5 }}
            className="flex flex-col items-center gap-10"
          >
            <CircleVisualizer settings={settings} isPlaying={isPlaying} getSmoothedRms={getSmoothedRms} />

            <div className="h-4 flex items-center justify-center">
              <motion.div
                className="text-[9px] uppercase tracking-widest font-sans"
                style={{ opacity: 0.15 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.15 }}
                transition={{ delay: 4, duration: 3 }}
              >
                {location ? (
                  <>{location.lat.toFixed(4)},&nbsp;{location.lon.toFixed(4)}</>
                ) : (
                  <NoiseCoordinates />
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invisible 44×44px trigger zone, bottom-right */}
      <div
        className="absolute bottom-0 right-0 w-11 h-11"
        onClick={handleCornerTap}
        aria-hidden="true"
      />

      <style>{`
        .immersive-atmosphere {
          background:
            // radial-gradient(ellipse at 40% 60%, #180a04 0%, transparent 65%),
            // radial-gradient(ellipse at 70% 30%, #0d0508 0%, transparent 55%);
          filter: blur(70px);
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
