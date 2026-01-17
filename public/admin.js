async function init() {
  const grid = document.getElementById('battlesGrid');
  if(!grid) return;
  
  grid.innerHTML = 'Загрузка списка битв...';

  try {
    // Стучимся на сервер за списком битв
    const res = await fetch('/api/admin/battles');
    const data = await res.json();

    if (!data.ok) {
        grid.innerHTML = `Ошибка: ${data.error}`;
        return;
    }

    if (data.items.length === 0) {
        grid.innerHTML = '<div>Нет активных битв (ожидающих решения).</div>';
        return;
    }

    renderBattles(data.items);
  } catch (e) {
    grid.innerHTML = `<div style="color:red">Ошибка соединения: ${e.message}</div>`;
  }
}

function renderBattles(items) {
  const grid = document.getElementById('battlesGrid');
  grid.innerHTML = '';

  items.forEach(b => {
    const div = document.createElement('div');
    div.className = 'battle-card';
    div.style.background = '#1f2937';
    div.style.padding = '20px';
    div.style.marginBottom = '20px';
    div.style.borderRadius = '12px';
    div.style.border = '1px solid #374151';

    // Картинки или заглушки
    const img1 = b.p1_image_url || 'https://via.placeholder.com/150?text=Wait...';
    const img2 = b.p2_image_url || 'https://via.placeholder.com/150?text=Wait...';

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <h3>Battle #${b.id} <span style="font-size:0.8em; color:#fbbf24;">${b.theme}</span></h3>
        <span style="background:#374151; padding:2px 8px; border-radius:4px;">${b.gen_status}</span>
      </div>
      
      <div style="display:flex; gap:20px; align-items:center;">
        <div style="flex:1; text-align:center;">
            <img src="${img1}" style="width:100%; max-width:200px; border-radius:8px; border: 2px solid #6366f1;">
            <div style="margin-top:5px; font-size:12px;">${b.player1.slice(0,6)}...</div>
            <button onclick="declareWinner(${b.id}, '${b.player1}')" class="btn" style="margin-top:10px; background:#6366f1;">🏆 Победитель P1</button>
        </div>

        <div style="font-weight:bold; font-size:24px;">VS</div>

        <div style="flex:1; text-align:center;">
            <img src="${img2}" style="width:100%; max-width:200px; border-radius:8px; border: 2px solid #ec4899;">
            <div style="margin-top:5px; font-size:12px;">${b.player2.slice(0,6)}...</div>
            <button onclick="declareWinner(${b.id}, '${b.player2}')" class="btn" style="margin-top:10px; background:#ec4899;">🏆 Победитель P2</button>
        </div>
      </div>
      
      <div style="margin-top:10px; font-size:12px; color:#9ca3af;">
        Status: ${b.status} | Created: ${new Date(b.created_at).toLocaleTimeString()}
      </div>
    `;
    grid.appendChild(div);
  });
}

async function declareWinner(id, winner) {
  if(!confirm(`Присудить победу игроку ${winner}?`)) return;
  
  try {
      const res = await fetch(`/api/battles/${id}/close`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ winner })
      });
      const json = await res.json();
      
      if(json.ok) {
          alert('Победитель выбран! Битва ушла в Галерею.');
          init(); // Обновляем список
      } else {
          alert('Ошибка: ' + json.error);
      }
  } catch(e) {
      alert('Ошибка сети');
  }
}

// Запускаем при загрузке
document.addEventListener('DOMContentLoaded', init);