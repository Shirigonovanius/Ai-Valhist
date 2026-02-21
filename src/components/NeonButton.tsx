import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface NeonButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'lg' | 'xl';
  disabled?: boolean;
}

export function NeonButton({ children, onClick, className = '', size = 'sm', disabled = false }: NeonButtonProps) {
  const sizeClasses = {
    sm: 'px-6 py-2 text-sm',
    lg: 'px-8 py-3 text-base',
    xl: 'px-12 py-4 text-xl tracking-[0.2em]', // Для главной кнопки битвы
  };

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative group overflow-hidden rounded-none font-orbitron font-bold uppercase tracking-wider
        glass-btn-purple clip-path-polygon flex items-center justify-center gap-3
        ${sizeClasses[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
    >
      {/* Декоративные линии по бокам */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-purple/50 group-hover:bg-neon-purple transition-colors"></div>
      <div className="absolute right-0 top-0 bottom-0 w-1 bg-neon-purple/50 group-hover:bg-neon-purple transition-colors"></div>
      
      {/* Контент */}
      <div className="relative z-10 flex items-center gap-2">
        {children}
      </div>
    </motion.button>
  );
}