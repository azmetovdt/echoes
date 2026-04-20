/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { MapPin, Play, Pause, Settings, ListMusic, Circle, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FreesoundResult } from '../services/freesound';
import { AudioSettings } from '../services/settings';
import SettingsPanel from './SettingsPanel';
import NoiseCoordinates from './NoiseCoordinates';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Props {
  settings: AudioSettings;
  updateSetting: <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => void;
  userPresets: Record<string, AudioSettings>;
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: AudioSettings) => void;
  onDeletePreset: (name: string) => void;
  location: { lat: number; lon: number } | null;
  sounds: FreesoundResult[];
  currentIndex: number;
  setCurrentIndex: (i: number) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  currentSoundName: string | null;
  currentDistance: number | null;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  loading: boolean;
  error: string | null;
  manualLat: string;
  manualLon: string;
  setManualLat: (v: string) => void;
  setManualLon: (v: string) => void;
  onSetManualLocation: () => void;
  onGetGPS: () => void;
}

export default function ControlView({
  settings, updateSetting, userPresets, onSavePreset, onLoadPreset, onDeletePreset,
  location, sounds, currentIndex, setCurrentIndex,
  isPlaying, togglePlay, currentSoundName, currentDistance,
  isRecording, startRecording, stopRecording,
  loading, error, manualLat, manualLon, setManualLat, setManualLon,
  onSetManualLocation, onGetGPS,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-serif relative overflow-y-auto overflow-x-hidden">
      <div className="absolute inset-0 atmosphere pointer-events-none" />

      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 text-center py-12">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center w-full max-w-2xl"
        >
          <div className="mb-12">
            <motion.h1
              className="text-6xl md:text-8xl font-light tracking-tighter mb-4"
              animate={{ opacity: isPlaying ? [0.4, 0.7, 0.4] : 0.4 }}
              transition={{ duration: 4, repeat: Infinity }}
            >

            </motion.h1>
            <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest opacity-50">
              <MapPin className="w-3 h-3" />
              {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : <NoiseCoordinates />}
            </div>
          </div>

          <div className="player-chrome p-8 md:p-12 mb-8 w-full backdrop-blur-3xl">
            <div className="mb-8 h-24 flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {currentSoundName ? (
                  <motion.div
                    key={currentSoundName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex flex-col items-center"
                  >
                    <div className="text-xl italic opacity-80 mb-2">{currentSoundName}</div>
                    {currentDistance !== null && (
                      <div className="text-xs uppercase tracking-widest opacity-50 text-orange-300">
                        Recorded {currentDistance < 1
                          ? `${Math.round(currentDistance * 1000)}m`
                          : `${currentDistance.toFixed(1)}km`} away
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div className="text-sm opacity-30 uppercase tracking-widest">
                    {loading ? 'Searching...' : 'Silence'}
                  </div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-center mb-6">
              <button
                onClick={togglePlay}
                disabled={loading || sounds.length === 0}
                className="w-20 h-20 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/5 transition-all disabled:opacity-20"
              >
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 translate-x-1" />}
              </button>
            </div>

            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setShowQueue(!showQueue)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
              >
                <ListMusic className="w-3 h-3" />
                Queue
              </button>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!isPlaying}
                className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest transition-opacity disabled:opacity-20 ${isRecording ? 'opacity-100 text-red-400' : 'opacity-40 hover:opacity-100'}`}
              >
                {isRecording ? <Square className="w-3 h-3 fill-current" /> : <Circle className="w-3 h-3 fill-current" />}
                {isRecording ? 'Stop' : 'Rec'}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
              >
                <Settings className="w-3 h-3" />
                Settings
              </button>
            </div>
          </div>

          {error && (
            <div className="text-orange-500/80 text-sm italic mb-4">{error}</div>
          )}

          <AnimatePresence>
            {showQueue && sounds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 w-full max-w-md text-left overflow-hidden"
              >
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto px-1 pb-4 custom-scrollbar">
                  {sounds.map((sound, index) => {
                    const isCurrent = index === currentIndex;
                    let distanceStr = '';
                    if (sound.geotag && location) {
                      const [sLat, sLon] = sound.geotag.split(' ').map(Number);
                      if (!isNaN(sLat) && !isNaN(sLon)) {
                        const dist = getDistance(location.lat, location.lon, sLat, sLon);
                        distanceStr = dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
                      }
                    }
                    return (
                      <div
                        key={sound.id}
                        onClick={() => setCurrentIndex(index)}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                          isCurrent
                            ? 'bg-orange-500/10 border-orange-500/30 opacity-100'
                            : 'bg-white/5 border-transparent opacity-40 hover:opacity-70 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex flex-col overflow-hidden min-w-0 pr-4">
                          <span className="text-sm truncate font-medium">{sound.name}</span>
                          <span className="text-[10px] uppercase tracking-wider opacity-60 truncate">
                            by {sound.username}
                          </span>
                        </div>
                        {distanceStr && (
                          <span className="text-[10px] uppercase tracking-widest opacity-50 whitespace-nowrap">
                            {distanceStr}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            settings={settings}
            updateSetting={updateSetting}
            userPresets={userPresets}
            onSavePreset={onSavePreset}
            onLoadPreset={onLoadPreset}
            onDeletePreset={onDeletePreset}
            onClose={() => setShowSettings(false)}
            manualLat={manualLat}
            manualLon={manualLon}
            setManualLat={setManualLat}
            setManualLon={setManualLon}
            onSetManualLocation={onSetManualLocation}
            onGetGPS={onGetGPS}
            gpsLoading={loading}
          />
        )}
      </AnimatePresence>

      <style>{`
        .atmosphere {
          background:
            radial-gradient(circle at 50% 30%, #3a1510 0%, transparent 60%),
            radial-gradient(circle at 10% 80%, #ff4e00 0%, transparent 50%);
          filter: blur(60px);
          opacity: 0.4;
        }
        .player-chrome {
          background: rgba(255, 80, 20, 0.05);
          backdrop-filter: blur(30px);
          border-radius: 40px;
          border: 1px solid rgba(255, 200, 150, 0.1);
        }
        input[type=range] { -webkit-appearance: none; appearance: none; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; height: 12px; width: 12px;
          border-radius: 50%; background: #f97316; cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          height: 12px; width: 12px; border-radius: 50%;
          background: #f97316; border: none; cursor: pointer;
        }
        input[type=range]::-moz-range-track {
          height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12);
        }
        input[type=range]::-moz-range-progress {
          height: 4px; border-radius: 2px; background: #f97316;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1); border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}
