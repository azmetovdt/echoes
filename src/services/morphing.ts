/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import type { AudioSettings } from './settings';

interface MorphRange {
  min: number;
  max: number;
}

type MorphableKey = keyof Pick<AudioSettings,
  'reverbGain' | 'delayTime' | 'delayFeedback' | 'radioFilterFreq' | 'radioFilterQ' |
  'lfoFreq' | 'lfoDepth' | 'dryGain' | 'noiseVolume' | 'tremoloFreq' | 'tremoloDepth' |
  'noiseLfo2Freq' | 'noiseLfo2Depth'
>;

export const MORPH_RANGES: Record<MorphableKey, MorphRange> = {
  reverbGain:      { min: 0.4,  max: 3.0   },
  delayTime:       { min: 0.05, max: 1.8   },
  delayFeedback:   { min: 0.25, max: 0.88  },
  radioFilterFreq: { min: 2000,  max: 4000  },
  radioFilterQ:    { min: 0.5,  max: 8.0   },
  lfoFreq:         { min: 0.02, max: 0.8   },
  lfoDepth:        { min: 100,  max: 2000  },
  dryGain:         { min: 0.1,  max: 1.0   },
  noiseVolume:     { min: 0.01, max: 0.1  },
  tremoloFreq:     { min: 0.3,  max: 8.0   },
  tremoloDepth:    { min: 0.0,  max: 0.7   },
  noiseLfo2Freq:   { min: 1.0,  max: 15.0  },
  noiseLfo2Depth:  { min: 0.0,  max: 0.5   },
};

const MORPH_KEYS = Object.keys(MORPH_RANGES) as MorphableKey[];
const LERP_SPEED = 0.0018; // Adjusted for 50ms tick (was 0.018 for 500ms)
const TICK_MS = 50; // 20fps updates for smooth audio parameter interpolation
const TARGET_THRESHOLD = 0.03;

function randInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function useMorphing(
  settings: AudioSettings,
  batchUpdate: (updates: Partial<AudioSettings>) => void,
  enabled: boolean,
) {
  const currentRef = useRef<Record<MorphableKey, number>>({} as Record<MorphableKey, number>);
  const targetRef = useRef<Record<MorphableKey, number>>({} as Record<MorphableKey, number>);
  const enabledRef = useRef(enabled);
  const initializedRef = useRef(false);
  const batchUpdateRef = useRef(batchUpdate);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { batchUpdateRef.current = batchUpdate; }, [batchUpdate]);

  useEffect(() => {
    if (!enabled) return;

    if (!initializedRef.current) {
      for (const key of MORPH_KEYS) {
        const { min, max } = MORPH_RANGES[key];
        currentRef.current[key] = settings[key] as number;
        targetRef.current[key] = randInRange(min, max);
      }
      initializedRef.current = true;
    }

    const tick = () => {
      if (!enabledRef.current) return;
      const updates: Partial<AudioSettings> = {};

      for (const key of MORPH_KEYS) {
        const { min, max } = MORPH_RANGES[key];
        const range = max - min;
        const current = currentRef.current[key];
        const target = targetRef.current[key];
        const next = current + (target - current) * LERP_SPEED;
        currentRef.current[key] = next;
        (updates as Record<string, number>)[key] = next;

        if (Math.abs(next - target) < range * TARGET_THRESHOLD) {
          targetRef.current[key] = randInRange(min, max);
        }
      }

      batchUpdateRef.current(updates);
    };

    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
