import { useState, useEffect } from 'react';
import { Header } from './sections/Header';
import { Hero } from './sections/Hero';
import { Stats } from './sections/Stats'; 
import { Footer } from './sections/Footer';
import { ParticleBackground } from './components/ParticleBackground';
import { BrowserProvider, Contract, parseUnits } from 'ethers';
import { supabase } from './supabase';

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"; 
const ESCROW_ADDRESS = "0x278667f7e115932F35bdc2280dC47b41cE170F2B";
const BATTLE_BG_IMAGE = "https://i.ibb.co/VY1ZjKhk/16d6b101-219f-416d-9884-6ec0c8acf94a.png"; 

const TX_OVERRIDES = { gasLimit: 5000000 }; 

const USDC_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const ESCROW_ABI = [
  "function createBattle(uint256 amount) external",
  "function joinBattle(uint256 battleId) external", 
  "function battleCounter() view returns (uint256)"
];

// --- НАСТРОЙКИ СЕТИ ARC TESTNET ---
const TARGET_CHAIN_ID = "0x4cef52"; // 5042002 в HEX
const TARGET_NETWORK_PARAMS = {
  chainId: TARGET_CHAIN_ID,
  chainName: 'Arc Testnet',
  nativeCurrency: { 
    name: 'USDC', 
    symbol: 'USDC', 
    decimals: 18 
  },
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app/']
};

declare global { interface Window { ethereum?: any; } }

