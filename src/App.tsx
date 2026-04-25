/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Routes, Route, useNavigate, useLocation as useRouteLocation } from 'react-router-dom';
import { fetchLocalSounds, FreesoundResult } from './services/freesound';
import { useAudioEngine } from './components/AudioEngine';
import { useSettings } from './services/settings';
import { useMorphing } from './services/morphing';
import ImmersiveView from './components/ImmersiveView';
import ControlView from './components/ControlView';

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

export default function App() {
  const navigate = useNavigate();
  const routeLocation = useRouteLocation();
  
  // Extract lang from path for persistent navigation
  const langMatch = routeLocation.pathname.match(/^\/(ru|en)/);
  const langPrefix = langMatch ? langMatch[0] : '';

  const { settings, updateSetting, batchUpdate, userPresets, savePreset, loadPreset, deletePreset } = useSettings();

  useEffect(() => {
    const isRu = routeLocation.pathname.startsWith('/ru');
    document.title = isRu ? 'Эхолокус' : 'Echolocus';
  }, [routeLocation.pathname]);

  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [sounds, setSounds] = useState<FreesoundResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [echoMultiplier, setEchoMultiplier] = useState(1.0);
  const [echoCount, setEchoCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get('lat') || '');
    const lon = parseFloat(params.get('lon') || '');
    const r = parseInt(params.get('r') || '', 10);

    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      setLocation({ lat, lon });
    }
    
    if (!isNaN(r) && r > 0) {
      batchUpdate({ searchRadius: r });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { isPlaying, togglePlay, playSound, prepareSound, currentSoundName, isRecording, startRecording, stopRecording, dimCurrentSound, getSmoothedRms, soundStatus } = useAudioEngine(settings);

  useMorphing(settings, batchUpdate, settings.morphingEnabled && isPlaying);

  const getGeoLocation = useCallback(() => {
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLoading(false);
        window.umami?.track('location-update-gps', { lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        const msg = 'Could not get location. Please enable GPS.';
        setError(msg);
        setLoading(false);
        window.umami?.track('error', { type: 'geolocation', message: err.message });
      }
    );
  }, []);

  useEffect(() => {
    if (location) {
      setManualLat(location.lat.toFixed(6));
      setManualLon(location.lon.toFixed(6));
    } else {
      setManualLat('');
      setManualLon('');
    }
  }, [location]);

  const { searchRadius, includeExplicit, cc0Only } = settings;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (location) {
      url.searchParams.set('lat', location.lat.toFixed(6));
      url.searchParams.set('lon', location.lon.toFixed(6));
    } else {
      url.searchParams.delete('lat');
      url.searchParams.delete('lon');
    }
    url.searchParams.set('r', searchRadius.toString());
    window.history.replaceState(null, '', url.toString());
  }, [location, searchRadius, routeLocation.pathname]);

  useEffect(() => {
    if (location) {
      fetchLocalSounds(location.lat, location.lon, searchRadius, includeExplicit, cc0Only).then((results) => {
        setSounds(results);
        setCurrentIndex(0);
        if (results.length === 0) {
          const msg = 'No sounds found in this area. Try a different location?';
          setError(msg);
          window.umami?.track('error', { type: 'no-sounds', lat: location.lat, lon: location.lon, radius: searchRadius });
        } else {
          setError(null);
          window.umami?.track('sounds-fetched', { count: results.length, lat: location.lat, lon: location.lon, radius: searchRadius });
        }
      });
    }
  }, [location, searchRadius, includeExplicit, cc0Only]);

  const { crossfadeDuration } = settings;
  useEffect(() => {
    if (isPlaying && sounds.length > 0) {
      const sound = sounds[currentIndex];
      const isVeryShort = (sound.duration || 45) < 10;
      playSound(sound.previews['preview-hq-mp3'], sound.name, echoMultiplier, isVeryShort);

      // PRE-LOAD NEXT SOUND
      const nextIdx = (currentIndex + 1) % sounds.length;
      const nextSound = sounds[nextIdx];
      if (nextSound) {
        prepareSound(nextSound.previews['preview-hq-mp3'], nextSound.name);
      }

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

      const durationMs = (sound.duration || 45) * 1000;
      const overlapMs = crossfadeDuration * 1000;
      const MAX_PLAY_MS = 60_000;
      const SHORT_MS = 15_000;
      const isLong = durationMs > MAX_PLAY_MS;
      const isShort = durationMs < SHORT_MS;
      const effectiveDurationMs = isLong ? MAX_PLAY_MS : durationMs;
      const nextTimeMs = Math.max(1000, effectiveDurationMs - overlapMs);

      let dimTimeout: ReturnType<typeof setTimeout> | null = null;
      if (isLong) {
        dimTimeout = setTimeout(() => dimCurrentSound(0.25), nextTimeMs);
      }

      const timeout = setTimeout(() => {
        const ECHO_DECAY = 0.35;
        const MAX_ECHOES = 3;
        const ECHO_CHANCE = 0.6;

        if (isShort && echoCount === 0 && Math.random() < ECHO_CHANCE) {
          setEchoMultiplier(ECHO_DECAY);
          setEchoCount(1);
          window.umami?.track('echo-triggered', { count: 1 });
        } else if (echoCount > 0 && echoCount < MAX_ECHOES && echoMultiplier * ECHO_DECAY > 0.04) {
          setEchoMultiplier(echoMultiplier * ECHO_DECAY);
          setEchoCount(echoCount + 1);
          window.umami?.track('echo-triggered', { count: echoCount + 1 });
        } else {
          setEchoMultiplier(1.0);
          setEchoCount(0);
          setCurrentIndex((prev: number) => (prev + 1) % sounds.length);
        }
      }, nextTimeMs);

      return () => {
        clearTimeout(timeout);
        if (dimTimeout) clearTimeout(dimTimeout);
      };
    }
  }, [isPlaying, sounds, currentIndex, echoMultiplier, echoCount, playSound, dimCurrentSound, location, crossfadeDuration]);

  const applyManualLocation = useCallback(() => {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      setLocation({ lat, lon });
      setError(null);
      window.umami?.track('location-update-manual', { lat, lon });
    } else {
      const msg = 'Invalid coordinates. Lat must be -90 to 90, Lon must be -180 to 180.';
      setError(msg);
      window.umami?.track('error', { type: 'invalid-coords', lat: manualLat, lon: manualLon });
    }
  }, [manualLat, manualLon]);

  const handleBegin = useCallback((preset?: { lat: number; lon: number }) => {
    window.umami?.track('begin-experience', { preset: !!preset });
    if (preset) {
      setLocation(preset);
    } else if (!location) {
      getGeoLocation();
    }
    togglePlay();
  }, [getGeoLocation, togglePlay, location]);

  const hasToken = !!import.meta.env.VITE_FREESOUND_TOKEN;

  if (!hasToken) {
    return (
      <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-serif flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md p-8 rounded-[40px] border border-orange-500/20 bg-orange-500/5 text-center"
        >
          <h2 className="text-2xl mb-4">API Key Required</h2>
          <p className="text-sm opacity-60 leading-relaxed mb-6">
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
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <Routes location={routeLocation} key={routeLocation.pathname}>
        {['/', '/:lang/'].map((path) => (
          <Route key={path} path={path} element={
            <motion.div key="immersive" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ImmersiveView
                settings={settings}
                batchUpdate={batchUpdate}
                isPlaying={isPlaying}
                onBegin={handleBegin}
                onResetLocation={() => setLocation(null)}
                loading={loading}
                error={error}
                location={location}
                onSwitchToControl={() => navigate(`${langPrefix}/control`)}
                getSmoothedRms={getSmoothedRms}
                soundStatus={soundStatus}
                isRecording={isRecording}
                startRecording={() => startRecording('mp3')}
                stopRecording={stopRecording}
              />
            </motion.div>
          } />
        ))}
        {['/control', '/:lang/control'].map((path) => (
          <Route key={path} path={path} element={
            <motion.div key="control" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ControlView
                settings={settings}
                updateSetting={updateSetting}
                userPresets={userPresets}
                onSavePreset={(name) => savePreset(name, settings)}
                onLoadPreset={loadPreset}
                onDeletePreset={deletePreset}
                location={location}
                sounds={sounds}
                currentIndex={currentIndex}
                setCurrentIndex={setCurrentIndex}
                isPlaying={isPlaying}
                togglePlay={togglePlay}
                currentSoundName={currentSoundName}
                currentDistance={currentDistance}
                isRecording={isRecording}
                startRecording={() => startRecording('webm')}
                stopRecording={stopRecording}
                loading={loading}
                error={error}
                manualLat={manualLat}
                manualLon={manualLon}
                setManualLat={setManualLat}
                setManualLon={setManualLon}
                onSetManualLocation={applyManualLocation}
                onGetGPS={getGeoLocation}
                onBack={() => navigate(langPrefix || '/')}
              />
            </motion.div>
          } />
        ))}
      </Routes>
    </AnimatePresence>
  );
}
