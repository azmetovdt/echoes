/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { AudioSettings } from '../services/settings';

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}

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
  const noiseTremolo2Ref = useRef<OscillatorNode | null>(null);
  const tremoloMod2Ref = useRef<GainNode | null>(null);
  const noiseReverbSendRef = useRef<GainNode | null>(null);
  const reactiveGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterOutRef = useRef<GainNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const smoothedRmsRef = useRef<number>(0);

  // Always-current settings ref to avoid stale closures in callbacks/rAF
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [soundStatus, setSoundStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [currentSoundName, setCurrentSoundName] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Sync all AudioParams whenever settings change
  useEffect(() => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    const t = ctx.currentTime + 0.02; // Small offset to avoid scheduling in the past

    const setParam = (param: AudioParam | undefined, val: number, tc: number) => {
      if (!param) return;
      param.cancelScheduledValues(t);
      param.setTargetAtTime(val, t, tc);
    };

    setParam(noiseGainRef.current?.gain, settings.noiseVolume, 0.05);
    setParam(convolverGainRef.current?.gain, settings.reverbGain, 0.1);
    setParam(delayRef.current?.delayTime, settings.delayTime, 0.1);
    setParam(delayFeedbackRef.current?.gain, settings.delayFeedback, 0.1);
    
    if (radioFilterRef.current) {
      setParam(radioFilterRef.current.frequency, settings.radioFilterFreq, 0.05);
      setParam(radioFilterRef.current.Q, settings.radioFilterQ, 0.05);
    }
    
    setParam(lfoRef.current?.frequency, settings.lfoFreq, 0.1);
    setParam(lfoGainRef.current?.gain, settings.lfoDepth, 0.1);
    setParam(dryRadioGainRef.current?.gain, settings.dryGain, 0.05);
    
    if (noiseFilterRef.current) {
      setParam(noiseFilterRef.current.frequency, settings.noiseFilterFreq, 0.05);
      setParam(noiseFilterRef.current.Q, settings.noiseFilterQ, 0.05);
    }
    
    setParam(noiseTremoloRef.current?.frequency, settings.tremoloFreq, 0.05);
    setParam(tremoloModRef.current?.gain, settings.tremoloDepth, 0.05);
    setParam(noiseTremolo2Ref.current?.frequency, settings.noiseLfo2Freq, 0.05);
    setParam(tremoloMod2Ref.current?.gain, settings.noiseLfo2Depth, 0.05);
    setParam(noiseReverbSendRef.current?.gain, settings.noiseReverbSend, 0.05);
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

    // Fast attack, slow release — snappy response to transients
    const alpha = rms > smoothedRmsRef.current ? 0.4 : 0.08;
    smoothedRmsRef.current = smoothedRmsRef.current * (1 - alpha) + rms * alpha;
    const env = smoothedRmsRef.current;

    const t = ctx.currentTime + 0.02;

    // Noise filter opens up when signal is loud
    if (noiseFilterRef.current) {
      const baseFreq = settingsRef.current.noiseFilterFreq;
      const sens = settingsRef.current.noiseFilterSensitivity;
      const param = noiseFilterRef.current.frequency;
      param.cancelScheduledValues(t);
      param.setTargetAtTime(Math.min(baseFreq + env * sens, 8000), t, 0.03);
    }

    // Tremolo rate increases — noise texture speeds up with signal
    if (noiseTremoloRef.current) {
      const baseRate = settingsRef.current.tremoloFreq;
      const sens = settingsRef.current.tremoloSensitivity;
      const param = noiseTremoloRef.current.frequency;
      param.cancelScheduledValues(t);
      param.setTargetAtTime(Math.min(baseRate + env * sens, 30), t, 0.03);
    }

    // Reactive gain swell
    if (reactiveGainRef.current) {
      const sens = settingsRef.current.reactiveGainSensitivity;
      const targetGain = 1.0 + env * sens;
      const param = reactiveGainRef.current.gain;
      param.cancelScheduledValues(t);
      param.setTargetAtTime(Math.min(targetGain, sens), t, 0.03);
    }

    animationFrameRef.current = requestAnimationFrame(updateReactivity);
  }, []);

  const initAudio = useCallback(() => {
    if (audioCtx.current) return;
    audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx.current;
    const s = settingsRef.current;

    // --- 1. Reverb (Convolver) ---
    const masterOut = ctx.createGain();
    masterOut.gain.value = 1.0;
    masterOutRef.current = masterOut;
    masterOut.connect(ctx.destination);

    const convolver = ctx.createConvolver();
    convolver.buffer = createSpacetimeImpulse(ctx, s.reverbDuration, s.reverbDecay);
    convolverRef.current = convolver;

    const convolverGain = ctx.createGain();
    convolverGain.gain.value = s.reverbGain;
    convolverGainRef.current = convolverGain;
    convolver.connect(convolverGain);
    convolverGain.connect(masterOut);

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

    // --- Analyser: reads PRE-filter signal so env reflects actual sound level ---
    // Connected to each sound's gain node inside playSound()
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyserRef.current = analyser;

    // Route radio filter: dry output + delay send + reverb send
    const dryRadioGain = ctx.createGain();
    dryRadioGain.gain.value = s.dryGain;
    dryRadioGainRef.current = dryRadioGain;
    radioFilter.connect(dryRadioGain);
    dryRadioGain.connect(masterOut);
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

    // Tremolo — two LFOs at different frequencies create beating / complex texture
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
    tremoloLfo.start();

    // Second tremolo LFO — beating with first creates radio-static texture
    const tremoloLfo2 = ctx.createOscillator();
    tremoloLfo2.type = 'sine';
    tremoloLfo2.frequency.value = s.noiseLfo2Freq;
    noiseTremolo2Ref.current = tremoloLfo2;
    const tremoloModulator2 = ctx.createGain();
    tremoloModulator2.gain.value = s.noiseLfo2Depth;
    tremoloMod2Ref.current = tremoloModulator2;
    tremoloLfo2.connect(tremoloModulator2);
    tremoloModulator2.connect(tremoloBase.gain);
    tremoloLfo2.start();

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
    noiseGain.connect(masterOut);

    // Send noise into reverb
    const noiseReverbSend = ctx.createGain();
    noiseReverbSend.gain.value = s.noiseReverbSend;
    noiseReverbSendRef.current = noiseReverbSend;
    noiseGain.connect(noiseReverbSend);
    noiseReverbSend.connect(convolver);

    noise.start();
    crackle.start();
  }, []);

  const playSound = useCallback(async (url: string, name: string, volumeMultiplier = 1.0) => {
    if (!audioCtx.current) return;
    if (audioCtx.current.state === 'suspended') await audioCtx.current.resume();

    setSoundStatus('loading');

    // Immediately start fading out the current sound before fetching the new one
    const fadeTime = settingsRef.current.crossfadeDuration;
    const targetVol = settingsRef.current.soundVolume * volumeMultiplier;
    if (currentGain.current) {
      const now = audioCtx.current.currentTime;
      currentGain.current.gain.cancelScheduledValues(now);
      currentGain.current.gain.setValueAtTime(currentGain.current.gain.value || targetVol, now);
      currentGain.current.gain.exponentialRampToValueAtTime(0.001, now + fadeTime);
      const oldSource = currentSource.current;
      setTimeout(() => { try { oldSource?.stop(); } catch (_) {} }, fadeTime * 1000 + 100);
      currentSource.current = null;
      currentGain.current = null;
    }

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
      const now = audioCtx.current.currentTime;
      gain.gain.setValueAtTime(0.001, now);
      source.connect(gain);

      // Tap pre-filter signal into analyser for accurate level detection
      if (analyserRef.current) {
        gain.connect(analyserRef.current);
      }

      if (radioFilterRef.current) {
        gain.connect(radioFilterRef.current);
      } else {
        gain.connect(audioCtx.current.destination);
      }

      gain.gain.exponentialRampToValueAtTime(targetVol, now + 0.1);
      source.start();

      currentSource.current = source;
      currentGain.current = gain;
      setCurrentSoundName(name);
      setSoundStatus('playing');
    } catch (e) {
      console.error('Audio playback error:', e);
      setSoundStatus('idle');
    }
  }, []);

  const startRecording = useCallback(() => {
    const ctx = audioCtx.current;
    const masterOut = masterOutRef.current;
    if (!ctx || !masterOut) return;

    const chunks: Blob[] = [];
    const dest = ctx.createMediaStreamDestination();
    masterOut.connect(dest);

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      masterOut.disconnect(dest);
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      const ext = recorder.mimeType.includes('ogg') ? 'ogg' : 'webm';
      const a = document.createElement('a');
      a.href = url;
      a.download = `echoes-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    };

    recorder.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const dimCurrentSound = useCallback((fraction: number) => {
    const gain = currentGain.current;
    const ctx = audioCtx.current;
    if (!gain || !ctx) return;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(gain.gain.value * fraction, now + 3);
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
      setSoundStatus('idle');
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    }, [isPlaying, initAudio, updateReactivity]);

    useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
    }, []);

  const getSmoothedRms = useCallback(() => smoothedRmsRef.current, []);

  return { isPlaying, togglePlay, playSound, currentSoundName, isRecording, startRecording, stopRecording, dimCurrentSound, getSmoothedRms, soundStatus };
}
