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
    blocks: { stone: { type: null, left: 0 }, diamond: { type: null, left: 0 } },
    nfts: [],
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

    // header actions
    btnInventory: document.getElementById('btnInventory'),

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

    // inventory modal
    inventoryModal: document.getElementById('inventoryModal'),
    inventoryList: document.getElementById('inventoryList'),
    closeInventory: document.getElementById('closeInventory'),

    // toast
    toast: document.getElementById('toast'),
  };

  // Sounds
  const sfx = {
    purchase: new Audio('./muzik/purchase.mp3'),
    hit: new Audio('./muzik/hit.mp3'),
    reward: new Audio('./muzik/reward.mp3'),
    click: new Audio('./muzik/click.mp3'),
  };
  Object.values(sfx).forEach(a => { a.volume = 0.3; });
  function play(a){ try { a.currentTime = 0; a.play(); } catch {} }

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

  // Inventory
  const nftImgs = { 'Snoop Dogg':'https://i.imgur.com/26Al3Dv.png','Swag Bag':'https://i.imgur.com/UV9BFMQ.png','Easter Egg':'https://i.imgur.com/Afvazp4.png','Snoop Cigar':'https://i.imgur.com/VLaneJA.png','Low Rider':'https://i.imgur.com/TWhlyos.png' };
  async function loadInventory(){
    if (!state.user) return;
    const rows = await fetchJSON(`/api/nfts?user_id=${state.user.tg_id}`);
    state.nfts = rows;
    renderInventory();
  }
  function renderInventory(){
    els.inventoryList.innerHTML = state.nfts.length ? state.nfts.map(n => `
      <div class="inventory-card">
        <img class="inventory-thumb" src="${nftImgs[n.name]||''}" alt="${n.name}" />
        <div class="inventory-name">${n.name}</div>
        <div class="inventory-count">x${n.count}</div>
      </div>
    `).join('') : '<div style="padding:16px;opacity:.8;">Пусто</div>';
  }
  function openInventory(){ els.inventoryModal.classList.remove('hidden'); play(sfx.click); loadInventory(); }
  function closeInventory(){ els.inventoryModal.classList.add('hidden'); play(sfx.click); }

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
    const map = { wood:['block-wood','Деревянный блок'], stone:['block-stone','Каменный блок'], gold:['block-gold','Золотой блок'], diamond:['block-diamond','Алмазный блок'] };
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
    if (!state.user) return; play(sfx.click);
    const r = await fetchJSON('/api/mine/daily-claim', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) });
    if (r.granted) { state.stone += r.granted; els.stoneCount.textContent = String(state.stone); showToast(`+${r.granted} каменных кирок`); }
  }

  async function buyDiamond(){
    if (!state.user) return; play(sfx.click);
    try {
      const r = await fetchJSON('/api/mine/purchase-dpick', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id }) });
      state.diamond = Number(r.diamond_pickaxes||state.diamond);
      state.stars = Number(r.stars||state.stars);
      els.diamondCount.textContent = String(state.diamond);
      updateBalancesUI();
      showToast('Куплено: Алмазная кирка (+1)');
      play(sfx.purchase);
    } catch (e) {
      showToast('Не хватает ⭐', true);
    }
  }

  function spawnReward(reward){
    if (!reward) return;
    const star = document.createElement('div');
    star.className = 'reward reward-star reward-fly';
    star.textContent = `+⭐ ${reward.starsEarned}`;

    els.blockView.appendChild(star);
    setTimeout(()=>{ star.remove(); }, 1700);

    if (reward.nft) {
      const nft = document.createElement('div');
      nft.className = 'reward reward-fly';
      nft.innerHTML = `<img src="${nftImgs[reward.nft]||''}" alt="nft" style="width:92px;height:92px;object-fit:contain;border-radius:12px;"/>`;
      els.blockView.appendChild(nft);
      setTimeout(()=>{ nft.remove(); }, 1700);
      // optimistic update inventory
      const found = state.nfts.find(x => x.name === reward.nft);
      if (found) found.count += 1; else state.nfts.push({ name: reward.nft, count: 1 });
      renderInventory();
      play(sfx.reward);
    }
  }

  async function hitBlock(){
    if (!state.user || !state.selectedPickaxe) return;
    els.blockView.classList.add('block-hit'); setTimeout(()=>els.blockView.classList.remove('block-hit'), 220);
    play(sfx.hit);
    try {
      const r = await fetchJSON('/api/mine/hit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: state.user.tg_id, pickaxe: state.selectedPickaxe }) });
      state.stone = Number(r.stone_pickaxes||state.stone);
      state.diamond = Number(r.diamond_pickaxes||state.diamond);
      state.stars = Number(r.stars||state.stars);
      els.stoneCount.textContent = String(state.stone);
      els.diamondCount.textContent = String(state.diamond);
      updateBalancesUI();

      state.blocks[state.selectedPickaxe] = { type: r.block, left: r.left };
      renderBlock(r.block, r.left);

      if (r.reward && r.reward.completed) { spawnReward(r.reward); }
    } catch {}
  }

  function showToast(text, error){
    els.toast.textContent = text;
    els.toast.classList.toggle('error', !!error);
    els.toast.classList.remove('hidden');
    setTimeout(()=> els.toast.classList.add('hidden'), 1400);
  }

  function nftToImg(n){ if (!n) return ''; return nftImgs[n] || ''; }

  async function loadMineLeaders(){
    const rows = await fetchJSON('/api/mine/leaderboard');
    els.mineLeadersList.innerHTML = rows.map((r, i) => {
      const name = r.username ? '@'+r.username : (r.first_name || 'Игрок');
      const photo = r.photo_url || '';
      return `<div class="leader-row"><img class="leader-avatar" src="${photo}" alt="a" /><div class="leader-name">${i+1}. ${name}</div><div class="leader-rubies">⭐ ${r.stars_earned_mine}</div></div>`;
    }).join('');
  }

  function bindEvents(){
    els.tabButtons.forEach(btn => btn.addEventListener('click', () => { play(sfx.click); setActiveTab(btn.dataset.tab); }));
    els.nextSlide.addEventListener('click', async () => { play(sfx.click); if (state.sliderIndex < 2) setSlide(state.sliderIndex + 1); else { showOnboarding(false); await setOnboardingDone(); } });
    els.prevSlide.addEventListener('click', () => { play(sfx.click); setSlide(state.sliderIndex - 1); });

    els.btnTasks.addEventListener('click', () => { play(sfx.click); setActiveTab('tasks'); });
    els.btnLeaders.addEventListener('click', async () => { play(sfx.click); await loadLeaders(); els.leadersModal.classList.remove('hidden'); });
    els.closeLeaders.addEventListener('click', () => { play(sfx.click); els.leadersModal.classList.add('hidden'); });

    els.btnInventory.addEventListener('click', openInventory);
    els.closeInventory.addEventListener('click', closeInventory);

    els.mineTabBtns.forEach(b => b.addEventListener('click', () => { play(sfx.click); setMineSub(b.dataset.mtab); }));
    els.pickCards.forEach(card => card.addEventListener('click', () => { play(sfx.click); setPickaxe(card.dataset.pickaxe); }));
    els.btnDaily.addEventListener('click', claimDaily);
    els.btnBuyDiamond.addEventListener('click', buyDiamond);
    els.blockView.addEventListener('click', hitBlock);
  }

  function startTick(){ if (state.tickTimer) clearInterval(state.tickTimer); state.tickTimer = setInterval(tick, 1000); }

  // init
  bindEvents();
  setSlide(0);
  loadUser().then(()=>{ startTick(); });
})();
