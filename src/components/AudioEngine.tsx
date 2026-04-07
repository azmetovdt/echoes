/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { AudioSettings } from '../services/settings';

function createSpacetimeImpulse(audioCtx: AudioContext, duration: number, decay: number) {
  const length = audioCtx.sampleRate * duration;
  const impulse = audioCtx.createBuffer(2, length, audioCtx.sampleRate);
  for (let i = 0; i < 2; i++) {
    const channel = impulse.getChannelData(i);
    for (let j = 0; j < length; j++) {
      channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
    }
  }
  return impulse;
}

export function useAudioEngine(settings: AudioSettings) {
  const audioCtx = useRef<AudioContext | null>(null);
  const currentSource = useRef<AudioBufferSourceNode | null>(null);
  const currentGain = useRef<GainNode | null>(null);

  // Refs for all controllable nodes
  const noiseGainRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const convolverGainRef = useRef<GainNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const delayFeedbackRef = useRef<GainNode | null>(null);
  const radioFilterRef = useRef<BiquadFilterNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const dryRadioGainRef = useRef<GainNode | null>(null);
  const noiseFilterRef = useRef<BiquadFilterNode | null>(null);
  const noiseTremoloRef = useRef<OscillatorNode | null>(null);
  const tremoloModRef = useRef<GainNode | null>(null);
  const noiseReverbSendRef = useRef<GainNode | null>(null);
  const reactiveGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const smoothedRmsRef = useRef<number>(0);

  // Always-current settings ref to avoid stale closures in callbacks/rAF
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSoundName, setCurrentSoundName] = useState<string | null>(null);

  // Sync all AudioParams whenever settings change
  useEffect(() => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    noiseGainRef.current?.gain.setTargetAtTime(settings.noiseVolume, t, 0.05);
    convolverGainRef.current?.gain.setTargetAtTime(settings.reverbGain, t, 0.1);
    delayRef.current?.delayTime.setTargetAtTime(settings.delayTime, t, 0.1);
    delayFeedbackRef.current?.gain.setTargetAtTime(settings.delayFeedback, t, 0.1);
    if (radioFilterRef.current) {
      radioFilterRef.current.frequency.setTargetAtTime(settings.radioFilterFreq, t, 0.05);
      radioFilterRef.current.Q.setTargetAtTime(settings.radioFilterQ, t, 0.05);
    }
    lfoRef.current?.frequency.setTargetAtTime(settings.lfoFreq, t, 0.1);
    lfoGainRef.current?.gain.setTargetAtTime(settings.lfoDepth, t, 0.1);
    dryRadioGainRef.current?.gain.setTargetAtTime(settings.dryGain, t, 0.05);
    if (noiseFilterRef.current) {
      noiseFilterRef.current.frequency.setTargetAtTime(settings.noiseFilterFreq, t, 0.05);
      noiseFilterRef.current.Q.setTargetAtTime(settings.noiseFilterQ, t, 0.05);
    }
    noiseTremoloRef.current?.frequency.setTargetAtTime(settings.tremoloFreq, t, 0.05);
    tremoloModRef.current?.gain.setTargetAtTime(settings.tremoloDepth, t, 0.05);
    noiseReverbSendRef.current?.gain.setTargetAtTime(settings.noiseReverbSend, t, 0.05);
  }, [settings]);

  // Regenerate reverb impulse when duration or decay changes
  useEffect(() => {
    const ctx = audioCtx.current;
    if (!ctx || !convolverRef.current) return;
    convolverRef.current.buffer = createSpacetimeImpulse(ctx, settings.reverbDuration, settings.reverbDecay);
  }, [settings.reverbDuration, settings.reverbDecay]);

  const updateReactivity = useCallback(() => {
    if (!isPlayingRef.current || !analyserRef.current || !audioCtx.current) return;
    const analyser = analyserRef.current;
    const ctx = audioCtx.current;

    const dataArray = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) sumSquares += dataArray[i] * dataArray[i];
    const rms = Math.sqrt(sumSquares / dataArray.length);

    smoothedRmsRef.current = smoothedRmsRef.current * 0.85 + rms * 0.15;
    const env = smoothedRmsRef.current;

    // Modulate noise filter upward from the user's base frequency
    if (noiseFilterRef.current) {
      const baseFreq = settingsRef.current.noiseFilterFreq;
      noiseFilterRef.current.frequency.setTargetAtTime(
        Math.min(baseFreq + env * 10000, 8000), ctx.currentTime, 0.05
      );
    }

    // Modulate tremolo rate upward from the user's base rate
    if (noiseTremoloRef.current) {
      const baseRate = settingsRef.current.tremoloFreq;
      noiseTremoloRef.current.frequency.setTargetAtTime(
        Math.min(baseRate + env * 40, 20), ctx.currentTime, 0.05
      );
    }

    // Reactive gain swell
    if (reactiveGainRef.current) {
      const targetGain = 1.0 + env * 4;
      reactiveGainRef.current.gain.setTargetAtTime(Math.min(targetGain, 4.0), ctx.currentTime, 0.05);
    }

    animationFrameRef.current = requestAnimationFrame(updateReactivity);
  }, []);

  const initAudio = useCallback(() => {
    if (audioCtx.current) return;
    audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx.current;
    const s = settingsRef.current;

    // --- 1. Reverb (Convolver) ---
    const convolver = ctx.createConvolver();
    convolver.buffer = createSpacetimeImpulse(ctx, s.reverbDuration, s.reverbDecay);
    convolverRef.current = convolver;

    const convolverGain = ctx.createGain();
    convolverGain.gain.value = s.reverbGain;
    convolverGainRef.current = convolverGain;
    convolver.connect(convolverGain);
    convolverGain.connect(ctx.destination);

    // --- 2. Echo (Delay) ---
    const delay = ctx.createDelay(5.0);
    delay.delayTime.value = s.delayTime;
    delayRef.current = delay;

    const feedback = ctx.createGain();
    feedback.gain.value = s.delayFeedback;
    delayFeedbackRef.current = feedback;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(convolver);

    // --- 3. Radio Bandpass Filter + LFO ---
    const radioFilter = ctx.createBiquadFilter();
    radioFilter.type = 'bandpass';
    radioFilter.frequency.value = s.radioFilterFreq;
    radioFilter.Q.value = s.radioFilterQ;
    radioFilterRef.current = radioFilter;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = s.lfoFreq;
    lfoRef.current = lfo;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = s.lfoDepth;
    lfoGainRef.current = lfoGain;
    lfo.connect(lfoGain);
    lfoGain.connect(radioFilter.frequency);
    lfo.start();

    // --- Analyser (reads post-filter signal for reactivity) ---
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyserRef.current = analyser;
    radioFilter.connect(analyser);

    // Route radio filter: dry output + delay send + reverb send
    const dryRadioGain = ctx.createGain();
    dryRadioGain.gain.value = s.dryGain;
    dryRadioGainRef.current = dryRadioGain;
    radioFilter.connect(dryRadioGain);
    dryRadioGain.connect(ctx.destination);
    radioFilter.connect(delay);
    radioFilter.connect(convolver);

    // --- 4. Pink Noise + Crackle ---
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616  * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      output[i] *= 0.11;
      b6 = white * 0.115926;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const crackleBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const crackleOutput = crackleBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      crackleOutput[i] = Math.random() < 0.0005 ? (Math.random() * 2 - 1) : 0;
    }
    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleBuffer;
    crackle.loop = true;

    const noiseCombiner = ctx.createGain();
    noiseCombiner.gain.value = 1.0;
    noise.connect(noiseCombiner);
    crackle.connect(noiseCombiner);

    // Reactive lowpass (opens when radio is loud)
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = s.noiseFilterFreq;
    noiseFilter.Q.value = s.noiseFilterQ;
    noiseFilterRef.current = noiseFilter;
    noiseCombiner.connect(noiseFilter);

    // Tremolo
    const tremoloBase = ctx.createGain();
    tremoloBase.gain.value = 0.6;
    noiseFilter.connect(tremoloBase);

    const tremoloLfo = ctx.createOscillator();
    tremoloLfo.type = 'sine';
    tremoloLfo.frequency.value = s.tremoloFreq;
    noiseTremoloRef.current = tremoloLfo;

    const tremoloModulator = ctx.createGain();
    tremoloModulator.gain.value = s.tremoloDepth;
    tremoloModRef.current = tremoloModulator;
    tremoloLfo.connect(tremoloModulator);
    tremoloModulator.connect(tremoloBase.gain);

    // Reactive gain (swells with signal)
    const reactiveGain = ctx.createGain();
    reactiveGain.gain.value = 1.0;
    reactiveGainRef.current = reactiveGain;
    tremoloBase.connect(reactiveGain);

    // User-controlled noise volume
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = s.noiseVolume;
    noiseGainRef.current = noiseGain;
    reactiveGain.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // Send noise into reverb
    const noiseReverbSend = ctx.createGain();
    noiseReverbSend.gain.value = s.noiseReverbSend;
    noiseReverbSendRef.current = noiseReverbSend;
    noiseGain.connect(noiseReverbSend);
    noiseReverbSend.connect(convolver);

    noise.start();
    crackle.start();
    tremoloLfo.start();
  }, []);

  const playSound = useCallback(async (url: string, name: string) => {
    if (!audioCtx.current) return;
    if (audioCtx.current.state === 'suspended') await audioCtx.current.resume();

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch audio: ${response.statusText}`);
      const audioData = await response.arrayBuffer();
      const buffer = await audioCtx.current.decodeAudioData(audioData);

      // Normalize to prevent clipping
      let peak = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          const abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak > 0) {
        const multiplier = 0.95 / peak;
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const data = buffer.getChannelData(c);
          for (let i = 0; i < data.length; i++) data[i] *= multiplier;
        }
      }

      const source = audioCtx.current.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = audioCtx.current.createGain();
      gain.gain.setValueAtTime(0.001, audioCtx.current.currentTime);
      source.connect(gain);

      if (radioFilterRef.current) {
        gain.connect(radioFilterRef.current);
      } else {
        gain.connect(audioCtx.current.destination);
      }

      const now = audioCtx.current.currentTime;
      const fadeTime = settingsRef.current.crossfadeDuration;
      const targetVol = settingsRef.current.soundVolume;

      if (currentGain.current) {
        currentGain.current.gain.cancelScheduledValues(now);
        currentGain.current.gain.setValueAtTime(currentGain.current.gain.value || targetVol, now);
        currentGain.current.gain.exponentialRampToValueAtTime(0.001, now + fadeTime);
        const oldSource = currentSource.current;
        setTimeout(() => { try { oldSource?.stop(); } catch (_) {} }, fadeTime * 1000 + 100);
      }

      gain.gain.exponentialRampToValueAtTime(targetVol, now + fadeTime);
      source.start();

      currentSource.current = source;
      currentGain.current = gain;
      setCurrentSoundName(name);
    } catch (e) {
      console.error('Audio playback error:', e);
    }
  }, []);

  const togglePlay = useCallback(async () => {
    if (!isPlaying) {
      initAudio();
      if (audioCtx.current?.state === 'suspended') {
        await audioCtx.current.resume();
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      updateReactivity();
    } else {
      audioCtx.current?.suspend();
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isPlaying, initAudio, updateReactivity]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return { isPlaying, togglePlay, playSound, currentSoundName };
}
