import { useEffect, useState, useRef } from 'react';
import { useInView } from 'framer-motion';

interface TextScrambleProps {
  text: string;
  className?: string;
  duration?: number;
  delay?: number;
}

const chars = '!<>-_\\/[]{}—=+*^?#________';

export function TextScramble({ text, className = '', duration = 1.5, delay = 0 }: TextScrambleProps) {
  const [displayText, setDisplayText] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isInView || hasAnimated.current) return;
    
    const startTimeout = setTimeout(() => {
      hasAnimated.current = true;

      let frame = 0;
      const totalFrames = duration * 60;
      const textLength = text.length;
      
      const animate = () => {
        frame++;
        const progress = frame / totalFrames;
        
        let result = '';
        for (let i = 0; i < textLength; i++) {
          const charProgress = (progress * textLength - i);
          
          if (charProgress >= 1) {
            result += text[i];
          } else if (charProgress > 0) {
            result += chars[Math.floor(Math.random() * chars.length)];
          } else {
            result += chars[Math.floor(Math.random() * chars.length)];
          }
        }
        
        setDisplayText(result);
        
        if (frame < totalFrames) {
          requestAnimationFrame(animate);
        } else {
          setDisplayText(text);
        }
      };
      
      animate();
    }, delay * 1000);

    return () => clearTimeout(startTimeout);
  }, [isInView, text, duration, delay]);

  return (
    <span ref={ref} className={className}>
      {displayText}
    </span>
  );
}
