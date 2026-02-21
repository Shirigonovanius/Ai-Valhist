import { useState, useEffect, useRef } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { motion } from 'framer-motion';
import { Trophy, Target, Zap, DollarSign, Heart, Crown, Medal, Star, Edit2, Upload, Check } from 'lucide-react';
import { supabase } from '../supabase';
import { Header } from './Header';
import { Footer } from './Footer';

// 🚨 ВСТАВЬ СЮДА СВОЙ АДРЕС КОНТРАКТА ГАЛЕРЕИ 
const GALLERY_ADDRESS = "0x29726f097655bE0bD3F88282277735808bFa7F1d"; 

const GALLERY_ABI = [
  "function getLikes(uint256 imageId) view returns (int256)"
];

const BG_IMAGE = "https://i.ibb.co/VY1ZjKhk/16d6b101-219f-416d-9884-6ec0c8acf94a.png";

export function Profile() {
  const [account, setAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Состояния для профиля (Имя и Аватар)
  const [profile, setProfile] = useState({ username: 'AI researcher', avatar_url: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stats, setStats] = useState({
      level: 1, wins: 0, totalBattles: 0, winRate: 0, earned: 0, maxStreak: 0, maxLikes: 0
  });

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setAccount(accounts[0]);
      } catch (e) { console.error(e); }
    }
  };

  useEffect(() => { connectWallet(); }, []);

  useEffect(() => {
    if (!account) return;

    const fetchProfileData = async () => {
        setLoading(true);
        try {
            // --- 0. ЗАГРУЖАЕМ ПРОФИЛЬ (ИМЯ И АВАТАР) ---
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .ilike('wallet_address', account)
                .single();

            if (profileData) {
                setProfile({
                    username: profileData.username || 'AI researcher',
                    avatar_url: profileData.avatar_url || ''
                });
                setEditName(profileData.username || 'AI researcher');
            } else {
                setEditName('AI researcher');
            }

            // --- 1. ЗАГРУЖАЕМ БОИ ---
            const { data: allBattles } = await supabase
                .from('battles')
                .select('*')
                .eq('status', 'completed')
                .order('created_at', { ascending: true });

            const myBattles = allBattles?.filter(b => 
                b.player1?.toLowerCase() === account.toLowerCase() || 
                b.player2?.toLowerCase() === account.toLowerCase()
            ) || [];

            let wins = 0, earned = 0, currentStreak = 0, maxStreak = 0;

            if (myBattles.length > 0) {
                myBattles.forEach(b => {
                    const isWinner = b.winner?.toLowerCase() === account.toLowerCase();
                    if (isWinner) {
                        wins++;
                        const battlePool = Number(b.stake) * 2;
                        earned += battlePool * 0.85; 
                        currentStreak++;
                        if (currentStreak > maxStreak) maxStreak = currentStreak;
                    } else {
                        currentStreak = 0; 
                    }
                });
            }

            earned = parseFloat(earned.toFixed(2));
            const totalBattles = myBattles.length;
            const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;
            const level = Math.floor(wins / 10) + 1; 

            // --- 2. ЗАГРУЖАЕМ ЛАЙКИ ---
            let maxLikes = 0;
            const { data: allPrompts } = await supabase.from('prompts').select('id, player_address');
            const myPrompts = allPrompts?.filter(p => p.player_address?.toLowerCase() === account.toLowerCase()) || [];

            if (myPrompts.length > 0 && window.ethereum && GALLERY_ADDRESS !== "0x29726f097655bE0bD3F88282277735808bFa7F1d") {
                const provider = new BrowserProvider(window.ethereum);
                const galleryContract = new Contract(GALLERY_ADDRESS, GALLERY_ABI, provider);
                for (const p of myPrompts) {
                    try {
                        const likes = Number(await galleryContract.getLikes(p.id));
                        if (likes > maxLikes) maxLikes = likes;
                    } catch (e) { }
                }
            }

            setStats({ level, wins, totalBattles, winRate, earned, maxStreak, maxLikes });
        } catch (error) { console.error("Ошибка:", error); }
        setLoading(false);
    };

    fetchProfileData();
  }, [account]);

  // --- ЛОГИКА СОХРАНЕНИЯ ПРОФИЛЯ ---
  const saveProfile = async () => {
      if (!account) return;
      try {
          const { error } = await supabase.from('profiles').upsert({
              wallet_address: account.toLowerCase(),
              username: editName,
              avatar_url: profile.avatar_url
          });
          
          if (error) throw error;
          setProfile({ ...profile, username: editName });
          setIsEditing(false);
      } catch (error) {
          console.error("Profile save error", error);
          alert("Failed to save profile");
      }
  };

  // --- ЛОГИКА ЗАГРУЗКИ АВАТАРА ---
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !account) return;

      setIsUploading(true);
      try {
          // Уникальное имя файла
          const fileExt = file.name.split('.').pop();
          const fileName = `${account}-${Math.random()}.${fileExt}`;

          // Загружаем в Storage (бакет 'avatars')
          const { error: uploadError } = await supabase.storage
              .from('avatars')
              .upload(fileName, file);

          if (uploadError) throw uploadError;

          // Получаем публичную ссылку
          const { data: { publicUrl } } = supabase.storage
              .from('avatars')
              .getPublicUrl(fileName);

          // Сразу сохраняем в БД
          await supabase.from('profiles').upsert({
              wallet_address: account.toLowerCase(),
              username: editName, // сохраняем текущее имя, чтобы не сбить
              avatar_url: publicUrl
          });

          setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
      } catch (error) {
          console.error("Avatar upload error", error);
          alert("Failed to load the image.");
      } finally {
          setIsUploading(false);
      }
  };

  const achievements = [
    { id: 'lvl5', title: 'Novice', desc: 'Reach Level 5', icon: <Star />, req: 5, current: stats.level, color: 'from-blue-400 to-blue-600' },
    { id: 'lvl10', title: 'Warrior', desc: 'Reach Level 10', icon: <Medal />, req: 10, current: stats.level, color: 'from-purple-400 to-purple-600' },
    { id: 'lvl50', title: 'Grandmaster', desc: 'Reach Level 50', icon: <Crown />, req: 50, current: stats.level, color: 'from-yellow-400 to-yellow-600' },
    
    { id: 'strk5', title: 'On Fire', desc: '5 Win Streak', icon: <Zap />, req: 5, current: stats.maxStreak, color: 'from-orange-400 to-red-500' },
    { id: 'strk10', title: 'Unstoppable', desc: '10 Win Streak', icon: <Zap />, req: 10, current: stats.maxStreak, color: 'from-red-500 to-rose-600' },
    { id: 'strk20', title: 'Godlike', desc: '20 Win Streak', icon: <Zap />, req: 20, current: stats.maxStreak, color: 'from-rose-500 to-pink-600' },
    
    { id: 'usd10', title: 'Hustler', desc: 'Earn 10 USDC', icon: <DollarSign />, req: 10, current: stats.earned, color: 'from-green-400 to-emerald-500' },
    { id: 'usd50', title: 'Baller', desc: 'Earn 50 USDC', icon: <DollarSign />, req: 50, current: stats.earned, color: 'from-emerald-400 to-teal-500' },
    { id: 'usd150', title: 'Whale', desc: 'Earn 150 USDC', icon: <DollarSign />, req: 150, current: stats.earned, color: 'from-teal-400 to-cyan-500' },
    
    { id: 'lik10', title: 'Noticed', desc: '10 Likes on Art', icon: <Heart />, req: 10, current: stats.maxLikes, color: 'from-pink-400 to-pink-600' },
    { id: 'lik50', title: 'Famous', desc: '50 Likes on Art', icon: <Heart />, req: 50, current: stats.maxLikes, color: 'from-fuchsia-400 to-fuchsia-600' },
    { id: 'lik100', title: 'Legend', desc: '100 Likes on Art', icon: <Heart />, req: 100, current: stats.maxLikes, color: 'from-purple-500 to-pink-600' },
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col relative overflow-x-hidden">
      
      <div className="fixed inset-0 z-0">
          <img src={BG_IMAGE} className="w-full h-full object-cover opacity-30" alt="Background" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/90"></div>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `linear-gradient(rgba(168, 85, 247, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(168, 85, 247, 0.1) 1px, transparent 1px)`, backgroundSize: '50px 50px' }} />
      </div>

      <Header account={account} onConnect={connectWallet} />

      <main className="relative z-10 container mx-auto px-4 py-32 flex-grow max-w-6xl">
        
        {!account ? (
             <div className="flex flex-col items-center justify-center h-[50vh] text-center gap-6">
                 <h2 className="text-4xl font-black uppercase text-purple-400">Profile Blocked</h2>
                 <p className="text-gray-400 text-lg">Connect your wallet to view your stats and achievements.</p>
                 <button onClick={connectWallet} className="px-8 py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold transition">Connect Wallet</button>
             </div>
        ) : loading ? (
             <div className="flex items-center justify-center h-[50vh]">
                 <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
             </div>
        ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                
                {/* === ШАПКА ПРОФИЛЯ === */}
                <div className="flex flex-col md:flex-row items-center gap-8 mb-16 bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                    
                    {/* АВАТАРКА */}
                    <div className="relative w-32 h-32 rounded-full border-4 border-purple-500/50 bg-black flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.3)] group">
                        
                        {isUploading ? (
                            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : profile.avatar_url ? (
                            <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                        ) : (
                            <span className="text-5xl">👤</span>
                        )}

                        {/* Кнопка загрузки аватара (показывается только при редактировании) */}
                        {isEditing && (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Upload className="w-6 h-6 text-white mb-1" />
                                <span className="text-[10px] font-bold text-white uppercase">Upload</span>
                            </div>
                        )}
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />

                        {/* Уровень поверх аватарки */}
                        <div className="absolute -bottom-4 bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-black border-2 border-black z-10">
                            LVL {stats.level}
                        </div>
                    </div>
                    
                    {/* ИНФОРМАЦИЯ И РЕДАКТИРОВАНИЕ */}
                    <div className="text-center md:text-left flex-1">
                        
                        {isEditing ? (
                            <div className="mb-3 flex flex-col md:flex-row items-center gap-3">
                                <input 
                                    type="text" 
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    maxLength={20}
                                    className="bg-black/50 border border-purple-500/50 rounded-xl px-4 py-2 text-2xl font-black text-white focus:outline-none focus:border-purple-500 text-center md:text-left w-full md:w-auto"
                                    placeholder="Your name..."
                                />
                                <button onClick={saveProfile} className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black px-4 py-2 rounded-xl font-bold transition w-full md:w-auto justify-center">
                                    <Check className="w-5 h-5" /> Save
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col md:flex-row items-center gap-4 mb-2">
                                <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                                    {profile.username}
                                </h1>
                                <button 
                                    onClick={() => setIsEditing(true)} 
                                    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white transition"
                                >
                                    <Edit2 className="w-4 h-4" /> Edit
                                </button>
                            </div>
                        )}

                        <p className="text-purple-400 font-mono bg-purple-500/10 inline-block px-3 py-1 rounded-lg border border-purple-500/20 text-sm md:text-base">
                            {account}
                        </p>
                    </div>
                </div>

                {/* === ОСНОВНЫЕ ПОКАЗАТЕЛИ === */}
                <h2 className="text-2xl font-bold uppercase tracking-widest text-gray-300 mb-6 flex items-center gap-2"><Target className="text-purple-500" /> Stats Dashboard</h2>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-16">
                    <div className="bg-[#111]/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:border-purple-500/50 transition group">
                        <Trophy className="w-8 h-8 text-yellow-500 mx-auto mb-3 group-hover:scale-110 transition" />
                        <div className="text-3xl font-black text-white mb-1">{stats.wins}</div>
                        <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total Wins</div>
                    </div>
                    <div className="bg-[#111]/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:border-blue-500/50 transition group">
                        <Target className="w-8 h-8 text-blue-500 mx-auto mb-3 group-hover:scale-110 transition" />
                        <div className="text-3xl font-black text-white mb-1">{stats.winRate}%</div>
                        <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Win Rate</div>
                    </div>
                    <div className="bg-[#111]/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:border-green-500/50 transition group">
                        <DollarSign className="w-8 h-8 text-green-500 mx-auto mb-3 group-hover:scale-110 transition" />
                        <div className="text-3xl font-black text-white mb-1">{stats.earned}</div>
                        <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">USDC Earned</div>
                    </div>
                    <div className="bg-[#111]/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:border-orange-500/50 transition group">
                        <Zap className="w-8 h-8 text-orange-500 mx-auto mb-3 group-hover:scale-110 transition" />
                        <div className="text-3xl font-black text-white mb-1">{stats.maxStreak}</div>
                        <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Best Streak</div>
                    </div>
                </div>

                {/* === АЧИВКИ === */}
                <h2 className="text-2xl font-bold uppercase tracking-widest text-gray-300 mb-6 flex items-center gap-2"><Medal className="text-yellow-500" /> Achievements</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-20">
                    {achievements.map((ach) => {
                        const isUnlocked = ach.current >= ach.req;
                        const progress = Math.min((ach.current / ach.req) * 100, 100);

                        return (
                            <div key={ach.id} className={`relative overflow-hidden rounded-2xl p-6 border transition-all duration-500 ${isUnlocked ? 'bg-white/5 border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.05)]' : 'bg-black/40 border-white/5 grayscale opacity-60'}`}>
                                
                                {isUnlocked && (
                                    <div className={`absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br ${ach.color} rounded-full blur-3xl opacity-20 pointer-events-none`}></div>
                                )}
                                
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className={`p-3 rounded-xl flex-shrink-0 ${isUnlocked ? `bg-gradient-to-br ${ach.color} shadow-lg` : 'bg-gray-800'}`}>
                                        <div className="text-white">{ach.icon}</div>
                                    </div>
                                    
                                    <div className="flex-1">
                                        <h3 className={`font-black text-lg ${isUnlocked ? 'text-white' : 'text-gray-500'}`}>{ach.title}</h3>
                                        <p className="text-xs text-gray-400 mb-3">{ach.desc}</p>
                                        
                                        <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full ${isUnlocked ? `bg-gradient-to-r ${ach.color}` : 'bg-gray-700'}`}
                                                style={{ width: `${progress}%` }}
                                            ></div>
                                        </div>
                                        <div className="text-right mt-1 text-[10px] font-mono text-gray-500">
                                            {Math.min(ach.current, ach.req)} / {ach.req}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

            </motion.div>
        )}
      </main>
      <Footer />
    </div>
  );
}