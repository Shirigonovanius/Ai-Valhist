import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';

interface StatCardProps {
  icon: LucideIcon;
  value: number;
  label: string;
  suffix?: string;
  delay?: number;
}

export function StatCard({ icon: Icon, value, label, suffix = '', delay = 0 }: StatCardProps) {
  return (
    <motion.div
      className="relative group"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
    >
      {/* Glow background */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-orange-600/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* Card */}
      <div className="relative p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-orange-500/50 transition-all duration-300">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center mb-4 shadow-glow">
          <Icon className="w-6 h-6 text-white" />
        </div>
        
        {/* Value */}
        <div className="text-3xl md:text-4xl font-cinzel font-bold text-white mb-1">
          <AnimatedCounter end={value} suffix={suffix} />
        </div>
        
        {/* Label */}
        <p className="text-white/60 text-sm">{label}</p>
        
        {/* Decorative line */}
        <div className="absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
      </div>
    </motion.div>
  );
}
