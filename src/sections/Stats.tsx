import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Swords } from 'lucide-react';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { supabase } from '../supabase'; // Добавили импорт базы

export function Stats() {
  // Добавили состояние для счетчика (по умолчанию 0)
  const [count, setCount] = useState<number>(0);

  // Добавили логику загрузки и обновления
  useEffect(() => {
    const fetchCount = async () => {
      const { count: exactCount, error } = await supabase
        .from('battles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      if (!error && exactCount !== null) {
        setCount(exactCount);
      }
    };

    fetchCount(); // Загружаем при первом заходе

    // Слушаем обновления в реальном времени
    const channel = supabase
      .channel('stats-updates')
      .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'battles', 
          filter: 'status=eq.completed' 
      }, () => {
        fetchCount(); // Обновляем, если кто-то закончил битву
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <section className="relative py-16 px-4 bg-black overflow-hidden">
      {/* 1. Фон (Заменили orange-950 на purple-950) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-purple-950/5 to-black" />
      
      {/* 2. Сетка (Заменили RGB оранжевого на фиолетовый) */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(168, 85, 247, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168, 85, 247, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <motion.div
          className="relative group"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* 3. Свечение за карточкой (Purple вместо Orange) */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-purple-600/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* 4. САМА КАРТОЧКА (Рамка при наведении становится фиолетовой) */}
          <div className="relative p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-purple-500/50 transition-all duration-300 text-center">
            
            {/* Иконка (Градиент фиолетовый) */}
            <motion.div 
              className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.3 }}
            >
              <Swords className="w-8 h-8 text-white" />
            </motion.div>
            
            {/* Цифры (Теперь сюда передается переменная count) */}
            <div className="text-5xl md:text-6xl font-cinzel font-bold text-white mb-2">
              <AnimatedCounter end={count} suffix="" />
            </div>
            
            {/* Текст */}
            <p className="text-white/60 text-lg uppercase tracking-wider">Battles Completed</p>
            
            {/* Линия внизу (Фиолетовая) */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}