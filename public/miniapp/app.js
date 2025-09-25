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
    stone: 0,
    diamond: 0,
    mineTab: 'mine',
    selectedPickaxe: null,
    currentBlock: null,
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

    // mine
    mineTabBtns: Array.from(document.querySelectorAll('.mine-tab-btn')),
    minePanel: document.getElementById('mine-panel'),
    mineLeaders: document.getElementById('mine-leaders'),
    stoneCount: document.getElementById('stoneCount'),
    diamondCount: document.getElementById('diamondCount'),
    pickCards: Array.from(document.querySelectorAll('.pickaxe-card')),
    btnMine: document.getElementById('btnMine'),
    btnDaily: document.getElementById('btnDaily'),
    btnBuyDiamond: document.getElementById('btnBuyDiamond'),
    blockView: document.getElementById('blockView'),
    blockLabel: document.getElementById('blockLabel'),
    mineResult: document.getElementById('mineResult'),
    mineLeadersList: document.getElementById('mineLeadersList'),
  };

  function setActiveTab(name){
    els.tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    els.tabs.forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
    if (name === 'mine') initMineView();
  }

  function updateBalancesUI(){
    els.rubies.textContent = String(state.rubies);
    els.stars.textContent = String(state.stars);
    els.rubiesTop.textContent = String(state.rubies);
  }

  function showOnboarding(show){ els.onboarding.classList.toggle('active', show); }

  function setSlide(idx){
    state.sliderIndex = Math.max(0, Math.min(2, idx));
    els.slides.forEach((s,i)=> s.classList.toggle('active', i===state.sliderIndex));
    els.dots.forEach((d,i)=> d.classList.toggle('active', i===state.sliderIndex));
    els.prevSlide.disabled = state.sliderIndex === 0;
    els.nextSlide.textContent = state.sliderIndex === 2 ? 'Начать' : 'Дальше';
  }

  async function fetchJSON(url, opts){
    const res = await fetch(url, opts);
    if (!res.ok) throw await res.json().catch(()=>new Error('HTTP '+res.status));
    return res.json();
  }

  function getQuery(params){ return new URLSearchParams(params).toString(); }

  async function loadUser(){
    const u = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
    if (!u) return;
    const query = getQuery({ user_id: u.id, username: u.username||'', first_name: u.first_name||'', last_name: u.last_name||'', photo_url: u.photo_url||'' });
    const user = await fetchJSON(`/api/user?${query}`);
    state.user = user;
    state.rubies = Number(user.rubies || 0);
    state.stars = Number(user.stars || 0);
    state.torchOn = !!user.torch_on;
    state.onboardingSeen = !!user.onboarding_seen;
    const photo = (u && u.photo_url) ? u.photo_url : (user.photo_url || '');
    els.avatar.src = photo || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22%23222%22/></svg>';
    updateBalancesUI();
    showOnboarding(!state.onboardingSeen);
  }

  async function setOnboardingDone(){
    if (!state.user) return;
    try { await fetchJSON('/api/onboarding-seen', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) }); state.onboardingSeen = true; } catch {}
  }

  async function tick(){
    if (!state.user || !state.torchOn) return;
    try {
      const data = await fetchJSON('/api/tick', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) });
      state.rubies = Number(data.rubies || state.rubies + 1);
      state.stars = Number(data.stars || state.stars);
      state.torchOn = !!data.torch_on;
      updateBalancesUI();
    } catch {}
  }

  async function loadLeaders(){
    const rows = await fetchJSON('/api/leaderboard');
    els.leadersList.innerHTML = rows.map((r, i) => {
      const name = r.username ? '@'+r.username : (r.first_name || 'Игрок');
      const photo = r.photo_url || '';
      return `<div class="leader-row"><img class="leader-avatar" src="${photo}" alt="a" /><div class="leader-name">${i+1}. ${name}</div><div class="leader-rubies">💎 ${r.rubies}</div></div>`;
    }).join('');
  }

  // Mine
  function setMineSub(tab){
    state.mineTab = tab;
    els.minePanel.classList.toggle('hidden', tab !== 'mine');
    els.mineLeaders.classList.toggle('hidden', tab !== 'leaders');
    els.mineTabBtns.forEach(b => b.classList.toggle('active', b.dataset.mtab === tab));
    if (tab === 'leaders') loadMineLeaders();
  }

  function setPickaxe(p){
    state.selectedPickaxe = p;
    els.pickCards.forEach(c => c.classList.toggle('active', c.dataset.pickaxe === p));
    let block = null;
    if (p === 'stone') block = Math.random() < 0.5 ? 'wood' : 'stone';
    if (p === 'diamond') block = Math.random() < 0.5 ? 'gold' : 'diamond';
    state.currentBlock = block;
    renderBlock(block);
    els.btnMine.disabled = !p;
  }

  function renderBlock(block){
    els.blockView.className = 'block-view';
    if (!block) { els.blockLabel.textContent = 'Выберите кирку'; return; }
    const map = { wood:['block-wood','Деревянный блок'], stone:['block-stone','Каменный блок'], gold:['block-gold','Золотой блок'], diamond:['block-diamond','Алмазный блок'] };
    const [klass, label] = map[block];
    els.blockView.classList.add(klass);
    els.blockLabel.textContent = label;
  }

  async function initMineView(){
    if (!state.user) return;
    const data = await fetchJSON(`/api/mine/state?user_id=${state.user.tg_id}`);
    state.stone = Number(data.stone_pickaxes||0);
    state.diamond = Number(data.diamond_pickaxes||0);
    state.stars = Number(data.stars||state.stars);
    els.stoneCount.textContent = String(state.stone);
    els.diamondCount.textContent = String(state.diamond);
    updateBalancesUI();
  }

  async function claimDaily(){
    if (!state.user) return;
    const r = await fetchJSON('/api/mine/daily-claim', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) });
    if (r.granted) { state.stone += r.granted; els.stoneCount.textContent = String(state.stone); }
  }

  async function buyDiamond(){
    if (!state.user) return;
    const r = await fetchJSON('/api/mine/purchase-dpick', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) });
    state.diamond = Number(r.diamond_pickaxes||state.diamond);
    state.stars = Number(r.stars||state.stars);
    els.diamondCount.textContent = String(state.diamond);
    updateBalancesUI();
  }

  async function doMine(){
    if (!state.user || !state.selectedPickaxe) return;
    const r = await fetchJSON('/api/mine/mine', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id, pickaxe: state.selectedPickaxe }) });
    state.stone = Number(r.stone_pickaxes||state.stone);
    state.diamond = Number(r.diamond_pickaxes||state.diamond);
    state.stars = Number(r.stars||state.stars);
    els.stoneCount.textContent = String(state.stone);
    els.diamondCount.textContent = String(state.diamond);
    updateBalancesUI();
    state.currentBlock = r.block; renderBlock(r.block);
    const nftImg = nftToImg(r.nft);
    els.mineResult.classList.remove('hidden');
    els.mineResult.innerHTML = `<div><b>Блок:</b> ${labelBlock(r.block)} • <b>Удары:</b> ${r.hits}</div><div><b>Награда:</b> ⭐ ${r.starsEarned}${r.nft?` • NFT: ${r.nft}`:''}</div>${nftImg?`<div><img src="${nftImg}" alt="nft" style="max-width:120px;border-radius:10px;margin-top:8px;"/></div>`:''}`;
  }

  function labelBlock(b){ return {wood:'Деревянный',stone:'Каменный',gold:'Золотой',diamond:'Алмазный'}[b] || ''; }
  function nftToImg(n){ if (!n) return ''; const map={ 'Snoop Dogg':'https://imgur.com/26Al3Dv.png','Swag Bag':'https://imgur.com/UV9BFMQ.png','Easter Egg':'https://imgur.com/Afvazp4.png','Snoop Cigar':'https://imgur.com/VLaneJA.png','Low Rider':'https://imgur.com/TWhlyos.png' }; return map[n] || ''; }

  async function loadMineLeaders(){
    const rows = await fetchJSON('/api/mine/leaderboard');
    els.mineLeadersList.innerHTML = rows.map((r, i) => {
      const name = r.username ? '@'+r.username : (r.first_name || 'Игрок');
      const photo = r.photo_url || '';
      return `<div class="leader-row"><img class="leader-avatar" src="${photo}" alt="a" /><div class="leader-name">${i+1}. ${name}</div><div class="leader-rubies">⭐ ${r.stars_earned_mine}</div></div>`;
    }).join('');
  }

  function bindEvents(){
    els.tabButtons.forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
    els.nextSlide.addEventListener('click', async () => { if (state.sliderIndex < 2) setSlide(state.sliderIndex + 1); else { showOnboarding(false); await setOnboardingDone(); } });
    els.prevSlide.addEventListener('click', () => setSlide(state.sliderIndex - 1));

    els.btnTasks.addEventListener('click', () => setActiveTab('tasks'));
    els.btnLeaders.addEventListener('click', async () => { await loadLeaders(); els.leadersModal.classList.remove('hidden'); });
    els.closeLeaders.addEventListener('click', () => els.leadersModal.classList.add('hidden'));

    els.mineTabBtns.forEach(b => b.addEventListener('click', () => setMineSub(b.dataset.mtab)));
    els.pickCards.forEach(card => card.addEventListener('click', () => setPickaxe(card.dataset.pickaxe)));
    els.btnDaily.addEventListener('click', claimDaily);
    els.btnBuyDiamond.addEventListener('click', buyDiamond);
    els.btnMine.addEventListener('click', doMine);
  }

  function startTick(){ if (state.tickTimer) clearInterval(state.tickTimer); state.tickTimer = setInterval(tick, 1000); }

  // init
  bindEvents();
  setSlide(0);
  loadUser().then(()=>{ startTick(); });
})();
