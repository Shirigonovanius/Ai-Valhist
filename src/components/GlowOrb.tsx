import { motion } from 'framer-motion';

interface GlowOrbProps {
  className?: string;
  color?: string;
  size?: number;
  delay?: number;
}

export function GlowOrb({ className = '', color = '#f97316', size = 300, delay = 0 }: GlowOrbProps) {
  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}40 0%, ${color}10 40%, transparent 70%)`,
        filter: 'blur(40px)',
      }}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        delay,
        ease: 'easeInOut',
      }}
    />
  );
}
