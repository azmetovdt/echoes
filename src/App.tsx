/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import { MapPin, Play, Pause, RefreshCw, Volume2, Info, ListMusic, ShieldAlert, Settings, Copyright } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchLocalSounds, FreesoundResult } from './services/freesound';
import { useAudioEngine } from './components/AudioEngine';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

export default function App() {
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [sounds, setSounds] = useState<FreesoundResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noiseVolume, setNoiseVolumeState] = useState(0.05);
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [includeExplicit, setIncludeExplicit] = useState(false);
  const [cc0Only, setCc0Only] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');

  const { isPlaying, togglePlay, playSound, currentSoundName, setNoiseVolume } = useAudioEngine(0.05);

  const getGeoLocation = useCallback(() => {
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setError("Could not get location. Please enable GPS.");
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    getGeoLocation();
  }, [getGeoLocation]);

  useEffect(() => {
    if (location) {
      setManualLat(location.lat.toFixed(6));
      setManualLon(location.lon.toFixed(6));
      fetchLocalSounds(location.lat, location.lon, 10, includeExplicit, cc0Only).then((results) => {
        setSounds(results);
        if (results.length === 0) {
          setError("No sounds found in this area. Try a different location?");
        } else {
          setError(null);
        }
      });
    }
  }, [location, includeExplicit, cc0Only]);

  // Cycle through sounds with dynamic overlap
  useEffect(() => {
    if (isPlaying && sounds.length > 0) {
      const sound = sounds[currentIndex];
      playSound(sound.previews['preview-hq-mp3'], sound.name);

      if (location && sound.geotag) {
        const [sLat, sLon] = sound.geotag.split(' ').map(Number);
        if (!isNaN(sLat) && !isNaN(sLon)) {
          setCurrentDistance(getDistance(location.lat, location.lon, sLat, sLon));
        } else {
          setCurrentDistance(null);
        }
      } else {
        setCurrentDistance(null);
      }

      // Calculate when to play the next sound
      // If duration is available, overlap by 4 seconds (4000ms)
      // Otherwise fallback to 45 seconds
      const durationMs = (sound.duration || 45) * 1000;
      const overlapMs = 4000;
      // Ensure we wait at least 1 second before switching, even for very short sounds
      const nextTimeMs = Math.max(1000, durationMs - overlapMs);

      const timeout = setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % sounds.length);
      }, nextTimeMs);

      return () => clearTimeout(timeout);
    }
  }, [isPlaying, sounds, currentIndex, playSound, location]);

  const handleNoiseVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setNoiseVolumeState(val);
    setNoiseVolume(val);
  };

  const handleManualLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      setLocation({ lat, lon });
      setError(null);
    } else {
      setError("Invalid coordinates. Lat must be -90 to 90, Lon must be -180 to 180.");
    }
  };

  const hasToken = !!import.meta.env.VITE_FREESOUND_TOKEN;

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-serif relative overflow-y-auto overflow-x-hidden">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 atmosphere pointer-events-none" />

      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 text-center py-12">
        <AnimatePresence mode="wait">
          {!hasToken ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md p-8 player-chrome border border-orange-500/20"
            >
              <Info className="w-12 h-12 mx-auto mb-4 text-orange-500" />
              <h2 className="text-2xl mb-4">API Key Required</h2>
              <p className="text-sm opacity-60 leading-relaxed mb-6">
                To hear the world, you need a Freesound API Token. 
                Add <code className="bg-white/5 px-1 rounded text-orange-300">VITE_FREESOUND_TOKEN</code> to your environment variables.
              </p>
              <a 
                href="https://freesound.org/help/developers/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-block px-6 py-2 rounded-full border border-orange-500/50 hover:bg-orange-500/10 transition-colors text-sm"
              >
                Get Token
              </a>
            </motion.div>
          ) : (
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
                  {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : 'Locating...'}
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
                        <div className="text-xl italic opacity-80 mb-2">
                          {currentSoundName}
                        </div>
                        {currentDistance !== null && (
                          <div className="text-xs uppercase tracking-widest opacity-50 text-orange-300">
                            Recorded {currentDistance < 1 ? `${Math.round(currentDistance * 1000)}m` : `${currentDistance.toFixed(1)}km`} away
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

                <button
                  onClick={() => setShowControls(!showControls)}
                  className="mx-auto flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
                >
                  <Settings className="w-3 h-3" />
                  {showControls ? 'Hide Controls' : 'Show Controls'}
                </button>

                <AnimatePresence>
                  {showControls && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-8 flex flex-col gap-8 border-t border-white/10 mt-6">
                        {/* Manual Location Input */}
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-[10px] uppercase tracking-widest opacity-60">Location</span>
                          <form onSubmit={handleManualLocationSubmit} className="flex flex-col gap-3 items-center">
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                value={manualLat} 
                                onChange={e => setManualLat(e.target.value)} 
                                placeholder="Latitude" 
                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm w-28 text-center focus:outline-none focus:border-orange-500/50 transition-colors"
                              />
                              <input 
                                type="text" 
                                value={manualLon} 
                                onChange={e => setManualLon(e.target.value)} 
                                placeholder="Longitude" 
                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm w-28 text-center focus:outline-none focus:border-orange-500/50 transition-colors"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" className="text-[10px] uppercase tracking-widest px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
                                Set
                              </button>
                              <button type="button" onClick={getGeoLocation} className="text-[10px] uppercase tracking-widest px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors flex items-center gap-2">
                                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> GPS
                              </button>
                            </div>
                          </form>
                        </div>

                        {/* Noise Volume Control */}
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-[10px] uppercase tracking-widest opacity-60">Noise Floor</span>
                          <div className="flex items-center gap-4 w-full max-w-xs mx-auto opacity-80 hover:opacity-100 transition-opacity">
                            <Volume2 className="w-4 h-4" />
                            <input 
                              type="range" 
                              min="0" 
                              max="0.2" 
                              step="0.001" 
                              value={noiseVolume} 
                              onChange={handleNoiseVolumeChange}
                              className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-orange-500"
                            />
                            <span className="text-xs w-8 text-right">{Math.round((noiseVolume / 0.2) * 100)}%</span>
                          </div>
                        </div>

                        {/* Explicit Sounds Toggle */}
                        <div className="flex items-center justify-center gap-3 opacity-80 hover:opacity-100 transition-opacity">
                          <ShieldAlert className="w-4 h-4" />
                          <span className="text-[10px] uppercase tracking-widest">Explicit Sounds</span>
                          <button
                            onClick={() => setIncludeExplicit(!includeExplicit)}
                            className={`w-10 h-5 rounded-full p-1 transition-colors flex items-center ${includeExplicit ? 'bg-orange-500' : 'bg-white/20'}`}
                          >
                            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${includeExplicit ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {/* CC0 Only Toggle */}
                        <div className="flex items-center justify-center gap-3 opacity-80 hover:opacity-100 transition-opacity">
                          <Copyright className="w-4 h-4" />
                          <span className="text-[10px] uppercase tracking-widest">No Attribution (CC0)</span>
                          <button
                            onClick={() => setCc0Only(!cc0Only)}
                            className={`w-10 h-5 rounded-full p-1 transition-colors flex items-center ${cc0Only ? 'bg-orange-500' : 'bg-white/20'}`}
                          >
                            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${cc0Only ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {error && (
                <div className="text-orange-500/80 text-sm italic mb-4">
                  {error}
                </div>
              )}

              {/* Recording Queue */}
              <AnimatePresence>
                {showControls && sounds.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-8 w-full max-w-md text-left overflow-hidden"
                  >
                    <h3 className="text-[10px] uppercase tracking-widest opacity-40 mb-4 px-4 flex items-center gap-2">
                      <ListMusic className="w-3 h-3" /> Recording Queue
                    </h3>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto px-4 pb-4 custom-scrollbar">
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
          )}
        </AnimatePresence>
      </main>

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
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #ff4e00;
          cursor: pointer;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
