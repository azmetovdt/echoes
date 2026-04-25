import React, { useEffect, useState } from 'react';

export default function NoiseCoordinates() {
  const [text, setText] = useState('00.0000, 00.0000');
  
  useEffect(() => {
    let frame: number;
    let lastUpdate = 0;
    const fps = 15;
    
    // Characters to use for noise effect
    const chars = '0123456789.';
    const symbols = '░▒▓*%#@&';
    const allChars = chars + symbols;
    
    const update = (time: number) => {
      if (time - lastUpdate > 1000 / fps) {
        let str = '';
        // Format roughly like "xx.xxxx, xx.xxxx"
        for (let i = 0; i < 16; i++) {
          if (i === 7) {
            str += ',';
          } else if (i === 8) {
            str += ' ';
          } else {
            str += allChars[Math.floor(Math.random() * allChars.length)];
          }
        }
        setText(str);
        lastUpdate = time;
      }
      frame = requestAnimationFrame(update);
    };
    
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  const isRu = window.location.pathname.includes('/ru');
  const tooltip = isRu ? 'Местоположение не определено' : 'Location not determined';

  return (
    <span className="relative group cursor-help font-mono inline-block" title={tooltip}>
      <span className="opacity-40 blur-[0.5px] select-none tracking-widest">{text}</span>
    </span>
  );
}
