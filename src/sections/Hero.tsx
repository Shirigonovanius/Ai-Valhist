import { useState } from 'react';
import { motion } from 'framer-motion';
import { Swords, Sparkles } from 'lucide-react';
import { TextScramble } from '../components/TextScramble';
import { GlowOrb } from '../components/GlowOrb';

const AMOUNT_OPTIONS = [1, 5, 10];

// Добавляем интерфейс, чтобы кнопка знала, что делать
interface HeroProps {
  onBattle?: (amount: number) => void;
}

export function Hero({ onBattle }: HeroProps) {
  const [selectedAmount, setSelectedAmount] = useState(1);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/hero-bg.jpg)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/90" />
      </div>

      {/* ОРБЫ ТЕПЕРЬ ФИОЛЕТОВЫЕ */}
      <GlowOrb className="top-1/4 left-1/4" size={400} delay={0} color="#a855f7" /> 
      <GlowOrb className="bottom-1/4 right-1/4" size={350} delay={1} color="#9333ea" />
      <GlowOrb className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" size={500} delay={0.5} color="#7e22ce" />

      {/* Анимированные кольца (тоже фиолетовые) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-purple-500/20"
            style={{
              width: `${300 + i * 200}px`,
              height: `${300 + i * 200}px`,
            }}
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.6, 0.3],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 8 + i * 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}
      </div>

      {/* Контент */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        {/* Бейдж */}
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30 mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-purple-400 text-sm font-medium">AI Prompt Battle Arena</span>
        </motion.div>

        {/* Заголовок */}
        <motion.h1
          className="font-cinzel text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-wide"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <span className="relative inline-block">
            <span className="text-purple-500 glow-text-orange">Ai</span>
            <motion.span
              className="absolute -inset-2 bg-purple-500/20 blur-2xl rounded-full"
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </span>{' '}
          <span className="text-white">Entropy</span>
        </motion.h1>

        {/* Подзаголовок */}
        <motion.p
          className="text-xl md:text-2xl text-white/90 font-medium mb-4 max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <TextScramble text="Battle in AI Prompt Knowledge, Discover" />
          <br />
          <TextScramble text="Whose Skills & Creativity are Superior!" delay={0.3} />
        </motion.p>

        {/* Описание */}
        <motion.p
          className="text-white/60 text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          By agreeing to a battle, you enter a field where a task will be assigned and you'll need to write a prompt. 
          The system will generate an image based on your prompt, and whoever has the better image wins. 
          <span className="text-purple-400 font-medium"> The winner takes all!</span>
        </motion.p>

        {/* Выбор ставки */}
        <motion.div
          className="flex flex-col items-center gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          {/* 1. ИЗМЕНИЛИ: ТЕПЕРЬ USDC */}
          <p className="text-white/50 text-sm uppercase tracking-wider">Select Battle Amount (USDC)</p>
          
          <div className="flex items-center gap-4">
            {AMOUNT_OPTIONS.map((amount) => (
              <motion.button
                key={amount}
                onClick={() => setSelectedAmount(amount)}
                className={`relative w-16 h-16 md:w-20 md:h-20 rounded-2xl font-cinzel font-bold text-xl md:text-2xl transition-all duration-300 ${
                  selectedAmount === amount
                    ? 'bg-gradient-to-br from-purple-500 to-purple-700 text-white'
                    : 'bg-white/5 text-white/60 border border-white/10 hover:border-purple-500/50 hover:text-white'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={selectedAmount === amount ? {
                  boxShadow: '0 0 30px rgba(168, 85, 247, 0.6), inset 0 0 20px rgba(255, 255, 255, 0.1)',
                } : {}}
              >
                {selectedAmount === amount && (
                  <motion.div
                    className="absolute inset-0 rounded-2xl bg-purple-400/30"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
                <span className="relative z-10">{amount}</span>
              </motion.button>
            ))}
          </div>

          {/* 2. ИЗМЕНИЛИ: НОВАЯ КРУГЛАЯ КНОПКА С ПЕРЕЛИВОМ */}
          <motion.button
             onClick={() => onBattle && onBattle(selectedAmount)}
             className="
               group relative mt-6 px-10 py-5 rounded-full overflow-hidden
               font-cinzel font-bold text-xl text-white tracking-wider
               border-2 border-purple-400/50 shadow-[0_0_35px_rgba(168,85,247,0.5)]
               
               bg-[linear-gradient(110deg,#9333ea,45%,#c084fc,55%,#9333ea)] 
               bg-[length:200%_100%]
               animate-shimmer
               
               hover:scale-105 hover:shadow-[0_0_50px_rgba(168,85,247,0.8)] hover:border-purple-400
               transition-all duration-300
               flex items-center gap-3 cursor-pointer
             "
             whileTap={{ scale: 0.95 }}
          >
            <Swords className="w-6 h-6" />
            BATTLE NOW
          </motion.button>

        </motion.div>

        {/* Декоративные линии внизу */}
        <motion.div
          className="mt-16 flex items-center justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1 }}
        >
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
          <motion.div
            className="w-3 h-3 rounded-full bg-purple-500"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div className="w-24 h-px bg-gradient-to-l from-transparent via-purple-500/50 to-transparent" />
        </motion.div>
      </div>

      {/* Нижний градиент */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent" />
    </section>
  );
}