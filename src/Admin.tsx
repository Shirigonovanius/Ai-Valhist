import { useState, useEffect } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { supabase } from './supabase';

const ESCROW_ADDRESS = "0x278667f7e115932F35bdc2280dC47b41cE170F2B";
const ESCROW_ABI = [
  "function closeBattle(uint256 battleId, address winner) external",
  "function owner() view returns (address)"
];

export function Admin() {
  const [account, setAccount] = useState<string | null>(null);
  const [contractOwner, setContractOwner] = useState<string | null>(null);
  const [battles, setBattles] = useState<any[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<any>(null);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setAccount(accounts[0]);
        
        const signer = await provider.getSigner();
        const contract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
        try {
            const owner = await contract.owner();
            setContractOwner(owner);
        } catch (e) { console.error(e); }

      } catch (e) { console.error(e); }
    } else { alert("Нужен MetaMask"); }
  };

  const fetchBattles = async () => {
    const { data } = await supabase
        .from('battles')
        .select('*')
        .order('created_at', { ascending: false });
    setBattles(data || []);
  };

  const selectBattle = async (battle: any) => {
    setSelectedBattle(battle);
    const { data } = await supabase.from('prompts').select('*').eq('battle_id', battle.id);
    setPrompts(data || []);
  };

  // --- ГЛАВНАЯ ФУНКЦИЯ ---
  const handlePayout = async (winnerAddr: string) => {
    if (!account || !contractOwner) return;
    if (account.toLowerCase() !== contractOwner.toLowerCase()) {
        alert("ТЫ НЕ АДМИН!"); return;
    }

    if (!window.confirm(`Выбрать победителя ${winnerAddr}?`)) return;
    
    setStatus("1/2 ⏳ Отправка в Блокчейн...");
    
    try {
      // 1. БЛОКЧЕЙН (ПЛАТИМ ДЕНЬГИ)
      // Если статус уже completed, значит мы платили раньше, пропускаем этот шаг
      if (selectedBattle.status !== 'completed') {
          try {
              const provider = new BrowserProvider(window.ethereum);
              const signer = await provider.getSigner();
              const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);

              const tx = await escrow.closeBattle(selectedBattle.onchain_battle_id, winnerAddr, { gasLimit: 5000000 });
              setStatus("⏳ Ждем подтверждения сети...");
              await tx.wait();
              alert("✅ Блокчейн подтвердил! Обновляю статус...");
          } catch (chainError: any) {
              console.error(chainError);
              // Если ошибка "transaction reverted", возможно уже выплачено. Спросим юзера.
              if (chainError.message.includes("revert") || chainError.message.includes("finished")) {
                 if(!confirm("Похоже, выплата уже была. Просто обновить статус в базе?")) {
                     setStatus("❌ Отменено");
                     return;
                 }
              } else {
                  setStatus("❌ Ошибка сети: " + chainError.message);
                  return;
              }
          }
      }

      // 2. БАЗА ДАННЫХ (ОБНОВЛЯЕМ ТОЛЬКО СТАТУС И ПОБЕДИТЕЛЯ)
      setStatus("2/2 💾 Сохранение...");
      
      // 🔥 ИСПРАВЛЕНИЕ: Мы убрали winner_tx, чтобы не создавать колонку
      const { error } = await supabase.from('battles').update({ 
          status: 'completed', 
          winner: winnerAddr
      }).eq('id', selectedBattle.id);

      if (error) {
          console.error("ОШИБКА SUPABASE:", error);
          alert(`Ошибка базы: ${error.message}`);
          setStatus("❌ Ошибка базы");
      } else {
          alert("🎉 УСПЕХ! Битва закрыта.");
          setStatus("");
          fetchBattles();
      }

    } catch (e: any) {
      console.error(e);
      setStatus("❌ Ошибка");
      alert(e.message);
    }
  };

  // Кнопка для ручного фикса (без газа)
  const forceDbUpdate = async (winnerAddr: string) => {
      if(!confirm("Обновить базу без оплаты газа? (Нажимай, если сайт завис, а деньги ушли)")) return;
      
      // 🔥 ИСПРАВЛЕНИЕ: Тут тоже убрали winner_tx
      const { error } = await supabase.from('battles').update({ 
          status: 'completed', 
          winner: winnerAddr
      }).eq('id', selectedBattle.id);

      if (error) alert("Ошибка: " + error.message);
      else {
          alert("✅ База обновлена!");
          fetchBattles();
      }
  }

  useEffect(() => { fetchBattles(); }, []);

  if (!account) return <div className="h-screen flex items-center justify-center bg-black"><button onClick={connectWallet} className="bg-white px-8 py-4 font-bold text-xl rounded">LOGIN ADMIN</button></div>;

  const isAdmin = contractOwner && account && contractOwner.toLowerCase() === account.toLowerCase();

  return (
    <div className="min-h-screen bg-gray-900 text-white flex font-sans">
      <div className="w-96 border-r border-gray-700 bg-black flex flex-col">
        <div className={`p-4 border-b ${isAdmin ? 'bg-green-900/20' : 'bg-red-900/20'}`}>
            <div className="text-xs text-gray-400">Admin: {account?.slice(0,6)}...</div>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
            {battles.map(b => (
            <div key={b.id} onClick={() => selectBattle(b)} className={`p-4 mb-2 border rounded-lg cursor-pointer ${selectedBattle?.id === b.id ? 'bg-purple-900/50 border-purple-500' : 'bg-gray-900 border-gray-700'}`}>
                <div className="flex justify-between">
                    <span className="font-bold">#{b.onchain_battle_id}</span>
                    <span className={`text-[10px] px-2 rounded font-bold uppercase ${b.status === 'completed' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>{b.status}</span>
                </div>
                <div className="text-sm text-gray-300 truncate">{b.theme}</div>
            </div>
            ))}
        </div>
      </div>

      <div className="flex-1 p-8 relative bg-[#0a0a0a]">
        {status && <div className="absolute top-0 left-0 w-full bg-blue-600 p-3 text-center font-bold shadow-lg z-50 animate-pulse">{status}</div>}
        
        {selectedBattle && (
            <div className="max-w-5xl mx-auto w-full">
                <h1 className="text-4xl font-black mb-2 uppercase text-purple-500">{selectedBattle.theme}</h1>
                <p className="mb-8 text-gray-400">ID: {selectedBattle.id} | Status: {selectedBattle.status}</p>
                
                <div className="grid grid-cols-2 gap-10">
                    {prompts.map((p, idx) => (
                        <div key={p.id} className="bg-gray-800 p-5 rounded-2xl border border-gray-700 flex flex-col">
                            <div className="relative aspect-square bg-black mb-4 rounded-xl overflow-hidden">
                                {p.image_url && <img src={p.image_url} className="w-full h-full object-cover" />}
                            </div>
                            <p className="text-gray-400 text-xs font-mono mb-2">{p.player_address}</p>
                            <p className="italic bg-black/30 p-3 rounded mb-4">"{p.prompt}"</p>
                            
                            <button 
                                onClick={() => handlePayout(p.player_address)} 
                                className="w-full bg-green-600 hover:bg-green-500 py-3 rounded font-bold uppercase mb-2"
                            >
                                🏆 ВЫБРАТЬ ПОБЕДИТЕЛЯ
                            </button>

                            <button 
                                onClick={() => forceDbUpdate(p.player_address)} 
                                className="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded text-xs text-gray-300"
                            >
                                🛠 Только обновить базу
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}