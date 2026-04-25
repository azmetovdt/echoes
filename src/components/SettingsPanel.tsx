/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { X, MapPin, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import type { AudioSettings } from '../services/settings';
import { BUILTIN_PRESETS } from '../services/settings';

interface Props {
  settings: AudioSettings;
  updateSetting: <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => void;
  userPresets: Record<string, AudioSettings>;
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: AudioSettings) => void;
  onDeletePreset: (name: string) => void;
  onClose: () => void;
  manualLat: string;
  manualLon: string;
  setManualLat: (v: string) => void;
  setManualLon: (v: string) => void;
  onSetManualLocation: () => void;
  onGetGPS: () => void;
  gpsLoading: boolean;
}

function Slider({
  label, value, min, max, step, unit = '', onChange,
}: {
  label: string; value: number; min: number; max: number;
  step: number; unit?: string; onChange: (v: number) => void;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const dp = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-widest opacity-50">{label}</span>
        <span className="text-[11px] font-mono opacity-60 tabular-nums">
          {value.toFixed(dp)}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #f97316 ${pct}%, rgba(255,255,255,0.12) ${pct}%)`,
        }}
      />
    </div>
  );
}

function Toggle({
  label, value, onChange,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[10px] uppercase tracking-widest opacity-50">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-9 h-[18px] rounded-full p-0.5 transition-colors flex items-center ${value ? 'bg-orange-500' : 'bg-white/20'}`}
      >
        <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mt-6 mb-3">
      <span className="text-[9px] uppercase tracking-[0.2em] text-orange-400/60 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-orange-500/15" />
    </div>
  );
}

