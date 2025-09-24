const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.enableClosingConfirmation();
}

const state = {
  user: null,
  onboardingSeen: false,
  currentSlide: 0,
  tickTimer: null,
};

const els = {
  onboarding: document.getElementById('onboarding'),
  game: document.getElementById('game'),
  rubies: document.getElementById('rubies'),
  stars: document.getElementById('stars'),
  avatar: document.getElementById('avatar'),
  slides: Array.from(document.querySelectorAll('.slide')),
  prev: document.getElementById('prevSlide'),
  next: document.getElementById('nextSlide'),
  dots: document.getElementById('dots'),
  tabButtons: Array.from(document.querySelectorAll('.tab-button')),
  panels: Array.from(document.querySelectorAll('.tab-panel')),
  homeRubies: document.getElementById('homeRubies'),
  goTasks: document.getElementById('goTasks'),
  openLeaders: document.getElementById('openLeaders'),
  leaderboardModal: document.getElementById('leaderboardModal'),
  closeLeaders: document.getElementById('closeLeaders'),
  leadersList: document.getElementById('leadersList'),
};

function setActiveSlide(i) {
  state.currentSlide = i;
  els.slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
  Array.from(els.dots.children).forEach((d, idx) => d.classList.toggle('active', idx === i));
  els.prev.disabled = i === 0;
  els.next.textContent = i === els.slides.length - 1 ? 'Начать' : 'Далее';
}

function setupDots() {
  els.dots.innerHTML = '';
  els.slides.forEach((_s, i) => {
    const d = document.createElement('div');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => setActiveSlide(i));
    els.dots.appendChild(d);
  });
}

function showOnboarding() {
  document.body.classList.add('showing-onboarding');
  els.onboarding.classList.remove('hidden');
  els.game.classList.add('hidden');
}

function showGame() {
  document.body.classList.remove('showing-onboarding');
  els.onboarding.classList.add('hidden');
  els.game.classList.remove('hidden');
}

async function api(path, body) {
  const initData = tg?.initData || '';
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(body || {}), initData })
  });
  return res.json();
}

async function bootstrap() {
  setupDots();
  setActiveSlide(0);

  const auth = await api('/auth');
  if (!auth.ok) return;
  state.user = auth.user;
  state.onboardingSeen = !!auth.user.onboarding_seen;

  updateBalancesUI();

  if (state.onboardingSeen) {
    showGame();
  } else {
    showOnboarding();
  }
  startTicking();
  setupTasks();
  setupLeaders();
}

els.prev.addEventListener('click', () => {
  if (state.currentSlide > 0) setActiveSlide(state.currentSlide - 1);
});
els.next.addEventListener('click', async () => {
  if (state.currentSlide < els.slides.length - 1) {
    setActiveSlide(state.currentSlide + 1);
  } else {
    const resp = await api('/onboarding/complete');
    if (resp.ok) state.onboardingSeen = true;
    showGame();
  }
});

function updateBalancesUI() {
  els.rubies.textContent = state.user?.rubies ?? 0;
  els.stars.textContent = state.user?.stars ?? 0;
  els.avatar.src = state.user?.photo_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" fill="%23222"/></svg>';
  els.homeRubies.textContent = `${state.user?.rubies ?? 0} 💎`;
}

function startTicking() {
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.tickTimer = setInterval(async () => {
    if (state.user?.torch_lit) {
      state.user.rubies = (state.user.rubies || 0) + 1;
      updateBalancesUI();
    }
  }, 1000);
  setInterval(async () => {
    const resp = await api('/tick');
    if (resp.ok && resp.user) {
      state.user = resp.user;
      updateBalancesUI();
    }
  }, 15000);
}

function setupTasks() {
  els.goTasks.addEventListener('click', () => {
    const btn = document.querySelector('[data-tab="tasks"]');
    btn?.click();
  });
  document.querySelectorAll('.task-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const key = b.getAttribute('data-task');
      if (key === 'share_story') {
        const url = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/' + (tg?.initDataUnsafe?.start_param || ''))}&text=${encodeURIComponent('Играю в MineStars Torch! Заходи 👉 @' + (tg?.initDataUnsafe?.query_id || ''))}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url);
      }
      const resp = await api('/tasks/claim', { taskKey: key });
      if (resp.ok) {
        state.user = resp.user;
        updateBalancesUI();
        b.setAttribute('disabled', '');
      }
    });
  });
}

function setupLeaders() {
  els.openLeaders.addEventListener('click', async () => {
    const resp = await api('/leaderboard');
    if (resp.ok) {
      els.leadersList.innerHTML = '';
      resp.leaders.forEach((u, idx) => {
        const row = document.createElement('div');
        row.className = 'leader-row';
        const name = u.username ? '@' + u.username : (u.first_name || 'Игрок');
        row.innerHTML = `
          <div class="leader-rank">${idx + 1}</div>
          <img class="leader-avatar" src="${u.photo_url || ''}" alt="" />
          <div class="leader-name">${name}</div>
          <div class="leader-rubies">${u.rubies} 💎</div>
        `;
        els.leadersList.appendChild(row);
      });
      els.leaderboardModal.classList.add('active');
    }
  });
  els.closeLeaders.addEventListener('click', () => {
    els.leaderboardModal.classList.remove('active');
  });
}

els.tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.getAttribute('data-tab');
    els.panels.forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`tab-${id}`);
    if (panel) panel.classList.add('active');
  });
});

bootstrap().catch(console.error);