export function Game() {
  const [account, setAccount] = useState<string | null>(null);
  const [status, setStatus] = useState(""); 
  
  const [activeBattleId, setActiveBattleId] = useState<number | null>(null); 
  const [battleTheme, setBattleTheme] = useState<string>("");
  const [opponentStatus, setOpponentStatus] = useState<string>("Waiting for opponent...");
  
  const [myPrompt, setMyPrompt] = useState("");
  const [gameStatus, setGameStatus] = useState("waiting_prompt"); 
  const [battleResult, setBattleResult] = useState<any>(null);
  const [cooldownMessage, setCooldownMessage] = useState(""); 

  // --- ФУНКЦИЯ ПРОВЕРКИ И ПЕРЕКЛЮЧЕНИЯ СЕТИ ---
  const checkAndSwitchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_ID }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [TARGET_NETWORK_PARAMS],
          });
        } catch (addError) {
          console.error("Failed to add network:", addError);
        }
      } else {
        console.error("Failed to switch network:", switchError);
      }
    }
  };

  useEffect(() => {
    const checkWallet = async () => {
        if (window.ethereum) {
            try {
                const provider = new BrowserProvider(window.ethereum);
                const accounts = await provider.send("eth_accounts", []);
                if (accounts.length > 0) {
                    setAccount(accounts[0]);
                    await checkAndSwitchNetwork(); // Проверяем сеть при авто-подключении
                }
            } catch (e) { console.error("Auto-connect failed", e); }
        }
    };
    checkWallet();
  }, []);

  useEffect(() => {
    if (!account) return;

    const restoreSession = async () => {
        const { data: battles } = await supabase
            .from('battles')
            .select('*')
            .or(`player1.eq.${account},player2.eq.${account}`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (battles && battles.length > 0) {
            const lastBattle = battles[0];

            if (lastBattle.status === 'completed') {
                return;
            }

            setActiveBattleId(lastBattle.onchain_battle_id);
            setBattleTheme(lastBattle.theme);

            const { data: prompts } = await supabase.from('prompts')
                .select('*')
                .eq('battle_id', lastBattle.id)
                .eq('player_address', account);

            const hasPromptInDB = prompts && prompts.length > 0;
            if (hasPromptInDB) {
                setMyPrompt(prompts[0].prompt);
            }

            if (lastBattle.status === 'waiting_for_admin' || lastBattle.status === 'finished') {
                setGameStatus('judging');
                fetchBattleResults(lastBattle.onchain_battle_id);
            } else {
                if (hasPromptInDB) {
                    setGameStatus("generating");
                } else {
                    setGameStatus("waiting_prompt");
                }
            }
        }
    };
    restoreSession();
  }, [account]);

  const resetGame = () => {
      setActiveBattleId(null);
      setBattleTheme("");
      setMyPrompt("");
      setBattleResult(null);
      setGameStatus("waiting_prompt");
      setOpponentStatus("Waiting for opponent...");
  };

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setAccount(accounts[0]);
        await checkAndSwitchNetwork(); // Проверяем сеть при ручном подключении
      } catch (error) { console.error(error); }
    } else { alert("Please install MetaMask!"); }
  };

  useEffect(() => {
    if (!activeBattleId) return;
    
    const subscription = supabase
      .channel('battle-updates')
      .on('postgres_changes', { 
          event: 'UPDATE', schema: 'public', table: 'battles', 
          filter: `onchain_battle_id=eq.${activeBattleId}` 
      }, (payload) => { 
          handleStatusUpdate(payload.new); 
      })
      .subscribe();

    const interval = setInterval(() => { checkCurrentStatus(); }, 2000);
    return () => { supabase.removeChannel(subscription); clearInterval(interval); }
  }, [activeBattleId]);

  const handleStatusUpdate = async (battle: any) => {
      // 🔥 ГЛАВНЫЙ ФИКС: Принудительно синхронизируем тему из базы для обоих игроков!
      if (battle.theme) {
          setBattleTheme(battle.theme);
      }

      if (battle.status === 'ready_for_generation') setOpponentStatus("Opponent joined!");
      
      if (battle.status === 'waiting_player_2' || battle.status === 'ready_for_generation') {
          setGameStatus(prev => prev === 'generating' ? 'generating' : 'waiting_prompt');
      }

      if (battle.status === 'generating') {
          setGameStatus('generating');
      }

      if (battle.status === 'waiting_for_admin' || battle.status === 'finished') {
          setGameStatus('judging');
          fetchBattleResults(battle.onchain_battle_id);
      }

      if (battle.status === 'completed') {
          setGameStatus('completed');
          fetchBattleResults(battle.onchain_battle_id);
      }
  };

  const checkCurrentStatus = async () => {
      if (!activeBattleId) return;
      const { data: battles } = await supabase.from('battles').select('*').eq('onchain_battle_id', activeBattleId).limit(1);
      if (battles && battles.length > 0) {
          handleStatusUpdate(battles[0]);
      }
  };

  const fetchBattleResults = async (battleId: number) => {
      if (!account) return;
      const { data: battles } = await supabase.from('battles').select('*').eq('onchain_battle_id', battleId).limit(1);
      const battle = battles?.[0];
      if (!battle) return;

      const { data: prompts } = await supabase.from('prompts').select('*').eq('battle_id', battle.id);
      const myData = prompts?.find(p => p.player_address?.toLowerCase() === account?.toLowerCase());
      const oppData = prompts?.find(p => p.player_address?.toLowerCase() !== account?.toLowerCase());

      setBattleResult({
          winner: battle.winner,
          myImage: myData?.image_url,
          oppImage: oppData?.image_url,
          myPrompt: myData?.prompt,
          oppPrompt: oppData?.prompt
      });
  };

  const handleMatchmaking = async (amount: number) => {
    if (!account) return connectWallet();
    setStatus(`Checking wallet...`);

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);
      const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);

      let decimals = 18;
      try { decimals = await usdc.decimals(); } catch(e) {}
      const amountInWei = parseUnits(amount.toString(), decimals); 

      const allowance = await usdc.allowance(account, ESCROW_ADDRESS);
      if (allowance < amountInWei) {
        setStatus("✍️ Approving tokens...");
        const txApprove = await usdc.approve(ESCROW_ADDRESS, amountInWei * 100n, TX_OVERRIDES);
        await txApprove.wait();
      }

      setStatus(`🔍 Looking for rooms...`);
      let { data: openBattles } = await supabase
        .from('battles')
        .select('*')
        .eq('status', 'waiting_player_2')
        .eq('stake', amount)
        .neq('player1', account)
        .order('created_at', { ascending: true })
        .limit(1);

      if (openBattles && openBattles.length > 0) {
          const battle = openBattles[0];
          setStatus(`⚔️ Joining Battle #${battle.onchain_battle_id}...`);
          const txJoin = await escrow.joinBattle(battle.onchain_battle_id, TX_OVERRIDES);
          setStatus("⏳ Waiting for confirmation...");
          await txJoin.wait(); 

          await supabase.from('battles').update({ player2: account, status: 'ready_for_generation' }).eq('id', battle.id);
          await supabase.from('deposits').insert([{ battle_id: battle.onchain_battle_id, player_address: account, amount: amount, tx_hash: txJoin.hash, status: 'confirmed' }]);

          resetGame(); 
          setActiveBattleId(battle.onchain_battle_id);
          setBattleTheme(battle.theme);
          setOpponentStatus("Opponent is here!");
          setStatus("🚀 Joined!");
      } else {
          setStatus("🆕 Creating new room...");
          const txCreate = await escrow.createBattle(amountInWei, TX_OVERRIDES);
          setStatus("⏳ Waiting for confirmation...");
          await txCreate.wait(); 
          
          const currentCounter = await escrow.battleCounter();
          const battleIdNum = Number(currentCounter);
          const THEMES_LIST = ["Cyberpunk Samurai", "Future City on Mars", "Space Cat", "Ancient God", "Underwater Castle"];
          const theme = THEMES_LIST[Math.floor(Math.random() * THEMES_LIST.length)];
          
          resetGame(); 
          
          await supabase.from('battles').upsert([{ 
                player1: account, 
                stake: amount, 
                status: 'waiting_player_2', 
                tx_hash: txCreate.hash, 
                onchain_battle_id: battleIdNum, 
                theme: theme 
          }], { onConflict: 'onchain_battle_id' });

          await supabase.from('deposits').insert([{ battle_id: battleIdNum, player_address: account, amount: amount, tx_hash: txCreate.hash, status: 'confirmed' }]);

          setBattleTheme(theme);
          setActiveBattleId(battleIdNum);
          setStatus("⏳ Room Created!");
          setOpponentStatus("Waiting for anyone to join...");
      }
    } catch (error: any) { console.error(error); setStatus(""); alert(error.reason || error.message); } 
  };

  const submitPrompt = async () => {
      if (!activeBattleId || !myPrompt || !account) return; 

      const twoMinutesAgo = new Date(Date.now() - 2 * 60000).toISOString();
      
      const { count } = await supabase
          .from('prompts')
          .select('*', { count: 'exact', head: true })
          .eq('player_address', account)
          .gte('created_at', twoMinutesAgo);

      if (count !== null && count >= 3) {
          setCooldownMessage("You need to wait a little bit to not overload the system.");
          setTimeout(() => setCooldownMessage(""), 5000);
          return; 
      }

      setStatus("📝 Sending prompt...");

      const { data: battles } = await supabase.from('battles').select('id').eq('onchain_battle_id', activeBattleId).limit(1);
      if (!battles || battles.length === 0) return;
      
      const { error } = await supabase.from('prompts').insert([{
          battle_id: battles[0].id,
          player_address: account,
          prompt: myPrompt 
      }]);

      if (error && error.code !== '23505') {
           alert("DB Error: " + error.message);
           setStatus("");
      } else {
           setStatus("✅ Prompt sent!");
           setGameStatus("generating");
      }
  };

  const isWinner = battleResult?.winner && account && battleResult.winner.toLowerCase() === account.toLowerCase();

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden flex flex-col font-sans selection:bg-purple-500/30 relative">
      
      {!activeBattleId && <div className="fixed inset-0 z-0 pointer-events-none"><ParticleBackground /></div>}
      {activeBattleId && (
        <div className="fixed inset-0 z-0">
          <img src={BATTLE_BG_IMAGE} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50"></div>
        </div>
      )}

      {status && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-pulse">
           <div className="bg-purple-900/90 text-white px-8 py-3 rounded-full border border-purple-500 shadow-lg font-bold backdrop-blur-md">
              {status}
           </div>
        </div>
      )}
      
      <Header account={account} onConnect={connectWallet} />
      
      <main className="relative z-10 flex-grow flex flex-col w-full min-h-[80vh]">
        {!activeBattleId && (
            <div className="flex flex-col justify-between h-full">
                <Hero onBattle={handleMatchmaking} /> 
                <Stats />
            </div>
        )}

        {activeBattleId && (
            <div className="flex-grow flex items-center justify-center p-4">
                <div className="w-full max-w-5xl animate-in fade-in zoom-in duration-500">
                    <div className="text-center mb-2">
                        <span className="bg-white/10 px-3 py-1 rounded text-xs font-mono text-gray-400">
                            ID ROOM: #{activeBattleId}
                        </span>
                    </div>
                    
                    <div className="flex flex-col items-center justify-center mb-8 gap-4">
                        <div className="inline-flex items-center gap-3 bg-black/60 border border-purple-500/30 px-6 py-3 rounded-full backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                            <span className="text-purple-400 font-bold tracking-wider text-sm">THEME</span>
                            <div className="h-4 w-[1px] bg-white/20"></div>
                            <span className="text-white tracking-wide font-mono text-lg font-bold uppercase">
                                {battleTheme || "Loading..."}
                            </span>
                        </div>
                        {gameStatus !== 'completed' && gameStatus !== 'judging' && (
                             <div className="bg-black/50 px-4 py-1 rounded-full border border-white/5">
                                 <p className="text-white/80 text-sm font-mono animate-pulse">{opponentStatus}</p>
                             </div>
                        )}
                    </div>

                    {gameStatus === "waiting_prompt" && (
                        <div className="relative group max-w-3xl mx-auto">
                            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-3xl opacity-30 group-hover:opacity-50 blur transition duration-500"></div>
                            <div className="relative bg-[#0f0f0f]/90 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
                                <div className="flex flex-col gap-4">
                                    <label className="text-white/80 text-sm ml-2 font-bold">Describe your image:</label>
                                    <textarea 
                                            className="w-full bg-black/60 border border-white/20 rounded-2xl p-6 text-white text-lg focus:outline-none focus:border-purple-500 transition-all h-48 resize-none font-light leading-relaxed"
                                            placeholder="Example: A futuristic samurai..."
                                            value={myPrompt}
                                            onChange={(e) => setMyPrompt(e.target.value)}
                                    />
                                    <button onClick={submitPrompt} disabled={!myPrompt} className="mt-2 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-xl shadow-[0_4px_20px_rgba(124,58,237,0.4)] transition-all">
                                            GENERATE ART 🎨
                                    </button>
                                    {cooldownMessage && (
                                        <p className="text-red-500 font-bold text-center mt-4 animate-pulse">
                                            {cooldownMessage}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {gameStatus === "generating" && (
                        <div className="w-full max-w-4xl mx-auto animate-in fade-in">
                            <div className="text-center mb-8 animate-pulse">
                                <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                                    NEURAL NETWORKS ARE FIGHTING...
                                </h3>
                            </div>
                            <div className="flex flex-col md:flex-row items-center justify-center gap-8 relative">
                                <div className="relative w-full md:w-1/2 aspect-square bg-black/40 rounded-3xl border-2 border-purple-500/30 overflow-hidden">
                                    <div className="absolute inset-0 bg-purple-500/10 animate-pulse"></div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <div className="text-4xl mb-2">🎨</div>
                                        <p className="text-purple-300 font-mono text-sm">YOUR ART IS READY</p>
                                    </div>
                                </div>
                                <div className="absolute z-10 bg-black border border-white/20 rounded-full w-16 h-16 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                                    <span className="font-black text-xl italic text-white">VS</span>
                                </div>
                                <div className="relative w-full md:w-1/2 aspect-square bg-black/40 rounded-3xl border-2 border-red-500/30 overflow-hidden">
                                    <div className="absolute inset-0 bg-red-500/5 animate-pulse"></div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <div className="text-4xl mb-2">🤖</div>
                                        <p className="text-red-400 font-mono text-sm">OPPONENT IS GENERATING</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {gameStatus === "judging" && (
                        <div className="w-full max-w-6xl mx-auto animate-in fade-in duration-1000">
                             <div className="text-center mb-10">
                                <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 animate-pulse">
                                    ⚖️ JUDGE IS DECIDING...
                                </h1>
                                <p className="text-gray-400 mt-2">The admin is reviewing the artworks. Winner will be paid shortly.</p>
                            </div>
                            
                            {battleResult && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 relative">
                                    <div className="relative group rounded-3xl overflow-hidden ring-2 ring-purple-500/30">
                                        <div className="absolute top-0 left-0 w-full bg-black/60 p-4 z-20 flex justify-between items-center">
                                            <span className="font-bold px-3 py-1 rounded-full text-xs bg-purple-500 text-white">YOU</span>
                                        </div>
                                        <img src={battleResult.myImage || "https://placehold.co/1024x1024?text=Loading..."} className="w-full aspect-square object-cover" />
                                    </div>
                                    <div className="relative group rounded-3xl overflow-hidden ring-2 ring-red-500/30">
                                        <div className="absolute top-0 left-0 w-full bg-black/60 p-4 z-20 flex justify-between items-center">
                                            <span className="font-bold px-3 py-1 rounded-full text-xs bg-red-600 text-white">OPPONENT</span>
                                        </div>
                                        <img src={battleResult.oppImage || "https://placehold.co/1024x1024?text=Loading..."} className="w-full aspect-square object-cover" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {gameStatus === "completed" && (
                        <div className="w-full max-w-6xl mx-auto animate-in fade-in duration-1000">
                            {battleResult ? (
                                <>
                                    <div className="text-center mb-10 transform transition-all duration-500 hover:scale-105">
                                        {isWinner ? (
                                            <>
                                                <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)]">VICTORY</h1>
                                            </>
                                        ) : (
                                            <>
                                                <h1 className="text-7xl font-black text-gray-500 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] tracking-tighter">DEFEAT</h1>
                                            </>
                                        )}
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 relative">
                                        <div className={`relative group rounded-3xl overflow-hidden transition-all duration-500 ${isWinner ? 'ring-4 ring-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.3)] scale-105 z-10' : 'opacity-80 grayscale-[0.5] scale-95'}`}>
                                            <div className="absolute top-0 left-0 w-full bg-gradient-to-b from-black/80 to-transparent p-4 z-20 flex justify-between items-center">
                                                <span className={`font-bold px-3 py-1 rounded-full text-xs ${isWinner ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white'}`}>YOU</span>
                                                {isWinner && <span className="text-2xl">👑</span>}
                                            </div>
                                            <img src={battleResult.myImage} className="w-full aspect-square object-cover" />
                                        </div>
                                        <div className={`relative group rounded-3xl overflow-hidden transition-all duration-500 ${!isWinner ? 'ring-4 ring-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.3)] scale-105 z-10' : 'opacity-80 grayscale-[0.5] scale-95'}`}>
                                            <div className="absolute top-0 left-0 w-full bg-gradient-to-b from-black/80 to-transparent p-4 z-20 flex justify-between items-center">
                                                <span className="font-bold px-3 py-1 rounded-full text-xs bg-red-600 text-white">OPPONENT</span>
                                                {!isWinner && <span className="text-2xl">👑</span>}
                                            </div>
                                            <img src={battleResult.oppImage} className="w-full aspect-square object-cover" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center mt-20 animate-pulse">
                                    <h2 className="text-2xl font-bold text-white">LOADING RESULTS...</h2>
                                </div>
                            )}

                            <div className="text-center mt-12">
                                <button 
                                    onClick={resetGame} 
                                    className="px-10 py-4 bg-white text-black font-black tracking-widest rounded-full hover:bg-purple-400 hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                >
                                    PLAY AGAIN ↻
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
      </main>
      <Footer />
    </div>
  );
}