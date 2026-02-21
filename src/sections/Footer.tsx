import { motion } from 'framer-motion';
import { Twitter } from 'lucide-react';

export function Footer() {
  return (
    <footer className="relative bg-black overflow-hidden pt-10 pb-10">
      {/* Верхняя светящаяся линия (Фиолетовая) */}
      <div className="absolute top-0 left-0 right-0 h-px">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500 to-transparent shadow-[0_0_20px_rgba(168,85,247,0.8)]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          
          {/* Copyright */}
          <p className="text-white/40 text-sm">
            © 2026 Ai Entropy. All rights reserved.
          </p>

          {/* Twitter Link */}
          <motion.a
            href="#"
            className="flex items-center gap-2 text-white/50 hover:text-purple-400 transition-colors duration-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Twitter className="w-4 h-4" />
            <span className="text-sm font-medium">Twitter</span>
          </motion.a>
        </div>
      </div>
    </footer>
  );
}