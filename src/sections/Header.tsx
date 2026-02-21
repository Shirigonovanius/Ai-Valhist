import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Twitter, Menu, X } from 'lucide-react';
import { supabase } from '../supabase';
import { Link } from 'react-router-dom'; // 1. Импорт для переходов

interface HeaderProps {
  account?: string | null;
  onConnect?: () => void;
}

export function Header({ account, onConnect }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const [isTwitterConnected, setIsTwitterConnected] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsTwitterConnected(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsTwitterConnected(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleTwitterConnect = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'twitter',
        options: {
          redirectTo: window.location.origin, 
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error(error);
      alert("Ошибка подключения к Twitter: " + error.message);
    }
  };

  // 2. ТВОЙ СПИСОК (БЕЗ "BATTLE"). Изменил только href у Gallery.
 const navItems = [
    { label: 'Battle Arena', href: '/' },
    { label: 'Gallery', href: '/gallery' },
    { label: 'Profile', href: '/profile' }, // 👈 ЗДЕСЬ ИЗМЕНИЛ
    { label: 'Leaderboard', href: '#leaderboard' }, // Лидерборд пока оставляем как заглушку
  ];

  return (
    <motion.header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? 'py-3 bg-black/80 backdrop-blur-md border-b border-white/5' : 'py-5 bg-transparent'
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        
        {/* Логотип (Обернул в Link, чтобы возвращаться на главную) */}
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
           <span className="font-cinzel font-bold text-white text-xl md:text-2xl">
             Ai <span className="text-purple-500" style={{ textShadow: '0 0 20px rgba(168,85,247,0.5)' }}>Entropy</span>
           </span>
        </Link>

        {/* Меню (десктоп) */}
        <nav className="hidden md:flex items-center gap-1 bg-white/5 backdrop-blur-md rounded-full px-2 py-1 border border-white/10">
            {navItems.map((item) => (
              // 3. Заменил <a> на <Link>
              <Link 
                key={item.label} 
                to={item.href} 
                className="px-5 py-2 text-white/70 hover:text-white transition-colors font-medium text-sm"
              >
                {item.label}
              </Link>
            ))}
        </nav>

        {/* ПРАВАЯ ЧАСТЬ: КНОПКИ (ТВОЙ КОД БЕЗ ИЗМЕНЕНИЙ) */}
        <div className="flex flex-col items-end gap-2 relative min-w-[160px]">
            <AnimatePresence mode="wait">
              {!isTwitterConnected ? (
                <motion.button
                  key="twitter-btn"
                  onClick={handleTwitterConnect}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.4)] transition-all duration-300 cursor-pointer"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Twitter className="w-4 h-4 fill-white" />
                  <span>Connect X</span>
                </motion.button>
              ) : (
                <motion.button
                  key="wallet-btn"
                  onClick={onConnect}
                  className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-medium text-sm shadow-[0_0_20px_rgba(147,51,234,0.4)] transition-all whitespace-nowrap cursor-pointer"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Wallet className="w-4 h-4" />
                  <span>
                    {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
                  </span>
                </motion.button>
              )}
            </AnimatePresence>
        </div>

        {/* Мобильное меню */}
        <div className="md:hidden">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </motion.header>
  );
}