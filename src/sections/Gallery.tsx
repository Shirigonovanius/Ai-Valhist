import { useState, useEffect } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { supabase } from '../supabase'; 
import { Header } from './Header';      
import { Footer } from './Footer';      

// 🚨 ВСТАВЬ СЮДА СВОЙ АДРЕС КОНТРАКТА!
const GALLERY_ADDRESS = "0x29726f097655bE0bD3F88282277735808bFa7F1d"; 

// 🖼️ ЗДЕСЬ МЕНЯЕТСЯ ФОНОВАЯ КАРТИНКА 
const BG_IMAGE = "https://i.ibb.co/HfBPPChS/15a17405-dc2a-4a9c-9de3-34c6630598eb.png";

const GALLERY_ABI = [
  "function toggleLike(uint256 imageId) external",
  "function getLikes(uint256 imageId) view returns (int256)",
  "function hasLiked(uint256 imageId, address user) view returns (bool)"
];

export function Gallery() {
  const [account, setAccount] = useState<string | null>(null);
  const [works, setWorks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setAccount(accounts[0]);
      } catch (e) { console.error(e); }
    }
  };

  useEffect(() => {
    connectWallet();
    fetchWorks();
    
    const channel = supabase
      .channel('public:prompts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'prompts' }, () => {
          fetchWorks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [account]);

  const fetchWorks = async () => {
    setLoading(true);
    const { data: prompts } = await supabase.from('prompts').select('*').order('created_at', { ascending: false }).limit(30);
    if (!prompts) return;

    let galleryContract: Contract | null = null;
    if (window.ethereum) {
        const provider = new BrowserProvider(window.ethereum);
        galleryContract = new Contract(GALLERY_ADDRESS, GALLERY_ABI, provider);
    }

    const worksWithLikes = await Promise.all(prompts.map(async (p) => {
        let likes = 0;
        let isLikedByMe = false;
        if (galleryContract && GALLERY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
            try {
                likes = Number(await galleryContract.getLikes(p.id));
                if (account) isLikedByMe = await galleryContract.hasLiked(p.id, account);
            } catch (e) { }
        }
        return { ...p, likes, isLikedByMe };
    }));

    setWorks(worksWithLikes);
    setLoading(false);
  };

  const handleToggleLike = async (workId: number) => {
    if (!account) return alert("Подключи кошелек!");
    if (GALLERY_ADDRESS === "0x0000000000000000000000000000000000000000") return alert("Вставь адрес контракта!");

    try {
        setProcessingId(workId);
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new Contract(GALLERY_ADDRESS, GALLERY_ABI, signer);
        const tx = await contract.toggleLike(workId);
        await tx.wait();
        
        setWorks(prev => prev.map(w => {
            if (w.id === workId) {
                return { ...w, likes: w.isLikedByMe ? w.likes - 1 : w.likes + 1, isLikedByMe: !w.isLikedByMe };
            }
            return w;
        }));
    } catch (e) { console.error(e); alert("Ошибка транзакции"); } 
    finally { setProcessingId(null); }
  };

  const sortedByLikes = [...works].sort((a, b) => b.likes - a.likes); 
  const freshDrops = works; 

  const ArtCard = ({ work, rank = null }: { work: any, rank?: number | null }) => (
    <div className="flex-none w-[280px] md:w-[320px] bg-[#111]/90 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden relative snap-center">
        {rank && (
            <div className="absolute top-3 left-3 z-20">
                 <span className={`font-black px-3 py-1 rounded-full text-sm shadow-lg ${rank === 1 ? 'bg-yellow-500 text-black' : rank === 2 ? 'bg-gray-300 text-black' : rank === 3 ? 'bg-orange-700 text-white' : 'bg-black/60 text-white border border-white/20'}`}>
                    #{rank}
                 </span>
            </div>
        )}
        
        <div className="relative aspect-square overflow-hidden bg-black">
                <img src={work.image_url} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        </div>
        
        <div className="p-4 flex justify-between items-center bg-[#0a0a0a]">
            <div className="overflow-hidden mr-2">
                {/* min-h-[20px] держит высоту, даже если текста нет */}
                <p className="text-gray-400 text-sm font-bold truncate hover:text-white cursor-pointer transition min-h-[20px]">
                    {/* Твиттер пока пустой */}
                </p>
            </div>
            
            <button 
                onClick={() => handleToggleLike(work.id)}
                disabled={processingId === work.id}
                className={`flex flex-col items-center justify-center min-w-[40px] px-2 py-1 rounded-lg border transition cursor-pointer ${work.isLikedByMe ? 'bg-red-900/20 border-red-500/30 text-red-500 hover:bg-red-900/40' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'}`}
            >
                <span className="text-lg">
                    {processingId === work.id ? '⏳' : (work.isLikedByMe ? '❤️' : '♡')}
                </span>
                <span className="text-xs font-bold">{work.likes}</span>
            </button>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-purple-500/30 flex flex-col relative">
      
      {/* 🔥 ИЗМЕНЕНИЯ ТУТ: Убрал opacity у картинки и сделал градиент светлее 🔥 */}
      <div className="fixed inset-0 z-0">
          <img src={BG_IMAGE} className="w-full h-full object-cover" alt="Background" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/90"></div>
      </div>

      <Header account={account} onConnect={connectWallet} />

      <main className="relative z-10 container mx-auto px-4 py-24 flex-grow flex flex-col gap-12 overflow-hidden">
        
        {loading ? (
             <div className="flex items-center justify-center h-[50vh] flex-col gap-4">
                 <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                 <p className="text-purple-400 animate-pulse font-mono">Syncing with Blockchain...</p>
             </div>
        ) : (
            <>
                {/* === SECTION 1: TOP RATED === */}
                <div className="animate-in fade-in slide-in-from-right duration-700">
                    <div className="flex items-center justify-between mb-6 px-2">
                        <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 pr-2">
                            TOP RATED
                        </h2>
                        <span className="text-xs text-gray-500 font-mono hidden md:inline-block">SCROLL ➔</span>
                    </div>
                    
                    <div className="flex overflow-x-auto gap-6 pb-8 px-2 no-scrollbar snap-x snap-mandatory">
                        {sortedByLikes.slice(0, 10).map((work, idx) => (
                            <ArtCard key={work.id} work={work} rank={idx + 1} />
                        ))}
                    </div>
                </div>

                {/* === SECTION 2: FRESH DROPS === */}
                <div className="animate-in fade-in slide-in-from-right duration-700 delay-100">
                    <div className="flex items-center justify-between mb-6 px-2">
                        <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 pr-2">
                            FRESH DROPS
                        </h2>
                        <span className="text-xs text-gray-500 font-mono hidden md:inline-block">SCROLL ➔</span>
                    </div>

                    <div className="flex overflow-x-auto gap-6 pb-8 px-2 no-scrollbar snap-x snap-mandatory">
                        {freshDrops.map((work) => (
                            <ArtCard key={`new-${work.id}`} work={work} />
                        ))}
                    </div>
                </div>
            </>
        )}

      </main>
      <Footer />
    </div>
  );
}