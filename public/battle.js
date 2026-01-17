const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const battleId = params.get('battleId');

let provider, signer, address;

// ABI для голосования (на будущее)
const VOTING_ABI = ["function vote(uint256 battleId, int8 val) external"];

async function init() {
  if($('statusBadge')) $('statusBadge').textContent = 'Initializing...';

  // 1. Проверяем ID
  if (!battleId) {
      showError('Error: No Battle ID in URL');
      return;
  }

  // 2. Подключаем кошелек (тихо)
  if (window.ethereum) {
      try {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        address = await signer.getAddress();
      } catch (e) {
        console.warn("Wallet not connected yet or locked");
      }
  }

  // 3. Запускаем цикл проверки
  checkLoop();
}

async function checkLoop() {
  await checkStatus();
  setTimeout(checkLoop, 2000);
}

async function checkStatus() {
  try {
    const res = await fetch(`/api/battles/${battleId}/status`);
    if (!res.ok) throw new Error(`Server Error: ${res.status}`);
    
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Unknown Data Error');
    
    updateUI(data);
  } catch (e) { 
    console.error(e);
    // Пишем ошибку на экран, чтобы ты её увидел!
    showError(e.message);
  }
}

function showError(msg) {
    if($('statusBadge')) {
        $('statusBadge').textContent = 'Error: ' + msg;
        $('statusBadge').style.background = '#ef4444'; // Красный
        $('statusBadge').style.color = '#fff';
    }
}

function updateUI(data) {
  // Безопасное получение адреса
  const myAddr = address ? address.toLowerCase() : '';
  
  // Безопасная проверка массивов (чтобы не зависало, если deposits undefined)
  const deposits = data.deposits || [];
  const prompts = data.prompts || [];

  let iDeposited = deposits.includes(myAddr);
  const iPrompted = prompts.includes(myAddr);

  // Обновляем тексты (если элементы есть в HTML)
  if($('themeText')) $('themeText').textContent = data.theme || 'Loading...';
  if($('arenaThemeDisplay')) $('arenaThemeDisplay').textContent = data.theme || 'Loading...';
  if($('statusBadge')) {
      $('statusBadge').textContent = `Status: ${data.genStatus}`;
      $('statusBadge').style.background = '#374151'; // Серый (сброс цвета ошибки)
  }

  const s1 = $('stepDeposit');
  const s2 = $('stepPrompt');
  const s3 = $('stepArena');

  if (!s1 || !s2 || !s3) return; // Если HTML еще не прогрузился

  // === ЛОГИКА ВОССТАНОВЛЕНИЯ ОПЛАТЫ ===
  // Если сервер думает, что мы не платили, а мы точно платили (есть запись в браузере)
  if (!iDeposited && myAddr) {
      const cachedTx = localStorage.getItem(`pb_dep_${battleId}_${myAddr}`);
      if (cachedTx) {
          iDeposited = true; 
          // Фоновая попытка подтвердить
          fetch(`/api/battles/${battleId}/confirm-deposit`, {
              method: 'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ address: myAddr, txHash: cachedTx })
          }).catch(() => {});
      }
  }

  // === ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ ===

  // 1. АРЕНА (Если генерация уже идет или закончилась)
  if (data.genStatus === 'running' || data.genStatus === 'done') {
     showSection(s3);
     updateArena(data);
     return;
  }

  // 2. ДЕПОЗИТ (Если я еще не платил)
  if (!iDeposited) {
     showSection(s1);
     const btn = $('payDepositBtn');
     if(btn) btn.onclick = () => doDeposit(data.stake);
     return;
  }

  // 3. ПРОМПТ (Если я заплатил, но не отправил промпт)
  if (iDeposited && !iPrompted) {
     showSection(s2);
     const btn = $('submitPromptBtn');
     if(btn) btn.onclick = () => submitPrompt();
     return;
  }

  // 4. ОЖИДАНИЕ (Я всё сделал, жду второго)
  showSection(s3);
  if($('statusBadge')) $('statusBadge').textContent = 'Waiting for opponent...';
  if($('timer')) $('timer').style.display = 'none';
}

