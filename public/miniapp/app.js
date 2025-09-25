(function(){
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) tg.expand();

  const state = {
    user: null,
    rubies: 0,
    stars: 0,
    torchOn: true,
    torchExpiresAt: null,
    onboardingSeen: false,
    sliderIndex: 0,
    tickTimer: null,
    stone: 0,
    diamond: 0,
    mineTab: 'mine',
    selectedPickaxe: null,
    blocks: { stone: { type: null, left: 0 }, diamond: { type: null, left: 0 } },
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

    // inventory
    btnInventory: document.getElementById('btnInventory'),
    inventoryModal: document.getElementById('inventoryModal'),
    inventoryList: document.getElementById('inventoryList'),
    closeInventory: document.getElementById('closeInventory'),

    // mine
    mineTabBtns: Array.from(document.querySelectorAll('.mine-tab-btn')),
    minePanel: document.getElementById('mine-panel'),
    mineLeaders: document.getElementById('mine-leaders'),
    stoneCount: document.getElementById('stoneCount'),
    diamondCount: document.getElementById('diamondCount'),
    pickCards: Array.from(document.querySelectorAll('.pickaxe-card')),
    btnDaily: document.getElementById('btnDaily'),
    btnBuyDiamond: document.getElementById('btnBuyDiamond'),
    blockView: document.getElementById('blockView'),
    blockLabel: document.getElementById('blockLabel'),
    hitsLabel: document.getElementById('hitsLabel'),
    mineResult: document.getElementById('mineResult'),
    mineLeadersList: document.getElementById('mineLeadersList'),

    // countdown
    torchCountdown: document.getElementById('torchCountdown'),
  };

  // Sounds from /muzik
  const sounds = {
    purchase: new Audio('/muzik/purchase.mp3'),
    hit: new Audio('/muzik/hit.mp3'),
    reward: new Audio('/muzik/reward.mp3'),
    click: new Audio('/muzik/click.mp3'),
  };
  Object.values(sounds).forEach(a => { a.preload = 'auto'; a.volume = 0.6; });
  let audioUnlocked = false;
  function play(name){
    try {
      const a = sounds[name]; if (!a) return;
      const node = a.cloneNode(); node.volume = a.volume; node.play();
    } catch {}
  }
  function unlockAudioOnce(){ if (audioUnlocked) return; audioUnlocked = true; try { Object.values(sounds).forEach(a=>{ a.muted = true; a.play().catch(()=>{}).finally(()=>{ a.pause(); a.currentTime = 0; a.muted = false; }); }); } catch {} }

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

  function updateCountdownUI(){
    if (!els.torchCountdown) return;
    if (!state.torchExpiresAt) { els.torchCountdown.textContent = ''; return; }
    const now = Date.now();
    const diff = Math.max(0, state.torchExpiresAt - now);
    const hh = Math.floor(diff / 3600000);
    const mm = Math.floor((diff % 3600000) / 60000);
    const ss = Math.floor((diff % 60000) / 1000);
    const pad = (n)=> String(n).padStart(2,'0');
    if (diff <= 0) {
      els.torchCountdown.textContent = 'Факел погас';
    } else {
      els.torchCountdown.textContent = `Осталось до угасания: ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
    }
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
    state.torchExpiresAt = user.torch_expires_at ? Date.parse(user.torch_expires_at) : null;
    state.onboardingSeen = !!user.onboarding_seen;
    const photo = (u && u.photo_url) ? u.photo_url : (user.photo_url || '');
    els.avatar.src = photo || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22%23222%22/></svg>';
    updateBalancesUI();
    updateCountdownUI();
    showOnboarding(!state.onboardingSeen);
  }

  async function setOnboardingDone(){
    if (!state.user) return;
    try { await fetchJSON('/api/onboarding-seen', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) }); state.onboardingSeen = true; } catch {}
  }

  async function tick(){
    if (!state.user) return;
    try {
      const data = await fetchJSON('/api/tick', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) });
      if (typeof data.rubies !== 'undefined') state.rubies = Number(data.rubies);
      if (typeof data.stars !== 'undefined') state.stars = Number(data.stars);
      if (typeof data.torch_on !== 'undefined') state.torchOn = !!data.torch_on;
      if (data.torch_expires_at) state.torchExpiresAt = Date.parse(data.torch_expires_at);
      updateBalancesUI();
      updateCountdownUI();
    } catch {}
  }

  async function loadLeaders(){
    const rows = await fetchJSON('/api/leaderboard');
    els.leadersList.innerHTML = rows.map((r, i) => {
      const name = r.username ? '@'+r.username : (r.first_name || 'Игрок');
      const photo = r.photo_url || '';
      return `<div class=\"leader-row\"><img class=\"leader-avatar\" src=\"${photo}\" alt=\"a\" /><div class=\"leader-name\">${i+1}. ${name}</div><div class=\"leader-rubies\">💎 ${r.rubies}</div></div>`;
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
    const blk = state.blocks[p] || { type: null, left: 0 };
    renderBlock(blk.type, blk.left);
  }

  function renderBlock(block, left){
    els.blockView.className = 'block-view';
    if (!block) { els.blockLabel.textContent = 'Выберите кирку'; els.hitsLabel.textContent=''; return; }
    const map = { wood:['block-wood','Деревянный блок'], stone:['block-stone','Каменный блок'], gold:['block-gold','Зо��отой блок'], diamond:['block-diamond','Алмазный блок'] };
    const [klass, label] = map[block];
    els.blockView.classList.add(klass);
    els.blockLabel.textContent = label;
    els.hitsLabel.textContent = `Осталось ударов: ${left}`;
  }

  async function initMineView(){
    if (!state.user) return;
    const data = await fetchJSON(`/api/mine/state?user_id=${state.user.tg_id}`);
    state.stone = Number(data.stone_pickaxes||0);
    state.diamond = Number(data.diamond_pickaxes||0);
    state.stars = Number(data.stars||state.stars);
    state.blocks.stone = { type: data.stone.type, left: data.stone.left };
    state.blocks.diamond = { type: data.diamond.type, left: data.diamond.left };
    els.stoneCount.textContent = String(state.stone);
    els.diamondCount.textContent = String(state.diamond);
    updateBalancesUI();
    if (!state.selectedPickaxe) setPickaxe('stone'); else setPickaxe(state.selectedPickaxe);
  }

  async function claimDaily(){
    if (!state.user) return; play('click');
    const r = await fetchJSON('/api/mine/daily-claim', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) });
    if (r.granted) { state.stone += r.granted; els.stoneCount.textContent = String(state.stone); showToast(`Получено: +${r.granted} ��аменных кирок`); }
  }

  async function buyDiamond(){
    if (!state.user) return; play('click');
    const prev = els.btnBuyDiamond.textContent; els.btnBuyDiamond.disabled = true; els.btnBuyDiamond.textContent = 'Покупка...';
    try {
      const r = await fetchJSON('/api/mine/purchase-dpick', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) });
      state.diamond = Number(r.diamond_pickaxes||state.diamond);
      state.stars = Number(r.stars||state.stars);
      els.diamondCount.textContent = String(state.diamond);
      updateBalancesUI();
      play('purchase');
      showToast('Алмазная кирка куплена! −150⭐');
    } catch (e) {
      const msg = (e && e.error) ? e.error : 'Ошибка покупки';
      if (msg === 'not_enough_stars') showToast('Недостаточно ⭐ для покупки'); else showToast('Не удалось купить кирку');
    } finally {
      els.btnBuyDiamond.disabled = false; els.btnBuyDiamond.textContent = prev;
    }
  }

  function spawnReward(reward){
    const el = document.createElement('div');
    el.className = 'reward reward-fly';
    const nftImg = nftToImg(reward && reward.nft);
    if (nftImg) {
      el.innerHTML = `<img class=\"reward-nft-image\" src=\"${nftImg}\" alt=\"nft\"/>`;
    } else {
      el.innerHTML = `<div class=\"reward-badge\">+⭐ ${reward ? reward.starsEarned : ''}</div>`;
    }
    els.blockView.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 1600);
  }

  async function hitBlock(){
    if (!state.user || !state.selectedPickaxe) return;
    unlockAudioOnce();
    els.blockView.classList.add('block-hit'); setTimeout(()=>els.blockView.classList.remove('block-hit'), 220);
    play('hit');
    const r = await fetchJSON('/api/mine/hit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id, pickaxe: state.selectedPickaxe }) });
    state.stone = Number(r.stone_pickaxes||state.stone);
    state.diamond = Number(r.diamond_pickaxes||state.diamond);
    state.stars = Number(r.stars||state.stars);
    els.stoneCount.textContent = String(state.stone);
    els.diamondCount.textContent = String(state.diamond);
    updateBalancesUI();

    // update block state for current pickaxe
    state.blocks[state.selectedPickaxe] = { type: r.block, left: r.left };
    renderBlock(r.block, r.left);

    if (r.reward && r.reward.completed) {
      play('reward');
      els.blockView.classList.add('block-reward-glow'); setTimeout(()=>els.blockView.classList.remove('block-reward-glow'), 900);
      spawnReward(r.reward);
      const msg = r.reward.nft ? `Выпал NFT: ${r.reward.nft} +⭐ ${r.reward.starsEarned}` : `+⭐ ${r.reward.starsEarned}`;
      showToast(msg);
    }
  }

  function labelBlock(b){ return {wood:'Деревянный',stone:'Каменный',gold:'Золотой',diamond:'Алмазный'}[b] || ''; }
  function nftToImg(n){ if (!n) return ''; const map={ 'Snoop Dogg':'https://i.imgur.com/26Al3Dv.png','Swag Bag':'https://i.imgur.com/UV9BFMQ.png','Easter Egg':'https://i.imgur.com/Afvazp4.png','Snoop Cigar':'https://i.imgur.com/VLaneJA.png','Low Rider':'https://i.imgur.com/TWhlyos.png' }; return map[n] || ''; }

  async function loadMineLeaders(){
    const rows = await fetchJSON('/api/mine/leaderboard');
    els.mineLeadersList.innerHTML = rows.map((r, i) => {
      const name = r.username ? '@'+r.username : (r.first_name || 'Игрок');
      const photo = r.photo_url || '';
      return `<div class=\"leader-row\"><img class=\"leader-avatar\" src=\"${photo}\" alt=\"a\" /><div class=\"leader-name\">${i+1}. ${name}</div><div class=\"leader-rubies\">⭐ ${r.stars_earned_mine}</div></div>`;
    }).join('');
  }

  async function loadInventory(){
    if (!state.user) return;
    const rows = await fetchJSON(`/api/inventory?user_id=${state.user.tg_id}`);
    if (!rows.length) { els.inventoryList.innerHTML = `<div style=\"padding:16px;\">Пока пусто</div>`; return; }
    els.inventoryList.innerHTML = rows.map(r => {
      const img = nftToImg(r.name);
      return `<div class=\"inventory-card\">${img ? `<img src=\"${img}\" alt=\"${r.name}\" class=\"reward-nft-image\"/>` : ''}<div class=\"inventory-name\">${r.name}</div><div class=\"inventory-count\">× ${r.count}</div></div>`;
    }).join('');
  }

  function showToast(text){
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; document.body.appendChild(el); setTimeout(()=>{ el.remove(); }, 2600);
  }

  function bindEvents(){
    els.tabButtons.forEach(btn => btn.addEventListener('click', () => { play('click'); setActiveTab(btn.dataset.tab); }));
    els.nextSlide.addEventListener('click', async () => { play('click'); if (state.sliderIndex < 2) setSlide(state.sliderIndex + 1); else { showOnboarding(false); await setOnboardingDone(); } });
    els.prevSlide.addEventListener('click', () => { play('click'); setSlide(state.sliderIndex - 1); });

    els.btnTasks.addEventListener('click', () => { play('click'); setActiveTab('tasks'); });
    els.btnLeaders.addEventListener('click', async () => { play('click'); await loadLeaders(); els.leadersModal.classList.remove('hidden'); });
    els.closeLeaders.addEventListener('click', () => { play('click'); els.leadersModal.classList.add('hidden'); });

    els.btnInventory.addEventListener('click', async () => { play('click'); await loadInventory(); els.inventoryModal.classList.remove('hidden'); });
    els.closeInventory.addEventListener('click', () => { play('click'); els.inventoryModal.classList.add('hidden'); });

    els.mineTabBtns.forEach(b => b.addEventListener('click', () => { play('click'); setMineSub(b.dataset.mtab); }));
    els.pickCards.forEach(card => card.addEventListener('click', () => { play('click'); setPickaxe(card.dataset.pickaxe); }));
    els.btnDaily.addEventListener('click', claimDaily);
    els.btnBuyDiamond.addEventListener('click', buyDiamond);
    els.blockView.addEventListener('click', hitBlock);

    document.body.addEventListener('click', unlockAudioOnce, { once: true });
  }

  function startTick(){ if (state.tickTimer) clearInterval(state.tickTimer); state.tickTimer = setInterval(tick, 1000); }

  // init
  bindEvents();
  setSlide(0);
  loadUser().then(()=>{ startTick(); });
})();
