/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, useCallback, useEffect } from 'react';

function createSpacetimeImpulse(audioCtx: AudioContext) {
  const duration = 5.0; // Long 5 second tail
  const decay = 3.0;
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

export function useAudioEngine(initialNoiseVolume: number = 0.05) {
  const audioCtx = useRef<AudioContext | null>(null);
  const noiseNode = useRef<AudioNode | null>(null);
  const currentSource = useRef<AudioBufferSourceNode | null>(null);
  const currentGain = useRef<GainNode | null>(null);
  const noiseGain = useRef<GainNode | null>(null);
  const radioFilterRef = useRef<BiquadFilterNode | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const noiseFilterRef = useRef<BiquadFilterNode | null>(null);
  const noiseTremoloRef = useRef<OscillatorNode | null>(null);
  const reactiveGainRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const smoothedRmsRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSoundName, setCurrentSoundName] = useState<string | null>(null);

  const updateReactivity = useCallback(() => {
    if (!isPlayingRef.current || !analyserRef.current || !audioCtx.current) return;

    const analyser = analyserRef.current;
    const ctx = audioCtx.current;
    
    const dataArray = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatTimeDomainData(dataArray);
    
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    // Smooth the envelope
    smoothedRmsRef.current = smoothedRmsRef.current * 0.85 + rms * 0.15;
    const env = smoothedRmsRef.current;

    // 1. Modulate Filter (opens up when radio is loud)
    if (noiseFilterRef.current) {
      const targetFreq = 400 + env * 10000;
      noiseFilterRef.current.frequency.setTargetAtTime(Math.min(targetFreq, 8000), ctx.currentTime, 0.05);
    }

    // 2. Modulate Tremolo Rate (speeds up when radio is loud)
    if (noiseTremoloRef.current) {
      const targetRate = 0.5 + env * 40;
      noiseTremoloRef.current.frequency.setTargetAtTime(Math.min(targetRate, 20), ctx.currentTime, 0.05);
    }

    // 3. Modulate Reactive Gain (swells when radio is loud)
    if (reactiveGainRef.current) {
      const targetGain = 1.0 + env * 4;
      reactiveGainRef.current.gain.setTargetAtTime(Math.min(targetGain, 4.0), ctx.currentTime, 0.05);
    }

    animationFrameRef.current = requestAnimationFrame(updateReactivity);
  }, []);

  const initAudio = useCallback(() => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtx.current;

      // --- CINEMATIC EFFECTS CHAIN ---
      
      // 1. Spacetime Reverb (Convolver)
      const convolver = ctx.createConvolver();
      convolver.buffer = createSpacetimeImpulse(ctx);
      const convolverGain = ctx.createGain();
      convolverGain.gain.value = 1.5; 
      convolver.connect(convolverGain);
      convolverGain.connect(ctx.destination);

      // 2. Echo (Delay)
      const delay = ctx.createDelay(5.0);
      delay.delayTime.value = 0.85; 
      const feedback = ctx.createGain();
      feedback.gain.value = 0.5; 
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(convolver); 

      // 3. Old Radio Filter (Bandpass with LFO drift)
      const radioFilter = ctx.createBiquadFilter();
      radioFilter.type = 'bandpass';
      radioFilter.frequency.value = 1200; 
      radioFilter.Q.value = 1.5;
      radioFilterRef.current = radioFilter;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05; 
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 400; 
      lfo.connect(lfoGain);
      lfoGain.connect(radioFilter.frequency);
      lfo.start();

      // --- REACTIVE ANALYSER ---
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      radioFilter.connect(analyser); // Read the radio output

      // Route Radio Filter
      const dryRadioGain = ctx.createGain();
      dryRadioGain.gain.value = 0.8;
      radioFilter.connect(dryRadioGain);
      dryRadioGain.connect(ctx.destination); 
      radioFilter.connect(delay); 
      radioFilter.connect(convolver); 

      // --- SPACETIME STATIC (NOISE) ---
      
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
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11;
        b6 = white * 0.115926;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      // Crackle
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
      
      // Reactive Filter (Lowpass that opens up)
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 400; // Deep rumble by default
      noiseFilter.Q.value = 2;
      noiseFilterRef.current = noiseFilter;
      noiseCombiner.connect(noiseFilter);

      // Tremolo (Throbbing)
      const tremoloBase = ctx.createGain();
      tremoloBase.gain.value = 0.6;
      noiseFilter.connect(tremoloBase);

      const tremoloLfo = ctx.createOscillator();
      tremoloLfo.type = 'sine';
      tremoloLfo.frequency.value = 0.5; // Slow throb by default
      noiseTremoloRef.current = tremoloLfo;

      const tremoloModulator = ctx.createGain();
      tremoloModulator.gain.value = 0.4;
      tremoloLfo.connect(tremoloModulator);
      tremoloModulator.connect(tremoloBase.gain);
      
      // Reactive Gain (Swells)
      const reactiveGain = ctx.createGain();
      reactiveGain.gain.value = 1.0;
      reactiveGainRef.current = reactiveGain;
      tremoloBase.connect(reactiveGain);

      // Final User Gain
      noiseGain.current = ctx.createGain();
      noiseGain.current.gain.value = initialNoiseVolume;
      
      reactiveGain.connect(noiseGain.current);
      noiseGain.current.connect(ctx.destination);
      
      // Send some static into the spacetime reverb
      const noiseReverbSend = ctx.createGain();
      noiseReverbSend.gain.value = 0.2;
      noiseGain.current.connect(noiseReverbSend);
      noiseReverbSend.connect(convolver);

      noise.start();
      crackle.start();
      tremoloLfo.start();
      noiseNode.current = noise;
    }
  }, [initialNoiseVolume]);

  const playSound = useCallback(async (url: string, name: string) => {
    if (!audioCtx.current) return;
    if (audioCtx.current.state === 'suspended') await audioCtx.current.resume();

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch audio: ${response.statusText}`);
      const audioData = await response.arrayBuffer();
      const buffer = await audioCtx.current.decodeAudioData(audioData);

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
          for (let i = 0; i < data.length; i++) {
            data[i] *= multiplier;
          }
        }
      }

      const source = audioCtx.current.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = audioCtx.current.createGain();
      // Web Audio API cannot exponentialRamp from exactly 0
      gain.gain.setValueAtTime(0.001, audioCtx.current.currentTime);
      source.connect(gain);
      
      if (radioFilterRef.current) {
        gain.connect(radioFilterRef.current);
      } else {
        gain.connect(audioCtx.current.destination);
      }

      const now = audioCtx.current.currentTime;
      const fadeTime = 4;

      if (currentGain.current) {
        // Cancel any previous ramps and start fading out from current value
        currentGain.current.gain.cancelScheduledValues(now);
        currentGain.current.gain.setValueAtTime(currentGain.current.gain.value || 0.6, now);
        currentGain.current.gain.exponentialRampToValueAtTime(0.001, now + fadeTime);
        const oldSource = currentSource.current;
        setTimeout(() => {
          try { oldSource?.stop(); } catch (e) {}
        }, fadeTime * 1000 + 100);
      }

      gain.gain.exponentialRampToValueAtTime(0.6, now + fadeTime);
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [isPlaying, initAudio, updateReactivity]);

  const setNoiseVolume = useCallback((val: number) => {
    if (noiseGain.current && audioCtx.current) {
      noiseGain.current.gain.setTargetAtTime(val, audioCtx.current.currentTime, 0.1);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return { isPlaying, togglePlay, playSound, currentSoundName, setNoiseVolume };
}
