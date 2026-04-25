/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { AudioSettings } from '../services/settings';

interface SoundSlot {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  name: string;
  url: string;
  ready: boolean;
}

export function useAudioEngine(settings: AudioSettings) {
  const audioCtx = useRef<AudioContext | null>(null);
  
  const slotARef = useRef<SoundSlot | null>(null);
  const slotBRef = useRef<SoundSlot | null>(null);
  const activeSlotRef = useRef<'A' | 'B'>('A');
  const preparedSlotRef = useRef<SoundSlot | null>(null);

  const masterOutRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const radioFilterRef = useRef<BiquadFilterNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  
  const noiseGainRef = useRef<GainNode | null>(null);
  const convolverGainRef = useRef<GainNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const delayFeedbackRef = useRef<GainNode | null>(null);
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

  const animationFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const smoothedRmsRef = useRef<number>(0);
  const settingsRef = useRef(settings);

  const [isPlaying, setIsPlaying] = useState(false);
  const [soundStatus, setSoundStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [currentSoundName, setCurrentSoundName] = useState<string | null>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Sync all AudioParams whenever settings change
  useEffect(() => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;

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
      if (settings.radioFilterEnabled) {
        radioFilterRef.current.type = 'bandpass';
        setParam(radioFilterRef.current.frequency, settings.radioFilterFreq, 0.05);
        setParam(radioFilterRef.current.Q, settings.radioFilterQ, 0.05);
      } else {
        radioFilterRef.current.type = 'allpass';
        setParam(radioFilterRef.current.frequency, 20000, 0.05);
        setParam(radioFilterRef.current.Q, 0.001, 0.05);
      }
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
    
    const duration = settings.reverbDuration;
    const decay = settings.reverbDecay;
    const length = ctx.sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
      const channel = impulse.getChannelData(i);
      for (let j = 0; j < length; j++) {
        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
      }
    }
    convolverRef.current.buffer = impulse;
  }, [settings.reverbDuration, settings.reverbDecay]);

  const updateReactivity = useCallback(() => {
    if (!isPlayingRef.current || !analyserRef.current || !audioCtx.current) return;
    const analyser = analyserRef.current;
    const dataArray = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) sumSquares += dataArray[i] * dataArray[i];
    const rms = Math.sqrt(sumSquares / dataArray.length);
    const alpha = rms > smoothedRmsRef.current ? 0.4 : 0.08;
    smoothedRmsRef.current = smoothedRmsRef.current * (1 - alpha) + rms * alpha;
    const env = smoothedRmsRef.current;
    const t = audioCtx.current.currentTime + 0.02;

    if (noiseFilterRef.current) {
      const baseFreq = settingsRef.current.noiseFilterFreq;
      const sens = settingsRef.current.noiseFilterSensitivity;
      noiseFilterRef.current.frequency.setTargetAtTime(Math.min(baseFreq + env * sens, 8000), t, 0.03);
    }
    if (noiseTremoloRef.current) {
      const baseRate = settingsRef.current.tremoloFreq;
      const sens = settingsRef.current.tremoloSensitivity;
      noiseTremoloRef.current.frequency.setTargetAtTime(Math.min(baseRate + env * sens, 30), t, 0.03);
    }
    if (reactiveGainRef.current) {
      const sens = settingsRef.current.reactiveGainSensitivity;
      reactiveGainRef.current.gain.setTargetAtTime(Math.min(1.0 + env * sens, sens), t, 0.03);
    }
    animationFrameRef.current = requestAnimationFrame(updateReactivity);
  }, []);

  const initAudio = useCallback(() => {
    if (audioCtx.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtx.current = ctx;
    const s = settingsRef.current;

    const masterOut = ctx.createGain();
    masterOut.gain.value = 0.0001; 
    masterOutRef.current = masterOut;
    masterOut.connect(ctx.destination);
    masterOut.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 4.0); 

    const convolver = ctx.createConvolver();
    convolverRef.current = convolver;
    
    // Generate initial impulse
    const duration = s.reverbDuration;
    const decay = s.reverbDecay;
    const length = ctx.sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
      const channel = impulse.getChannelData(i);
      for (let j = 0; j < length; j++) {
        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
      }
    }
    convolver.buffer = impulse;

    const convolverGain = ctx.createGain();
    convolverGain.gain.value = s.reverbGain;
    convolverGainRef.current = convolverGain;
    convolver.connect(convolverGain);
    convolverGain.connect(masterOut);

    const delay = ctx.createDelay(5.0);
    delay.delayTime.value = s.delayTime;
    delayRef.current = delay;
    const feedback = ctx.createGain();
    feedback.gain.value = s.delayFeedback;
    delayFeedbackRef.current = feedback;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(convolver);

    const radioFilter = ctx.createBiquadFilter();
    radioFilter.type = 'bandpass';
    radioFilterRef.current = radioFilter;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = s.lfoDepth;
    lfoGainRef.current = lfoGain;
    lfo.connect(lfoGain);
    lfoGain.connect(radioFilter.frequency);
    lfo.start();
    lfoRef.current = lfo;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyserRef.current = analyser;

    const dryRadioGain = ctx.createGain();
    dryRadioGain.gain.value = s.dryGain;
    dryRadioGainRef.current = dryRadioGain;
    radioFilter.connect(dryRadioGain);
    dryRadioGain.connect(masterOut);
    radioFilter.connect(delay);
    radioFilter.connect(convolver);

    // --- Stereo Pink Noise Setup ---
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const output = noiseBuffer.getChannelData(channel);
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i=0; i<bufferSize; i++) {
        const white = Math.random()*2-1;
        // Voss-McCartney algorithm for pink noise
        b0=0.99886*b0+white*0.0555179; b1=0.99332*b1+white*0.0750759; b2=0.969*b2+white*0.153852;
        b3=0.8665*b3+white*0.3104856; b4=0.55*b4+white*0.5329522; b5=-0.7616*b5-white*0.016898;
        output[i] = (b0+b1+b2+b3+b4+b5+b6+white*0.5362)*0.11; b6=white*0.115926;
      }
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer; noise.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilterRef.current = noiseFilter;
    noise.connect(noiseFilter);

    const tremoloBase = ctx.createGain();
    tremoloBase.gain.value = 0.6;
    noiseFilter.connect(tremoloBase);
    const tLfo1 = ctx.createOscillator(); noiseTremoloRef.current = tLfo1;
    const tMod1 = ctx.createGain(); tremoloModRef.current = tMod1;
    tLfo1.connect(tMod1); tMod1.connect(tremoloBase.gain); tLfo1.start();
    
    const tLfo2 = ctx.createOscillator(); noiseTremolo2Ref.current = tLfo2;
    const tMod2 = ctx.createGain(); tremoloMod2Ref.current = tMod2;
    tLfo2.connect(tMod2); tMod2.connect(tremoloBase.gain); tLfo2.start();

    const reactiveGain = ctx.createGain(); reactiveGainRef.current = reactiveGain;
    tremoloBase.connect(reactiveGain);

    // --- Background Noise Layer (no tremolo) ---
    const bgNoiseGain = ctx.createGain();
    bgNoiseGain.gain.value = 0.25; // Quiet, steady floor
    noiseFilter.connect(bgNoiseGain);
    bgNoiseGain.connect(reactiveGain);

    const noiseGain = ctx.createGain(); noiseGainRef.current = noiseGain;
    noiseGain.gain.value = s.noiseVolume;
    reactiveGain.connect(noiseGain); noiseGain.connect(masterOut);

    const noiseReverbSend = ctx.createGain(); noiseReverbSendRef.current = noiseReverbSend;
    noiseGain.connect(noiseReverbSend); noiseReverbSend.connect(convolver);
    noise.start();
  }, []);

  const createSlot = useCallback((url: string, name: string): SoundSlot => {
    if (!audioCtx.current) initAudio();
    const ctx = audioCtx.current!;
    const audio = new Audio();
    audio.src = url;
    audio.crossOrigin = "anonymous";
    audio.loop = true;
    
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = 0.001;
    
    source.connect(gain);
    gain.connect(analyserRef.current!);
    gain.connect(radioFilterRef.current!);
    
    return { audio, source, gain, name, url, ready: false };
  }, [initAudio]);

  const prepareSound = useCallback((url: string, name: string) => {
    if (preparedSlotRef.current?.url === url) return;
    
    // Cleanup previous prepared if any
    if (preparedSlotRef.current) {
      preparedSlotRef.current.audio.pause();
      preparedSlotRef.current.audio.src = "";
    }

    const slot = createSlot(url, name);
    preparedSlotRef.current = slot;
    slot.audio.load();
    slot.audio.addEventListener('canplay', () => { slot.ready = true; }, { once: true });
  }, [createSlot]);

  const playSound = useCallback(async (url: string, name: string, volumeMultiplier = 1.0, skipFadeIn = false) => {
    if (!audioCtx.current) initAudio();
    const ctx = audioCtx.current!;
    if (ctx.state === 'suspended') await ctx.resume();

    const isFirstSound = !currentSoundName;
    if (isFirstSound) setSoundStatus('loading');

    const nextSlotKey = activeSlotRef.current === 'A' ? 'B' : 'A';
    const oldSlot = activeSlotRef.current === 'A' ? slotARef.current : slotBRef.current;
    
    let nextSlot: SoundSlot;
    if (preparedSlotRef.current?.url === url) {
      nextSlot = preparedSlotRef.current;
      preparedSlotRef.current = null;
    } else {
      nextSlot = createSlot(url, name);
      nextSlot.audio.load();
    }

    if (nextSlotKey === 'A') slotARef.current = nextSlot; else slotBRef.current = nextSlot;

    const fadeTime = settingsRef.current.crossfadeDuration;
    const targetVol = settingsRef.current.soundVolume * volumeMultiplier;

    if (!nextSlot.ready) {
      await new Promise<void>((resolve) => {
        const onCanPlay = () => {
          nextSlot.audio.removeEventListener('canplay', onCanPlay);
          nextSlot.ready = true;
          resolve();
        };
        nextSlot.audio.addEventListener('canplay', onCanPlay);
        setTimeout(resolve, 3000); // Max wait 3s, then try playing anyway
      });
    }

    const now = ctx.currentTime;
    if (oldSlot) {
      oldSlot.gain.gain.cancelScheduledValues(now);
      oldSlot.gain.gain.setTargetAtTime(0.001, now, fadeTime / 3);
      setTimeout(() => oldSlot.audio.pause(), fadeTime * 1000 + 100);
    }

    nextSlot.audio.play().catch(() => {});
    nextSlot.gain.gain.cancelScheduledValues(now);
    nextSlot.gain.gain.setTargetAtTime(targetVol, now, skipFadeIn ? 0.01 : 0.2);

    activeSlotRef.current = nextSlotKey;
    setCurrentSoundName(name);
    setSoundStatus('playing');
    
    // Track sound played in Umami
    if (window.umami) {
      window.umami.track('sound-played', { name, url });
    }
  }, [initAudio, createSlot, currentSoundName]);

  const togglePlay = useCallback(async () => {
    if (!isPlaying) {
      initAudio();
      if (audioCtx.current?.state === 'suspended') await audioCtx.current.resume();
      setIsPlaying(true);
      isPlayingRef.current = true;
      updateReactivity();
      const active = activeSlotRef.current === 'A' ? slotARef.current : slotBRef.current;
      if (active) active.audio.play().catch(() => {});
    } else {
      audioCtx.current?.suspend();
      const active = activeSlotRef.current === 'A' ? slotARef.current : slotBRef.current;
      if (active) active.audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      setSoundStatus('idle');
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isPlaying, initAudio, updateReactivity]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = useCallback((preferredFormat: 'webm' | 'mp3' = 'webm') => {
    const ctx = audioCtx.current;
    const masterOut = masterOutRef.current;
    if (!ctx || !masterOut) return;

    const chunks: Blob[] = [];
    const dest = ctx.createMediaStreamDestination();
    masterOut.connect(dest);

    let candidates: string[] = [];
    if (preferredFormat === 'mp3') {
      // Browsers generally don't support audio/mpeg in MediaRecorder, 
      // but we try it and fall back to common formats if unavailable.
      candidates = ['audio/mpeg', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    } else {
      candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    }
    
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
    
    const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      masterOut.disconnect(dest);
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      
      let ext = 'webm';
      if (recorder.mimeType.includes('mpeg')) ext = 'mp3';
      else if (recorder.mimeType.includes('mp4')) ext = 'm4a';
      else if (recorder.mimeType.includes('ogg')) ext = 'ogg';

      const a = document.createElement('a');
      a.href = url;
      a.download = `echolocus-${Date.now()}.${ext}`;
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
    const active = activeSlotRef.current === 'A' ? slotARef.current : slotBRef.current;
    const ctx = audioCtx.current;
    if (!active || !ctx) return;
    const now = ctx.currentTime;
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.setTargetAtTime(active.gain.gain.value * fraction, now, 3);
  }, []);

  const [isRecording, setIsRecording] = useState(false);

  return { 
    isPlaying, togglePlay, playSound, prepareSound, currentSoundName, 
    soundStatus, getSmoothedRms: () => smoothedRmsRef.current,
    isRecording, startRecording, stopRecording, dimCurrentSound
  };
}
