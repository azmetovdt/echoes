/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Mic, Square, Share2, X } from 'lucide-react';
import CircleVisualizer from './CircleVisualizer';
import NoiseCoordinates from './NoiseCoordinates';
import type { AudioSettings } from '../services/settings';

interface Props {
  settings: AudioSettings;
  batchUpdate: (updates: Partial<AudioSettings>) => void;
  isPlaying: boolean;
  onBegin: (preset?: { lat: number; lon: number }) => void;
  onResetLocation: () => void;
  loading: boolean;
  error: string | null;
  location: { lat: number; lon: number } | null;
  onSwitchToControl: () => void;
  getSmoothedRms: () => number;
  soundStatus?: 'idle' | 'loading' | 'playing';
  isRecording?: boolean;
  startRecording?: () => void;
  stopRecording?: () => void;
}

export default function ImmersiveView({
  settings, batchUpdate: _batchUpdate, isPlaying, onBegin, onResetLocation, loading, error, location, onSwitchToControl, getSmoothedRms, soundStatus,
  isRecording, startRecording, stopRecording
}: Props) {
  const [phase, setPhase] = useState<'warning' | 'active'>('warning');
  const [geoState, setGeoState] = useState<PermissionState | 'unknown'>('unknown');
  const [showInfo, setShowInfo] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

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

  const handleBegin = useCallback((preset?: { lat: number; lon: number }) => {
    setPhase('active');
    onBegin(preset);
  }, [onBegin]);

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  }, []);

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
      <div 
        className="absolute top-6 left-6 z-10 flex flex-col items-start"
        onMouseEnter={() => setShowInfo(true)}
        onMouseLeave={() => setShowInfo(false)}
      >
        <button 
          className={`p-2 -ml-2 transition-colors ${showInfo ? 'text-white/50' : 'text-white/20 hover:text-white/40'}`}
          style={{display: 'none'}}
          aria-label={isRu ? "О приложении" : "About"}
          onClick={() => setShowInfo(!showInfo)}
        >
          <Info className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
        <AnimatePresence>
          {showInfo && (
            <motion.div 
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 0.35, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="mt-2 w-56 text-[9px] tracking-[0.15em] font-sans leading-loose text-[#e0d8d0] pointer-events-none"
            >
              {isRu 
                ? "Генеративная звуковая среда. Захватывает аудио вокруг вашей геопозиции через Freesound и плавно синтезирует звук." 
                : "Generative soundscape. Sources audio around your location via Freesound and continuously synthesizes it."}
            </motion.div>
          )}
        </AnimatePresence>
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
              className="text-[11px] leading-loose tracking-wide max-w-[260px]"
              style={{ opacity: 0.55 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.55, y: 0 }}
              transition={{ delay: 0.6, duration: 1.2 }}
            >
              {isRu 
                ? 'Эта страница собирает звуки вокруг вас через Freesound и синтезирует из них непрерывный звуковой ландшафт' 
                : 'This page gathers sounds from your surroundings via Freesound and synthesizes them into a continuous soundscape'}
              {error && (
                <span className="text-orange-400/70 mt-3 block">{error}</span>
              )}
            </motion.p>

            <div className="flex flex-col items-center gap-6">
              {location && !loading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  transition={{ delay: 1, duration: 1 }}
                  className="flex items-center gap-2 text-[10px] tracking-[0.2em] font-sans mb-[-10px]"
                >
                  <span>{location.lat.toFixed(4)}, {location.lon.toFixed(4)}</span>
                  <button
                    onClick={onResetLocation}
                    className="cursor-pointer hover:text-white transition-colors"
                    aria-label={isRu ? "Сбросить местоположение" : "Reset location"}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
              
              <motion.button
                onClick={() => handleBegin()}
                disabled={loading}
                className="text-[11px] border-b border-current pb-1 transition-opacity disabled:opacity-20 cursor-pointer text-white/80 hover:text-white/100 transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                transition={{ delay: 1.4, duration: 1 }}
              >
                {loading 
                  ? (isRu ? 'поиск\u2026' : 'locating\u2026') 
                  : (location ? (isRu ? 'начать' : 'begin') : (isRu ? 'моё местоположение' : 'my location'))}
              </motion.button>
            </div>
            
            {!location && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.25 }}
                transition={{ delay: 2, duration: 1 }}
                className="flex gap-4 mt-2 text-[10px] tracking-widest uppercase "
              >
                {[
                  { name: isRu ? 'Токио' : 'Tokyo', lat: 35.6595, lon: 139.7005 },
                  { name: isRu ? 'Амазония' : 'Amazon', lat: -3.1190, lon: -60.0217 },
                  { name: isRu ? 'Исландия' : 'Iceland', lat: 64.4127, lon: -16.8319 },
                  { name: isRu ? 'Калининград' : 'Kaliningrad', lat: 55.0089, lon: 20.6176},
                  { name: isRu ? 'Стамбул' : 'Istanbul', lat: 41.0282, lon: 29.0163}
                ].map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => handleBegin({ lat: preset.lat, lon: preset.lon })}
                    className="hover:opacity-500 transition-opacity cursor-pointer text-white/80 hover:text-white/100"
                  >
                    {preset.name}
                  </button>
                ))}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2.5 }}
            className="flex flex-col items-center gap-10"
          >
            <CircleVisualizer settings={settings} isPlaying={isPlaying} getSmoothedRms={getSmoothedRms} soundStatus={soundStatus} />

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

            {isPlaying && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 4, duration: 3 }}
                className="flex items-center gap-8 -mt-2 mb-2"
              >
                {/* Recording Button */}
                <button 
                  className={`cursor-pointer flex items-center gap-2 p-2 transition-colors ${isRecording ? 'text-red-500/60 hover:text-red-500/80' : 'text-white/20 hover:text-white/40'}`}
                  aria-label={isRecording ? (isRu ? "Остановить запись" : "Stop recording") : (isRu ? "Записать" : "Record")}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? (
                    <>
                      <span className="text-[9px] tracking-[0.1em] font-sans uppercase animate-pulse">rec</span>
                      <Square className="w-[11px] h-[11px]" strokeWidth={1.5} fill="currentColor" />
                    </>
                  ) : (
                    <>
                      <span className="text-[9px] tracking-[0.1em] font-sans uppercase">rec</span>
                      <Mic className="w-[11px] h-[11px]" strokeWidth={1.5} />
                    </>
                  )}
                </button>

                {/* Share Button */}
                <button 
                  className={`cursor-pointer  flex items-center gap-2 p-2 transition-colors ${showCopied ? 'text-white/60' : 'text-white/20 hover:text-white/40'}`}
                  aria-label={isRu ? "Поделиться местоположением" : "Share location"}
                  onClick={handleShare}
                >
                  <span className="text-[9px] tracking-[0.1em] font-sans uppercase whitespace-nowrap">
                    {showCopied ? (isRu ? 'ссылка скопирована' : 'link copied') : (isRu ? 'поделиться местоположением' : 'share location')}
                  </span>
                  {!showCopied && <Share2 className="w-[11px] h-[11px]" strokeWidth={1.5} />}
                </button>
              </motion.div>
            )}

            
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

