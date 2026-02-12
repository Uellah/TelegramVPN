(function() {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    document.getElementById('result').textContent = 'Откройте из Telegram';
    document.getElementById('result').className = 'error';
    return;
  }

  tg.ready();
  tg.expand();

  document.getElementById('whoami').onclick = async function() {
    const resultEl = document.getElementById('result');
    resultEl.textContent = 'Загрузка...';

    const initData = tg.initData;
    if (!initData) {
      resultEl.textContent = 'initData недоступен (откройте из Telegram)';
      resultEl.className = 'error';
      return;
    }

    try {
      const res = await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData })
      });
      const data = await res.json();

      if (data.ok) {
        resultEl.textContent = JSON.stringify(data.user, null, 2);
        resultEl.className = '';
      } else {
        resultEl.textContent = data.error || 'Ошибка';
        resultEl.className = 'error';
      }
    } catch (err) {
      resultEl.textContent = 'Ошибка сети: ' + err.message;
      resultEl.className = 'error';
    }
  };
})();