export default function SettingsPanel({
  settings, updateSetting, userPresets,
  onSavePreset, onLoadPreset, onDeletePreset, onClose,
  manualLat, manualLon, setManualLat, setManualLon,
  onSetManualLocation, onGetGPS, gpsLoading,
}: Props) {
  const [newPresetName, setNewPresetName] = useState('');

  const handleSavePreset = () => {
    const name = newPresetName.trim();
    if (name) {
      onSavePreset(name);
      setNewPresetName('');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
        className="fixed top-0 right-0 h-full w-full max-w-xs z-50 bg-[#0c0603] border-l border-white/5 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-[10px] uppercase tracking-[0.3em] opacity-40">Settings</span>
            <button onClick={onClose} className="opacity-30 hover:opacity-80 transition-opacity p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Presets ── */}
          <SectionDivider label="Presets" />

          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(BUILTIN_PRESETS).map(([name, preset]) => (
              <button
                key={name}
                onClick={() => onLoadPreset(preset)}
                className="text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 hover:border-orange-500/50 hover:bg-orange-500/10 transition-all"
              >
                {name}
              </button>
            ))}
          </div>

          {Object.keys(userPresets).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(userPresets).map(([name, preset]) => (
                <div key={name} className="flex items-center gap-1 text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-orange-500/30 bg-orange-500/5">
                  <button onClick={() => onLoadPreset(preset)} className="hover:text-orange-300 transition-colors">{name}</button>
                  <button onClick={() => onDeletePreset(name)} className="opacity-30 hover:opacity-100 transition-opacity ml-0.5">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
              placeholder="Save as..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-orange-500/40 transition-colors placeholder:opacity-25"
            />
            <button
              onClick={handleSavePreset}
              disabled={!newPresetName.trim()}
              className="text-[9px] uppercase tracking-widest px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg transition-colors disabled:opacity-25"
            >
              Save
            </button>
          </div>

          {/* ── Playback ── */}
          <SectionDivider label="Playback" />
          <Slider label="Crossfade" value={settings.crossfadeDuration} min={1} max={15} step={0.5} unit="s"
            onChange={v => updateSetting('crossfadeDuration', v)} />
          <Slider label="Sound Volume" value={settings.soundVolume} min={0.1} max={1.5} step={0.05}
            onChange={v => updateSetting('soundVolume', v)} />
          <Slider label="Search Radius" value={settings.searchRadius} min={1} max={100} step={1} unit=" km"
            onChange={v => updateSetting('searchRadius', v)} />

          {/* Location */}
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text" value={manualLat} onChange={e => setManualLat(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSetManualLocation()}
                placeholder="Latitude"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-center focus:outline-none focus:border-orange-500/40 transition-colors placeholder:opacity-25"
              />
              <input
                type="text" value={manualLon} onChange={e => setManualLon(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSetManualLocation()}
                placeholder="Longitude"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-center focus:outline-none focus:border-orange-500/40 transition-colors placeholder:opacity-25"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={onSetManualLocation}
                className="flex-1 text-[9px] uppercase tracking-widest py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <MapPin className="w-3 h-3" /> Set
              </button>
              <button
                onClick={onGetGPS}
                className="flex-1 text-[9px] uppercase tracking-widest py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${gpsLoading ? 'animate-spin' : ''}`} /> GPS
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-0.5">
            <Toggle label="Explicit Sounds" value={settings.includeExplicit}
              onChange={v => updateSetting('includeExplicit', v)} />
            <Toggle label="CC0 Only" value={settings.cc0Only}
              onChange={v => updateSetting('cc0Only', v)} />
            <Toggle label="Morphing" value={settings.morphingEnabled}
              onChange={v => updateSetting('morphingEnabled', v)} />
          </div>

          {/* ── Noise Floor ── */}
          <SectionDivider label="Noise Floor" />
          <Slider label="Volume" value={settings.noiseVolume} min={0} max={0.2} step={0.001}
            onChange={v => updateSetting('noiseVolume', v)} />
          <Slider label="Filter Cutoff" value={settings.noiseFilterFreq} min={100} max={8000} step={10} unit=" Hz"
            onChange={v => updateSetting('noiseFilterFreq', v)} />
          <Slider label="Filter Resonance" value={settings.noiseFilterQ} min={0.1} max={10} step={0.1}
            onChange={v => updateSetting('noiseFilterQ', v)} />
          <Slider label="Tremolo Rate" value={settings.tremoloFreq} min={0.1} max={10} step={0.05} unit=" Hz"
            onChange={v => updateSetting('tremoloFreq', v)} />
          <Slider label="Tremolo Depth" value={settings.tremoloDepth} min={0} max={1} step={0.01}
            onChange={v => updateSetting('tremoloDepth', v)} />
          <Slider label="Reverb Send" value={settings.noiseReverbSend} min={0} max={1} step={0.01}
            onChange={v => updateSetting('noiseReverbSend', v)} />
          <Slider label="LFO 2 Rate" value={settings.noiseLfo2Freq} min={0.1} max={20} step={0.1} unit=" Hz"
            onChange={v => updateSetting('noiseLfo2Freq', v)} />
          <Slider label="LFO 2 Depth" value={settings.noiseLfo2Depth} min={0} max={1} step={0.01}
            onChange={v => updateSetting('noiseLfo2Depth', v)} />
          <Slider label="Reactive Gain" value={settings.reactiveGainSensitivity} min={0} max={20} step={0.5}
            onChange={v => updateSetting('reactiveGainSensitivity', v)} />
          <Slider label="Filter Reactivity" value={settings.noiseFilterSensitivity} min={0} max={40000} step={500} unit=" Hz"
            onChange={v => updateSetting('noiseFilterSensitivity', v)} />
          <Slider label="Tremolo Reactivity" value={settings.tremoloSensitivity} min={0} max={150} step={5} unit=" Hz"
            onChange={v => updateSetting('tremoloSensitivity', v)} />

          {/* ── Reverb ── */}
          <SectionDivider label="Reverb" />
          <Slider label="Gain" value={settings.reverbGain} min={0} max={3} step={0.05}
            onChange={v => updateSetting('reverbGain', v)} />
          <Slider label="Duration" value={settings.reverbDuration} min={1} max={10} step={0.5} unit="s"
            onChange={v => updateSetting('reverbDuration', v)} />
          <Slider label="Decay" value={settings.reverbDecay} min={0.5} max={8} step={0.1}
            onChange={v => updateSetting('reverbDecay', v)} />

          {/* ── Echo / Delay ── */}
          <SectionDivider label="Echo / Delay" />
          <Slider label="Delay Time" value={settings.delayTime} min={0} max={2} step={0.05} unit="s"
            onChange={v => updateSetting('delayTime', v)} />
          <Slider label="Feedback" value={settings.delayFeedback} min={0} max={0.9} step={0.01}
            onChange={v => updateSetting('delayFeedback', v)} />

          {/* ── Radio Filter ── */}
          <SectionDivider label="Radio Filter" />
          <Toggle label="Enabled" value={settings.radioFilterEnabled}
            onChange={v => updateSetting('radioFilterEnabled', v)} />
          <Slider label="Frequency" value={settings.radioFilterFreq} min={200} max={4000} step={10} unit=" Hz"
            onChange={v => updateSetting('radioFilterFreq', v)} />
          <Slider label="Resonance" value={settings.radioFilterQ} min={0.1} max={10} step={0.1}
            onChange={v => updateSetting('radioFilterQ', v)} />
          <Slider label="LFO Rate" value={settings.lfoFreq} min={0.01} max={2} step={0.01} unit=" Hz"
            onChange={v => updateSetting('lfoFreq', v)} />
          <Slider label="LFO Depth" value={settings.lfoDepth} min={0} max={2000} step={10} unit=" Hz"
            onChange={v => updateSetting('lfoDepth', v)} />
          <Slider label="Dry Gain" value={settings.dryGain} min={0} max={1} step={0.01}
            onChange={v => updateSetting('dryGain', v)} />

          <div className="h-10" />
        </div>
      </motion.div>
    </>
  );
}
