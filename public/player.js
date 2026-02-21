// === КОНФИГ ===
const USDC_ADDRESS = "0x...TOKEN..."; 
const ESCROW_ADDRESS = "0x...CONTRACT..."; 
const API_URL = "http://localhost:4000/api";

let state = {
    step: 'twitter', 
    userAddress: null,
    currentBet: 1,
    signer: null,
    battleId: null
};

// UI
const connectBtn = document.getElementById('connect-btn');
const connectText = document.getElementById('connect-text');
const connectIcon = document.getElementById('connect-icon');
const battleBtn = document.getElementById('battle-btn');
const betBox = document.getElementById('bet-box');
const betValue = document.getElementById('bet-value');

const lobbyScreen = document.getElementById('lobby-screen');
const waitingScreen = document.getElementById('waiting-screen');
const actionPanel = document.getElementById('action-panel');

// === 1. ПОДКЛЮЧЕНИЕ (Тихое и быстрое) ===
connectBtn.addEventListener('click', async () => {
    
    // TWITTER (Иллюзия)
    if (state.step === 'twitter') {
        connectBtn.classList.add('opacity-50');
        connectText.textContent = "Verifying...";
        
        // Маленькая задержка для реализма (0.8 сек)
        setTimeout(() => {
            state.step = 'wallet';
            connectBtn.classList.remove('opacity-50');
            
            connectIcon.textContent = "💳";
            connectText.textContent = "Connect Wallet";
        }, 800);
    } 
    
    // METAMASK (Реальный)
    else if (state.step === 'wallet') {
        if (!window.ethereum) return;
        try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            state.userAddress = accounts[0];
            state.signer = provider.getSigner();
            state.step = 'ready';

            // Красиво показываем адрес
            connectIcon.textContent = "●";
            connectIcon.style.color = "#4ade80";
            connectText.textContent = `${state.userAddress.slice(0,6)}...${state.userAddress.slice(-4)}`;
            connectBtn.style.border = "1px solid rgba(74, 222, 128, 0.3)";
            
        } catch (e) { console.error(e); }
    }
});

// === 2. СТАВКИ ===
betBox.addEventListener('click', () => {
    state.currentBet = state.currentBet === 1 ? 5 : (state.currentBet === 5 ? 10 : 1);
    betValue.textContent = state.currentBet;
});

// === 3. БИТВА (Транзакция -> Ожидание) ===
battleBtn.addEventListener('click', async () => {
    if (state.step !== 'ready') {
        // Мигаем кнопкой подключения, если забыл
        connectBtn.classList.add('bg-red-900');
        setTimeout(() => connectBtn.classList.remove('bg-red-900'), 300);
        return;
    }

    battleBtn.disabled = true;
    const originalText = battleBtn.innerHTML;

    try {
        // --- 1. БЛОКЧЕЙН ---
        // Имитируем Approve и Deposit (или вызываем реальные, если вписал адреса)
        
        if (ESCROW_ADDRESS.includes("0x...")) {
            // Если адреса нет, имитируем задержку транзакции
            battleBtn.innerHTML = "SIGNING...";
            await new Promise(r => setTimeout(r, 1000));
            battleBtn.innerHTML = "MINING...";
            await new Promise(r => setTimeout(r, 1500));
        } else {
            // Тут реальный код Ethers (как раньше)
            // ...
        }

        // --- 2. СЕРВЕР (Встаем в очередь) ---
        battleBtn.innerHTML = "JOINING...";
        
        const res = await fetch('/api/play', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ address: state.userAddress, stake: state.currentBet })
        });
        const data = await res.json();

        if (data.ok) {
            // УСПЕХ! Мы в очереди.
            state.battleId = data.battleId || null; // Если null - значит ждем
            
            // --- 3. СМЕНА ЭКРАНА (Включаем режим ожидания) ---
            lobbyScreen.classList.add('hidden');    // Скрываем демона
            waitingScreen.classList.remove('hidden'); // Показываем радар
            actionPanel.classList.add('opacity-50', 'pointer-events-none'); // Блокируем кнопки
            
            // Запускаем опрос сервера (ждем врага)
            startPolling();
        }

    } catch (e) {
        alert("Error: " + e.message);
        battleBtn.disabled = false;
        battleBtn.innerHTML = originalText;
    }
});

// === 4. ОПРОС СЕРВЕРА (Ждем соперника) ===
function startPolling() {
    const interval = setInterval(async () => {
        // Спрашиваем у сервера: "Ну че, нашли кого?"
        // В реальном коде тут запрос: /api/match/status
        
        // Для ТЕСТА: через 5 секунд находим "фейкового" врага
        // В реале удали этот setTimeout и раскомментируй fetch
        
        /* const res = await fetch(`/api/battles/${state.battleId}/status`);
        const data = await res.json();
        if (data.status === 'ready' || data.status === 'matched') {
             clearInterval(interval);
             alert("OPPONENT FOUND! FIGHT!");
             // Редирект на экран боя
        }
        */
       
       console.log("Searching...");
       
    }, 2000);
}