/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

export interface AudioSettings {
  // Playback
  crossfadeDuration: number;   // seconds, controls both fade and overlap timing
  soundVolume: number;         // 0.1–1.5
  searchRadius: number;        // km
  includeExplicit: boolean;
  cc0Only: boolean;
  // Noise floor
  noiseVolume: number;         // 0–0.2
  noiseFilterFreq: number;     // Hz, base cutoff (reactivity modulates up from here)
  noiseFilterQ: number;
  tremoloFreq: number;         // Hz, base rate (reactivity modulates up from here)
  tremoloDepth: number;        // 0–1, tremolo modulator gain
  noiseReverbSend: number;     // 0–1
  // Reverb
  reverbGain: number;          // 0–3
  reverbDuration: number;      // seconds, impulse length
  reverbDecay: number;         // impulse decay exponent
  // Echo / Delay
  delayTime: number;           // 0–2 seconds
  delayFeedback: number;       // 0–0.9
  // Radio bandpass filter + LFO
  radioFilterEnabled: boolean;
  radioFilterFreq: number;     // Hz
  radioFilterQ: number;
  lfoFreq: number;             // Hz, LFO rate
  lfoDepth: number;            // Hz, LFO frequency modulation depth
  dryGain: number;             // 0–1, direct (post-filter) output
  // Second noise tremolo LFO (beating with first)
  noiseLfo2Freq: number;
  noiseLfo2Depth: number;
  // Reactivity
  reactiveGainSensitivity: number;   // gain swell multiplier (env * this)
  noiseFilterSensitivity: number;    // Hz shift per unit env
  tremoloSensitivity: number;        // Hz shift per unit env
  // Morphing
  morphingEnabled: boolean;
}

export const DEFAULT_SETTINGS: AudioSettings = {
  crossfadeDuration: 3,
  soundVolume: 1,
  searchRadius: 10,
  includeExplicit: false,
  cc0Only: false,
  noiseVolume: 0.056,
  noiseFilterFreq: 1600,
  noiseFilterQ: 0.9,
  tremoloFreq: 2.25,
  tremoloDepth: 0.11,
  noiseReverbSend: 1,
  reverbGain: 2.2,
  reverbDuration: 4.5,
  reverbDecay: 2,
  delayTime: 0.24,
  delayFeedback: 0.82,
  radioFilterEnabled: true,
  radioFilterFreq: 2000,
  radioFilterQ: 4,
  lfoFreq: 0.3,
  lfoDepth: 1600,
  dryGain: 1,
  noiseLfo2Freq: 3.3,
  noiseLfo2Depth: 0,
  reactiveGainSensitivity: 2.5,
  noiseFilterSensitivity: 8000,
  tremoloSensitivity: 150,
  morphingEnabled: true,
};

export const BUILTIN_PRESETS: Record<string, AudioSettings> = {
  Default: { ...DEFAULT_SETTINGS },
  'Deep Space': {
    ...DEFAULT_SETTINGS,
    reverbGain: 2.8,
    reverbDuration: 9,
    reverbDecay: 6,
    delayTime: 1.6,
    delayFeedback: 0.72,
    noiseVolume: 0.08,
    tremoloFreq: 0.15,
    tremoloDepth: 0.6,
    dryGain: 0.35,
    radioFilterFreq: 900,
    radioFilterQ: 2.5,
    lfoFreq: 0.03,
    lfoDepth: 300,
  },
  'Old Radio': {
    ...DEFAULT_SETTINGS,
    radioFilterFreq: 800,
    radioFilterQ: 3.5,
    lfoFreq: 0.2,
    lfoDepth: 700,
    noiseVolume: 0.12,
    dryGain: 0.55,
    reverbGain: 0.7,
    delayFeedback: 0.25,
    delayTime: 0.4,
    crossfadeDuration: 3,
  },
  'Ambient Field': {
    ...DEFAULT_SETTINGS,
    noiseVolume: 0.015,
    reverbGain: 0.9,
    reverbDuration: 3.5,
    reverbDecay: 2.5,
    delayTime: 0.3,
    delayFeedback: 0.25,
    radioFilterFreq: 2500,
    radioFilterQ: 0.7,
    dryGain: 1.0,
    soundVolume: 0.9,
    lfoDepth: 100,
    noiseFilterFreq: 200,
  },
  'Static Veil': {
    ...DEFAULT_SETTINGS,
    // Sounds come through like distant radio signals
    soundVolume: 0.45,
    crossfadeDuration: 3,
    radioFilterFreq: 1800,
    radioFilterQ: 3.5,
    lfoFreq: 0.9,
    lfoDepth: 1400,
    dryGain: 0.28,
    // Dense echo cloud
    delayTime: 0.24,
    delayFeedback: 0.82,
    // Long, spacious reverb
    reverbGain: 2.4,
    reverbDuration: 8,
    reverbDecay: 3.5,
    // Heavy, buzzing noise floor
    noiseVolume: 0.14,
    noiseFilterFreq: 1600,
    noiseFilterQ: 0.9,
    tremoloFreq: 8.0,       // fast AM buzz — characteristic radio static
    tremoloDepth: 0.75,
    noiseLfo2Freq: 12.3,    // beating with primary: 4.3 Hz modulation envelope
    noiseLfo2Depth: 0.55,
    noiseReverbSend: 0.75,
    // Reactivity — now works correctly (analyser reads pre-filter signal)
    reactiveGainSensitivity: 7,
    noiseFilterSensitivity: 18000,
    tremoloSensitivity: 50,
  },
};

const STORAGE_KEY = 'echoes-settings-v1';
const PRESETS_KEY = 'echoes-user-presets-v1';

function loadSettings(): AudioSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function loadUserPresets(): Record<string, AudioSettings> {
  try {
    const saved = localStorage.getItem(PRESETS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
}

export function useSettings() {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);
  const [userPresets, setUserPresets] = useState<Record<string, AudioSettings>>(loadUserPresets);

  const updateSetting = useCallback(<K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const batchUpdate = useCallback((updates: Partial<AudioSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const savePreset = useCallback((name: string, current: AudioSettings) => {
    setUserPresets(prev => {
      const next = { ...prev, [name]: current };
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const loadPreset = useCallback((preset: AudioSettings) => {
    setSettings(preset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
  }, []);

  const deletePreset = useCallback((name: string) => {
    setUserPresets(prev => {
      const next = { ...prev };
      delete next[name];
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSetting, batchUpdate, userPresets, savePreset, loadPreset, deletePreset };
}
