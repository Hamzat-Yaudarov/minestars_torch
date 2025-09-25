(function(){
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) tg.expand();

  const state = {
    user: null,
    rubies: 0,
    stars: 0,
    torchOn: true,
    onboardingSeen: false,
    sliderIndex: 0,
    tickTimer: null,
  };

  const els = {
    avatar: document.getElementById('avatar'),
    rubies: document.getElementById('rubies'),
    stars: document.getElementById('stars'),
    rubiesTop: document.getElementById('rubiesTop'),
    onboarding: document.getElementById('onboarding'),
    dots: Array.from(document.querySelectorAll('.dot')),
    slides: Array.from(document.querySelectorAll('.slide')),
    nextSlide: document.getElementById('nextSlide'),
    prevSlide: document.getElementById('prevSlide'),
    tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
    tabs: Array.from(document.querySelectorAll('.tab-screen')),
    btnTasks: document.getElementById('btnTasks'),
    btnLeaders: document.getElementById('btnLeaders'),
    leadersModal: document.getElementById('leadersModal'),
    leadersList: document.getElementById('leadersList'),
    closeLeaders: document.getElementById('closeLeaders'),
  };

  function qs(sel){ return document.querySelector(sel); }

  function setActiveTab(name){
    els.tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    els.tabs.forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
  }

  function updateBalancesUI(){
    els.rubies.textContent = String(state.rubies);
    els.stars.textContent = String(state.stars);
    els.rubiesTop.textContent = String(state.rubies);
  }

  function showOnboarding(show){
    els.onboarding.classList.toggle('active', show);
  }

  function setSlide(idx){
    state.sliderIndex = Math.max(0, Math.min(2, idx));
    els.slides.forEach((s,i)=> s.classList.toggle('active', i===state.sliderIndex));
    els.dots.forEach((d,i)=> d.classList.toggle('active', i===state.sliderIndex));
    els.prevSlide.disabled = state.sliderIndex === 0;
    els.nextSlide.textContent = state.sliderIndex === 2 ? 'Начать' : 'Дальше';
  }

  async function fetchJSON(url, opts){
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  }

  function getQuery(params){
    const usp = new URLSearchParams(params);
    return usp.toString();
  }

  async function loadUser(){
    const u = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
    if (!u) return;

    const query = getQuery({
      user_id: u.id,
      username: u.username || '',
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      photo_url: u.photo_url || '',
    });
    const user = await fetchJSON(`/api/user?${query}`);
    state.user = user;
    state.rubies = Number(user.rubies || 0);
    state.stars = Number(user.stars || 0);
    state.torchOn = !!user.torch_on;
    state.onboardingSeen = !!user.onboarding_seen;

    if (u.photo_url) {
      els.avatar.src = u.photo_url;
    } else if (user.photo_url) {
      els.avatar.src = user.photo_url;
    } else {
      els.avatar.src = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%22440%22 fill=%22%23222%22/></svg>';
    }

    updateBalancesUI();
    showOnboarding(!state.onboardingSeen);
  }

  async function setOnboardingDone(){
    if (!state.user) return;
    try {
      await fetchJSON('/api/onboarding-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: state.user.tg_id })
      });
      state.onboardingSeen = true;
    } catch (e) {
      console.warn('onboarding flag error', e);
    }
  }

  async function tick(){
    if (!state.user || !state.torchOn) return;
    try {
      const data = await fetchJSON('/api/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: state.user.tg_id })
      });
      state.rubies = Number(data.rubies || state.rubies + 1);
      state.stars = Number(data.stars || state.stars);
      state.torchOn = !!data.torch_on;
      updateBalancesUI();
    } catch (e) {
      // Network errors ignored for UI smoothness
    }
  }

  async function loadLeaders(){
    const rows = await fetchJSON('/api/leaderboard');
    els.leadersList.innerHTML = rows.map((r, i) => {
      const name = r.username ? '@'+r.username : (r.first_name || 'Игрок');
      const photo = r.photo_url || '';
      return `
        <div class="leader-row">
          <img class="leader-avatar" src="${photo}" alt="a" />
          <div class="leader-name">${i+1}. ${name}</div>
          <div class="leader-rubies">💎 ${r.rubies}</div>
        </div>
      `;
    }).join('');
  }

  function bindEvents(){
    els.tabButtons.forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
    els.nextSlide.addEventListener('click', async () => {
      if (state.sliderIndex < 2) setSlide(state.sliderIndex + 1); else { showOnboarding(false); await setOnboardingDone(); }
    });
    els.prevSlide.addEventListener('click', () => setSlide(state.sliderIndex - 1));

    els.btnTasks.addEventListener('click', () => setActiveTab('tasks'));
    els.btnLeaders.addEventListener('click', async () => { await loadLeaders(); els.leadersModal.classList.remove('hidden'); });
    els.closeLeaders.addEventListener('click', () => els.leadersModal.classList.add('hidden'));
  }

  function startTick(){
    if (state.tickTimer) clearInterval(state.tickTimer);
    state.tickTimer = setInterval(tick, 1000);
  }

  // init
  bindEvents();
  setSlide(0);
  loadUser().then(startTick);
})();