function showSection(visibleSection) {
    if($('stepDeposit')) $('stepDeposit').style.display = 'none';
    if($('stepPrompt')) $('stepPrompt').style.display = 'none';
    if($('stepArena')) $('stepArena').style.display = 'none';
    if(visibleSection) visibleSection.style.display = 'block';
}

function updateArena(data) {
  const img1 = $('img1');
  const img2 = $('img2');
  
  // Картинки
  if(img1) img1.src = data.p1Image ? data.p1Image : 'https://via.placeholder.com/400x400?text=Generating...';
  if(img2) img2.src = data.p2Image ? data.p2Image : 'https://via.placeholder.com/400x400?text=Generating...';
  
  // Победа
  if (data.status === 'finished' && data.winner) {
    if($('statusBadge')) {
        $('statusBadge').textContent = '🏆 WINNER DECIDED 🏆';
        $('statusBadge').style.background = '#10b981';
    }
    
    const w = data.winner.toLowerCase();
    const p1 = (data.player1 || '').toLowerCase();
    
    // Подсветка карт
    if (w === p1) {
       if($('card1')) $('card1').classList.add('winner');
       if($('card2')) $('card2').classList.add('loser');
    } else {
       if($('card2')) $('card2').classList.add('winner');
       if($('card1')) $('card1').classList.add('loser');
    }

    // Салют (один раз)
    if (!window.animationPlayed && typeof confetti !== 'undefined') {
        window.animationPlayed = true;
        launchConfetti();
    }
  }
}

function launchConfetti() {
    var duration = 3000;
    var end = Date.now() + duration;
    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    }());
}

// === ДЕЙСТВИЯ (Кнопки) ===

async function doDeposit(stakeVal) {
  try {
    const statusEl = $('depositStatus');
    statusEl.textContent = 'Loading config...';
    
    const cRes = await fetch('/api/config');
    const cfg = await cRes.json();

    const usdc = new ethers.Contract(cfg.contracts.usdc, ['function approve(address,uint256)'], signer);
    const escrow = new ethers.Contract(cfg.contracts.escrow, ['function deposit(uint256,uint256)'], signer);
    const amt = ethers.parseUnits(String(stakeVal), 6);

    statusEl.textContent = 'Approving...';
    try {
        const tx1 = await usdc.approve(cfg.contracts.escrow, amt);
        await tx1.wait();
    } catch(e) { console.warn("Approve skipped/failed", e); }

    statusEl.textContent = 'Depositing...';
    let txHash;
    try {
        const tx2 = await escrow.deposit(battleId, amt);
        txHash = tx2.hash;
        localStorage.setItem(`pb_dep_${battleId}_${address.toLowerCase()}`, txHash);
        await tx2.wait();
    } catch (e) {
        if (e.message && (e.message.includes("P1_ALREADY") || e.message.includes("P2_ALREADY"))) {
            txHash = "0x_ALREADY_PAID_RECOVERY"; 
            localStorage.setItem(`pb_dep_${battleId}_${address.toLowerCase()}`, txHash);
        } else { throw e; }
    }

    statusEl.textContent = 'Syncing...';
    await fetch(`/api/battles/${battleId}/confirm-deposit`, {
      method: 'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ address: address, txHash })
    });
    // Экран сам обновится через 2 сек
  } catch(e) {
    alert(e.message);
    if($('depositStatus')) $('depositStatus').textContent = 'Error: ' + e.message;
  }
}

async function submitPrompt() {
  const val = $('promptInput').value;
  if(!val) return alert('Enter prompt');
  
  $('promptStatus').textContent = 'Sending...';
  const r = await fetch(`/api/battles/${battleId}/submit-prompt`, {
      method: 'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ address, prompt: val })
  });
  const j = await r.json();
  if(j.ok) $('promptStatus').textContent = 'Saved! Waiting for opponent...';
  else alert(j.error);
}

window.addEventListener('DOMContentLoaded', init);