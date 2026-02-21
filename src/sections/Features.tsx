import { motion } from 'framer-motion';
import { Sparkles, Trophy, Zap, Target, Shield, Clock } from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Battles',
    description: 'Compete against other prompt engineers in real-time AI image generation challenges.',
    color: '#a855f7', // Purple-500
  },
  {
    icon: Trophy,
    title: 'Win Big Rewards',
    description: 'The winner takes all! Earn tokens and climb the leaderboard with every victory.',
    color: '#d8b4fe', // Purple-300
  },
  {
    icon: Zap,
    title: 'Instant Results',
    description: 'Get immediate feedback on your prompts with our advanced AI evaluation system.',
    color: '#c084fc', // Purple-400
  },
  {
    icon: Target,
    title: 'Skill Progression',
    description: 'Track your improvement and unlock new challenges as you master the art of prompting.',
    color: '#9333ea', // Purple-600
  },
  {
    icon: Shield,
    title: 'Fair Play',
    description: 'Our AI judges evaluate based on creativity, relevance, and technical skill.',
    color: '#7e22ce', // Purple-700
  },
  {
    icon: Clock,
    title: '24/7 Battles',
    description: 'Join battles anytime, anywhere. The arena never sleeps.',
    color: '#6b21a8', // Purple-800
  },
];

export function Features() {
  return (
    <section className="relative py-24 bg-black overflow-hidden">
      {/* Фиолетовый шар на фоне */}
      <motion.div 
        className="absolute top-1/4 left-0 w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-[100px]"
        animate={{ opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        {/* Заголовок */}
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm mb-4">
            Features
          </span>
          <h2 className="font-cinzel text-3xl md:text-5xl font-bold text-white">
            How It <span className="text-purple-500" style={{ textShadow: '0 0 20px rgba(168,85,247,0.5)' }}>Works</span>
          </h2>
        </div>

        {/* Сетка карточек */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10 transition-all duration-300"
            >
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-6 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${feature.color}20` }}
              >
                <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-white/60 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}