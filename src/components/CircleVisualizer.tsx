/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import type { AudioSettings } from '../services/settings';

interface Props {
  settings: AudioSettings;
  isPlaying: boolean;
  getSmoothedRms: () => number;
  soundStatus?: 'idle' | 'loading' | 'playing';
}

const N = 8;
const BASE_R = 90;

function computePath(cx: number, cy: number, t: number, s: AudioSettings, rms: number, extraR: number = 0, status: 'idle' | 'loading' | 'playing' = 'idle'): string {
  // Very subtle parametric deformations — stays nearly circular
  let A1 = ((s.delayFeedback - 0.25) / 0.63) * 0.055 * BASE_R;
  let A2 = (s.lfoDepth / 2000) * 0.03 * BASE_R;
  const rotSpeed = s.lfoFreq * 0.9;

  if (status === 'loading') {
    A1 = 0;
    A2 = 0;
  }

  // Volume peak breathes the whole circle outward
  const r0 = BASE_R * (1 + rms * 0.5) + extraR;

  const pts: [number, number][] = Array.from({ length: N }, (_, i) => {
    const angle = (i / N) * Math.PI * 2;
    const r = r0
      + A1 * Math.sin(2 * angle + t * rotSpeed)
      + A2 * Math.sin(3 * angle - t * 0.52);
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });

  // Catmull-Rom → cubic bezier
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)},${cp2x.toFixed(1)} ${cp2y.toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
}

export default function CircleVisualizer({ settings, isPlaying, getSmoothedRms, soundStatus = 'idle' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const settingsRef = useRef(settings);
  const rmsRef = useRef(getSmoothedRms);
  const soundStatusRef = useRef(soundStatus);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const burstStartRef = useRef<number>(0);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { rmsRef.current = getSmoothedRms; }, [getSmoothedRms]);
  useEffect(() => {
    if (soundStatus === 'playing' && soundStatusRef.current !== 'playing') {
      burstStartRef.current = performance.now();
    }
    soundStatusRef.current = soundStatus;
  }, [soundStatus]);

  useEffect(() => {
    if (!isPlaying) {
      // Reset to static circle when paused
      if (pathRef.current) {
        const pts: [number, number][] = Array.from({ length: N }, (_, i) => {
          const angle = (i / N) * Math.PI * 2;
          return [150 + BASE_R * Math.cos(angle), 150 + BASE_R * Math.sin(angle)];
        });
        const n = pts.length;
        let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < n; i++) {
          const p0 = pts[(i - 1 + n) % n];
          const p1 = pts[i];
          const p2 = pts[(i + 1) % n];
          const p3 = pts[(i + 2) % n];
          const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
          const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
          const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
          const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
          d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)},${cp2x.toFixed(1)} ${cp2y.toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
        }
        pathRef.current.setAttribute('d', d + ' Z');
      }
      return;
    }

    startRef.current = performance.now();

    const animate = () => {
      const now = performance.now();
      const t = (now - startRef.current) / 1000;
      const s = settingsRef.current;
      const rms = rmsRef.current();
      const status = soundStatusRef.current;

      let extraR = 0;
      let extraGlow = 0;

      if (status === 'loading') {
        extraR = -10 + Math.sin(t * 8) * 4;
      } else if (status === 'playing') {
        const timeSinceBurst = now - burstStartRef.current;
        if (timeSinceBurst < 2000) {
          const p = timeSinceBurst / 2000;
          const decay = Math.pow(1 - p, 4);
          extraR = 30 * decay;
          extraGlow = 15 * decay;
        }
      }

      pathRef.current?.setAttribute('d', computePath(150, 150, t, s, rms, extraR, status));

      // Color and glow driven by params — all in rAF, zero React re-renders
      const hue = ((s.radioFilterFreq - 300) / 3200) * 180 + 15;
      const strokeOpacity = (0.35 + rms * 0.55).toFixed(2);
      const color = `hsl(${hue.toFixed(0)},40%,72%)`;
      const glowPx = (3 + rms * 14 + extraGlow).toFixed(1);

      if (pathRef.current) {
        pathRef.current.setAttribute('stroke', color);
        pathRef.current.setAttribute('stroke-opacity', strokeOpacity);
        if (status === 'loading') {
          pathRef.current.setAttribute('stroke-dasharray', '4 12');
          pathRef.current.setAttribute('transform', `rotate(${(t * 45) % 360} 150 150)`);
        } else {
          pathRef.current.removeAttribute('stroke-dasharray');
          pathRef.current.removeAttribute('transform');
        }
      }
      if (svgRef.current) {
        svgRef.current.style.filter = `drop-shadow(0 0 ${glowPx}px ${color})`;
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frameRef.current);
      if (svgRef.current) svgRef.current.style.filter = '';
    };
  }, [isPlaying]);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 300 300"
      className="w-56 h-56 md:w-72 md:h-72"
      style={{ opacity: isPlaying ? 1 : 0.2, transition: 'opacity 3s' }}
    >
      <path
        ref={pathRef}
        fill="none"
        stroke="hsl(20,40%,65%)"
        strokeWidth="0.75"
        strokeOpacity="0.3"
      />
    </svg>
  );
}
