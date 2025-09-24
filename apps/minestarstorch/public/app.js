const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.enableClosingConfirmation();
}

const state = {
  user: null,
  onboardingSeen: false,
  currentSlide: 0,
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
  els.onboarding.classList.remove('hidden');
  els.game.classList.add('hidden');
}

function showGame() {
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

  els.rubies.textContent = auth.user.rubies;
  els.stars.textContent = auth.user.stars;
  els.avatar.src = auth.user.photo_url || 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><rect width=\"100%\" height=\"100%\" fill=\"%23222\"/></svg>';

  if (state.onboardingSeen) {
    showGame();
  } else {
    showOnboarding();
  }
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
