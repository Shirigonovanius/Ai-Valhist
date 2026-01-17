const $ = (id) => document.getElementById(id);
let myAddress = null;

// 1. ВАЖНО: Описание функции контракта, чтобы сайт знал, как её вызывать
const VOTING_ABI = [
  "function vote(uint256 battleId, int8 val) external"
];

async function init() {
  // Пытаемся подключить кошелек тихо
  if (window.ethereum) {
      const p = new ethers.BrowserProvider(window.ethereum);
      try {
          const s = await p.getSigner();
          myAddress = await s.getAddress();
          $('connectBtn').textContent = 'Кошелек: ' + myAddress.slice(0,6);
      } catch(e) {}
  }

  $('connectBtn').onclick = async () => {
      if(!window.ethereum) return alert('Нужен MetaMask');
      const p = new ethers.BrowserProvider(window.ethereum);
      await p.send('eth_requestAccounts', []);
      const s = await p.getSigner();
      myAddress = await s.getAddress();
      $('connectBtn').textContent = 'Кошелек: ' + myAddress.slice(0,6);
      location.reload(); 
  };

  loadGallery();
}

async function loadGallery() {
  try {
    const res = await fetch('/api/battles');
    const data = await res.json();
    if (!data.ok) return $('loading').textContent = 'Error';
    renderGallery(data.items);
  } catch (e) {
    $('loading').textContent = 'Error loading';
  }
}

function renderGallery(battles) {
  const grid = $('galleryGrid');
  $('loading').style.display = 'none';

  if (battles.length === 0) {
    grid.innerHTML = '<div class="muted">Галерея пуста.</div>';
    return;
  }

  grid.innerHTML = '';

  battles.forEach(b => {
    let winnerImg = b.p1_image_url;
    if (b.winner && b.player2 && b.winner.toLowerCase() === b.player2.toLowerCase()) {
        winnerImg = b.p2_image_url;
    }

    const card = document.createElement('div');
    card.className = 'battle-card';
    const shortAddr = b.winner ? (b.winner.slice(0, 6) + '...' + b.winner.slice(-4)) : 'Unknown';
    const score = b.score || 0;

    // ВАЖНО: В кнопках onclick вызываем voteOnChain
    card.innerHTML = `
      <img src="${winnerImg || 'https://via.placeholder.com/400?text=No+Image'}" class="winner-img">
      <div class="card-body">
        <div class="theme-tag">${b.theme || 'No Theme'}</div>
        <div class="winner-badge">🏆 ${shortAddr}</div>
        <div class="vote-box">
            <span class="muted" style="font-size:12px">Рейтинг:</span>
            <div class="vote-controls">
                <button class="vote-btn" onclick="voteOnChain(${b.id}, 1, this)">▲</button>
                <span class="score-val" id="score-${b.id}">${score}</span>
                <button class="vote-btn" onclick="voteOnChain(${b.id}, -1, this)">▼</button>
            </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ГЛАВНАЯ ФУНКЦИЯ ДЛЯ ТРАНЗАКЦИИ
async function voteOnChain(battleId, val, btnEl) {
    if (!window.ethereum) return alert("Сначала подключи кошелек (кнопка сверху)!");
    
    const originalText = btnEl.textContent;
    btnEl.textContent = "⏳"; // Часики
    btnEl.disabled = true;

    try {
        // 1. Получаем адрес контракта с сервера
        const cfgRes = await fetch('/api/config');
        const cfg = await cfgRes.json();
        const contractAddress = cfg.contracts.escrow; // Адрес из .env

        // 2. Инициализируем контракт
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // Вот тут мы используем VOTING_ABI
        const contract = new ethers.Contract(contractAddress, VOTING_ABI, signer);

        // 3. Отправляем транзакцию
        console.log(`Голосуем за битву ${battleId} значением ${val}...`);
        const tx = await contract.vote(battleId, val);
        
        btnEl.textContent = "⛓️"; // Значок цепи (отправлено)
        await tx.wait(); // Ждем подтверждения

        // 4. Синхронизируем с базой данных (для красивой сортировки)
        await fetch(`/api/battles/${battleId}/vote`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ address: await signer.getAddress(), val: val })
        });

        // 5. Обновляем UI
        const scoreEl = document.getElementById(`score-${battleId}`);
        let current = parseInt(scoreEl.textContent) || 0;
        scoreEl.textContent = current + val;
        
        btnEl.textContent = originalText;
        btnEl.style.color = val === 1 ? '#10b981' : '#ef4444';
        alert("Голос записан в блокчейн!");

    } catch (e) {
        console.error(e);
        btnEl.textContent = originalText;
        btnEl.disabled = false;
        
        // Расшифровка ошибок
        if (e.reason) alert("Ошибка контракта: " + e.reason); // Например "Already voted"
        else if (e.message && e.message.includes("rejected")) { /* Отмена */ }
        else alert("Ошибка. См. консоль (F12)");
    }
}

window.addEventListener('DOMContentLoaded', init);