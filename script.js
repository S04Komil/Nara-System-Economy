// 1. 현재 연도 메인 통합 API
const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec";

// 2. 항목별 전체 연도 시계열 API
const API_URL_GDP = "https://script.google.com/macros/s/AKfycbzyzCjtpkPMsXf20Z9mylf_h_58KR-9wclFykOlzq9zADXWgr_dOVLc0KLzjsCF8CDowg/exec";
const API_URL_DEF = "https://script.google.com/macros/s/AKfycbz8SvI3IPuc28iW3N5FI0rrwpqVHZb0suFjWPeINP8Lm9ZDMin6ynu0We4m95EqahAHRg/exec";
const API_URL_CAP = "https://script.google.com/macros/s/AKfycbyyq9gnFw4mPr3jY6ReqYMJphX9TzfmecVnz0WfoFru9u9aiTwk3Cr5wzdbBw1aQ9xsyA/exec";

// 3. 세계 통계 성장률 API
const API_URL_GROWTH = "https://script.google.com/macros/s/AKfycbz2v5Yoh3CmMcTfKBUoO4EWiKOYe1kZ8Z3nWZ2Jvu6kzUICsaJgmlFatcBn1ixfShzJyA/exec";

// 4. 회원가입/로그인 전용 Apps Script 웹 앱 URL
const LOGIN_GAS_URL = "https://script.google.com/macros/s/AKfycbzEdyNoBaRzsz5puqJup02WA6dEmUp-3BLU7ULgqxeGZUrvGx_Xcf68imojU9oFFCFk/exec";

let currentUser = JSON.parse(localStorage.getItem('nara_user')) || null;

let mainData = [];
let globalGdpData = [];
let globalDefData = [];
let globalCapData = [];
let flagMap = new Map(); // 국방비 시계열 국기링크 URL 저장용
let worldTotals = { gdp: 0, pop: 0, def: 0, cap: 0 };
let currentSheetYear = 1970;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithSmartRetry = async (url, name) => {
  let attempt = 1;
  let waitTime = 1000;
  while (true) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP 에러 상태: ${res.status}`);
      const data = await res.json();
      if (!data) throw new Error("수신된 데이터가 비어 있습니다.");
      return data;
    } catch (err) {
      console.warn(`[${name}] 불러오기 실패 (시도 ${attempt}): ${err.message}`);
      await delay(waitTime);
      waitTime = Math.min(waitTime * 2, 8000);
      attempt++;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  updateAuthUI();

  Promise.all([
    fetchWithSmartRetry(API_URL, "메인 API"),
    fetchWithSmartRetry(API_URL_GDP, "GDP 시계열"),
    fetchWithSmartRetry(API_URL_DEF, "국방비 시계열"),
    fetchWithSmartRetry(API_URL_CAP, "자본 시계열"),
    fetchWithSmartRetry(API_URL_GROWTH, "성장률 API")
  ]).then(([mainRes, gdpData, defData, capData, growthData]) => {
    
    // 메인 API 데이터 추출
    if (Array.isArray(mainRes)) {
      mainData = mainRes;
    } else if (mainRes && Array.isArray(mainRes.data)) {
      mainData = mainRes.data;
    } else {
      mainData = [];
    }

    // 시계열 데이터 가공
    globalGdpData = Array.isArray(gdpData) ? gdpData : (gdpData.data || []);
    globalDefData = Array.isArray(defData) ? defData : (defData.data || []);
    globalCapData = Array.isArray(capData) ? capData : (capData.data || []);

    // 시계열 국기 저장 (국방비 시계열 기준)
    globalDefData.forEach(row => {
      const cName = cleanName(row['국가명'] || row['국가']);
      const fUrl = row['국기'] || row['국기링크'];
      if (cName && fUrl) flagMap.set(cName, fUrl);
    });

    // 성장률 데이터 추출 및 연도 설정
    let gList = Array.isArray(growthData) ? growthData : (growthData.data || []);
    if (gList.length > 0) {
      const gObj = gList[0];
      if (gObj['연도']) currentSheetYear = parseInt(gObj['연도']);
      renderWorldGrowth(gObj);
    }

    calculateWorldTotals(mainData);
    renderMainCards(mainData);
    renderWorldStats();
    
    // 해외 경제 투자 목록 렌더링 호출
    renderMyInvestments(mainRes);

    if (overlay) overlay.style.display = 'none';
  }).catch(err => {
    console.error("초기 데이터 로딩 중 치명적 오류:", err);
    alert("데이터를 로드하는 데 실패했습니다.");
    if (overlay) overlay.style.display = 'none';
  });

  setupEventListeners();
});

function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterAndRenderCards(e.target.value);
    });
  }

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const keyword = searchInput ? searchInput.value : '';
      filterAndRenderCards(keyword);
    });
  }

  // 모달 닫기 이벤트들
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeAllModals();
    }
  });

  // 폼 제출 이벤트
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', handleSignupSubmit);
  }

  const myForm = document.getElementById('my-economy-form');
  if (myForm) {
    myForm.addEventListener('submit', handleMyEconomySubmit);
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function cleanName(name) {
  if (!name) return '';
  return String(name).replace(/\s+/g, '').toLowerCase();
}

function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function formatMoney(num) {
  return Math.round(num).toLocaleString('ko-KR');
}

// ---------------- 메인 카드리스트 & 통계 ----------------

function calculateWorldTotals(data) {
  worldTotals = { gdp: 0, pop: 0, def: 0, cap: 0 };
  data.forEach(item => {
    worldTotals.gdp += parseNumber(item['GDP'] || item['gdp']);
    worldTotals.pop += parseNumber(item['인구'] || item['pop']);
    worldTotals.def += parseNumber(item['국방비'] || item['def']);
    worldTotals.cap += parseNumber(item['자본'] || item['cap']);
  });
}

function renderWorldGrowth(gObj) {
  const elYear = document.getElementById('growth-year');
  const elRate = document.getElementById('growth-rate');
  if (elYear && gObj['연도']) elYear.innerText = gObj['연도'] + '년';
  if (elRate && gObj['성장률'] !== undefined) {
    const val = parseFloat(gObj['성장률']);
    elRate.innerText = (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
  }
}

function renderWorldStats() {
  const elGdp = document.getElementById('total-world-gdp');
  const elPop = document.getElementById('total-world-pop');
  const elDef = document.getElementById('total-world-def');
  const elCap = document.getElementById('total-world-cap');

  if (elGdp) elGdp.innerText = formatMoney(worldTotals.gdp);
  if (elPop) elPop.innerText = formatMoney(worldTotals.pop);
  if (elDef) elDef.innerText = formatMoney(worldTotals.def);
  if (elCap) elCap.innerText = formatMoney(worldTotals.cap);
}

function renderMainCards(data) {
  const container = document.getElementById('cards-container');
  if (!container) return;
  container.innerHTML = '';

  data.forEach((item, index) => {
    const countryName = item['국가명'] || item['국가'] || '알 수 없음';
    const flagUrl = item['국기'] || item['국기링크'] || '';
    const gdp = parseNumber(item['GDP'] || item['gdp']);
    const pop = parseNumber(item['인구'] || item['pop']);
    const def = parseNumber(item['국방비'] || item['def']);
    const cap = parseNumber(item['자본'] || item['cap']);

    const gdpShare = worldTotals.gdp > 0 ? ((gdp / worldTotals.gdp) * 100).toFixed(2) : '0.00';
    const popShare = worldTotals.pop > 0 ? ((pop / worldTotals.pop) * 100).toFixed(2) : '0.00';

    const card = document.createElement('div');
    card.className = 'country-card';
    card.style.animationDelay = `${(index % 12) * 0.05}s`;
    
    card.innerHTML = `
      <div class="card-header">
        <div class="country-info">
          ${flagUrl ? `<img src="${flagUrl}" class="card-flag" alt="${countryName} 국기" loading="lazy">` : `<div class="card-flag-placeholder"></div>`}
          <h3 class="country-title">${countryName}</h3>
        </div>
      </div>
      <div class="card-body">
        <div class="stat-row">
          <span class="stat-label">GDP</span>
          <span class="stat-value">${formatMoney(gdp)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">인구</span>
          <span class="stat-value">${formatMoney(pop)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">국방비</span>
          <span class="stat-value">${formatMoney(def)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">자본</span>
          <span class="stat-value">${formatMoney(cap)}</span>
        </div>
        <div class="share-badge-container">
          <span class="share-badge">GDP 점유율: ${gdpShare}%</span>
          <span class="share-badge alt">인구 점유율: ${popShare}%</span>
        </div>
      </div>
      <div class="card-footer">
        <button class="detail-btn" onclick="openCountryDetail('${countryName}')">상세 보기</button>
      </div>
    `;

    container.appendChild(card);
  });
}

function filterAndRenderCards(keyword = '') {
  const cleanKeyword = cleanName(keyword);
  const sortSelect = document.getElementById('sort-select');
  const sortType = sortSelect ? sortSelect.value : 'gdp-desc';

  let filtered = mainData.filter(item => {
    const name = cleanName(item['국가명'] || item['국가']);
    return name.includes(cleanKeyword);
  });

  filtered.sort((a, b) => {
    const getVal = (item, key) => parseNumber(item[key] || item[key.toLowerCase()]);
    switch (sortType) {
      case 'gdp-desc': return getVal(b, 'GDP') - getVal(a, 'GDP');
      case 'gdp-asc': return getVal(a, 'GDP') - getVal(b, 'GDP');
      case 'pop-desc': return getVal(b, '인구') - getVal(a, '인구');
      case 'pop-asc': return getVal(a, '인구') - getVal(b, '인구');
      case 'def-desc': return getVal(b, '국방비') - getVal(a, '국방비');
      case 'def-asc': return getVal(a, '국방비') - getVal(b, '국방비');
      case 'cap-desc': return getVal(b, '자본') - getVal(a, '자본');
      case 'cap-asc': return getVal(a, '자본') - getVal(b, '자본');
      case 'name-asc': 
        return (a['국가명'] || a['국가'] || '').localeCompare(b['국가명'] || b['국가'] || '', 'ko-KR');
      default: return 0;
    }
  });

  renderMainCards(filtered);
}

// ---------------- 국가 상세 모달 및 차트 ----------------

let detailChart = null;

function openCountryDetail(countryName) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return;

  const targetClean = cleanName(countryName);
  
  // 국기 및 기본 정보 설정
  const flagUrl = flagMap.get(targetClean) || '';
  const flagImg = document.getElementById('modal-flag');
  const titleEl = document.getElementById('modal-country-name');
  
  if (flagImg) {
    if (flagUrl) {
      flagImg.src = flagUrl;
      flagImg.style.display = 'block';
    } else {
      flagImg.style.display = 'none';
    }
  }
  if (titleEl) titleEl.innerText = countryName;

  // 메인 데이터에서 해당 국가 정보 추출
  const mainObj = mainData.find(d => cleanName(d['국가명'] || d['국가']) === targetClean) || {};
  
  const gdp = parseNumber(mainObj['GDP'] || mainObj['gdp']);
  const pop = parseNumber(mainObj['인구'] || mainObj['pop']);
  const def = parseNumber(mainObj['국방비'] || mainObj['def']);
  const cap = parseNumber(mainObj['자본'] || mainObj['cap']);

  document.getElementById('modal-gdp').innerText = formatMoney(gdp);
  document.getElementById('modal-pop').innerText = formatMoney(pop);
  document.getElementById('modal-def').innerText = formatMoney(def);
  document.getElementById('modal-cap').innerText = formatMoney(cap);

  document.getElementById('modal-gdp-share').innerText = worldTotals.gdp > 0 ? ((gdp / worldTotals.gdp) * 100).toFixed(2) + '%' : '0.00%';
  document.getElementById('modal-pop-share').innerText = worldTotals.pop > 0 ? ((pop / worldTotals.pop) * 100).toFixed(2) + '%' : '0.00%';

  // 시계열 차트 생성
  renderCountryChart(targetClean);

  modal.style.display = 'flex';
}

function renderCountryChart(targetClean) {
  const ctx = document.getElementById('detail-chart');
  if (!ctx) return;

  const gdpRow = globalGdpData.find(r => cleanName(r['국가명'] || r['국가']) === targetClean) || {};
  const defRow = globalDefData.find(r => cleanName(r['국가명'] || r['국가']) === targetClean) || {};
  const capRow = globalCapData.find(r => cleanName(r['국가명'] || r['국가']) === targetClean) || {};

  // 연도 라벨 및 데이터 파싱
  const years = [];
  const gdpSeries = [];
  const defSeries = [];
  const capSeries = [];

  for (let y = 1970; y <= currentSheetYear; y++) {
    const yearKey = y + '년';
    years.push(yearKey);
    gdpSeries.push(parseNumber(gdpRow[yearKey] || gdpRow[y]));
    defSeries.push(parseNumber(defRow[yearKey] || defRow[y]));
    capSeries.push(parseNumber(capRow[yearKey] || capRow[y]));
  }

  if (detailChart) detailChart.destroy();

  detailChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        {
          label: 'GDP',
          data: gdpSeries,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: '국방비',
          data: defSeries,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: '자본',
          data: capSeries,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${formatMoney(context.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: function(value) {
              return formatMoney(value);
            }
          }
        }
      }
    }
  });
}

// ---------------- 로그인 / 회원가입 / 인증 ----------------

function updateAuthUI() {
  const authNav = document.getElementById('auth-nav-items');
  const userNav = document.getElementById('user-nav-items');
  const myEcoBtn = document.getElementById('my-economy-btn');

  if (currentUser) {
    if (authNav) authNav.style.display = 'none';
    if (userNav) userNav.style.display = 'flex';
    if (myEcoBtn) myEcoBtn.style.display = 'inline-block';
    
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.innerText = `${currentUser.country} (${currentUser.username})`;
  } else {
    if (authNav) authNav.style.display = 'flex';
    if (userNav) userNav.style.display = 'none';
    if (myEcoBtn) myEcoBtn.style.display = 'none';
  }
}

function windowShowLoginModal() {
  closeAllModals();
  const modal = document.getElementById('login-modal');
  if (modal) modal.style.display = 'flex';
}

function windowShowSignupModal() {
  closeAllModals();
  const modal = document.getElementById('signup-modal');
  if (modal) modal.style.display = 'flex';
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('nara_user');
  updateAuthUI();
  alert('로그아웃 되었습니다.');
  window.location.reload();
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const idVal = document.getElementById('login-id').value.trim();
  const pwVal = document.getElementById('login-pw').value.trim();

  if (!idVal || !pwVal) {
    alert('아이디와 비밀번호를 입력해주세요.');
    return;
  }

  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  try {
    const res = await fetch(`${LOGIN_GAS_URL}?action=login&id=${encodeURIComponent(idVal)}&pw=${encodeURIComponent(pwVal)}`);
    const data = await res.json();

    if (data.result === 'success') {
      currentUser = {
        username: data.username || idVal,
        country: data.country
      };
      localStorage.setItem('nara_user', JSON.stringify(currentUser));
      updateAuthUI();
      closeAllModals();
      alert(`${currentUser.country} 계정으로 로그인되었습니다.`);
    } else {
      alert(data.message || '로그인에 실패했습니다.');
    }
  } catch (err) {
    console.error(err);
    alert('로그인 요청 중 오류가 발생했습니다.');
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  const idVal = document.getElementById('signup-id').value.trim();
  const pwVal = document.getElementById('signup-pw').value.trim();
  const countryVal = document.getElementById('signup-country').value.trim();

  if (!idVal || !pwVal || !countryVal) {
    alert('모든 필드를 입력해주세요.');
    return;
  }

  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  try {
    const res = await fetch(`${LOGIN_GAS_URL}?action=signup&id=${encodeURIComponent(idVal)}&pw=${encodeURIComponent(pwVal)}&country=${encodeURIComponent(countryVal)}`);
    const data = await res.json();

    if (data.result === 'success') {
      alert('회원가입이 완료되었습니다. 로그인해주세요.');
      closeAllModals();
      windowShowLoginModal();
    } else {
      alert(data.message || '회원가입에 실패했습니다.');
    }
  } catch (err) {
    console.error(err);
    alert('회원가입 요청 중 오류가 발생했습니다.');
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
}

// ---------------- 자국 경제 수정 뷰 ----------------

window.showMyEconomyView = function() {
  if (!currentUser) {
    alert('로그인이 필요한 기능입니다.');
    windowShowLoginModal();
    return;
  }

  const mainView = document.getElementById('main-dashboard-view');
  const myView = document.getElementById('my-economy-view');

  if (mainView) mainView.style.display = 'none';
  if (myView) myView.style.display = 'block';

  const titleEl = document.getElementById('my-country-title');
  if (titleEl) titleEl.innerText = `${currentUser.country} 경제 정보 수정`;

  const myObj = mainData.find(d => cleanName(d['국가명'] || d['국가']) === cleanName(currentUser.country)) || {};

  document.getElementById('edit-gdp').value = myObj['GDP'] || myObj['gdp'] || 0;
  document.getElementById('edit-pop').value = myObj['인구'] || myObj['pop'] || 0;
  document.getElementById('edit-def').value = myObj['국방비'] || myObj['def'] || 0;
  document.getElementById('edit-cap').value = myObj['자본'] || myObj['cap'] || 0;

  // 해외 경제 투자 목록 추가 렌더링
  renderMyInvestments(mainData);
};

window.hideMyEconomyView = function() {
  const mainView = document.getElementById('main-dashboard-view');
  const myView = document.getElementById('my-economy-view');

  if (mainView) mainView.style.display = 'block';
  if (myView) myView.style.display = 'none';
};

async function handleMyEconomySubmit(e) {
  e.preventDefault();
  if (!currentUser) return;

  const gdp = document.getElementById('edit-gdp').value;
  const pop = document.getElementById('edit-pop').value;
  const def = document.getElementById('edit-def').value;
  const cap = document.getElementById('edit-cap').value;

  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  try {
    const params = new URLSearchParams({
      action: 'updateEconomy',
      country: currentUser.country,
      gdp: gdp,
      pop: pop,
      def: def,
      cap: cap
    });

    const res = await fetch(`${LOGIN_GAS_URL}?${params.toString()}`);
    const data = await res.json();

    if (data.result === 'success') {
      alert('경제 정보가 성공적으로 수정되었습니다.');
      window.location.reload();
    } else {
      alert(data.message || '정보 수정에 실패했습니다.');
    }
  } catch (err) {
    console.error(err);
    alert('수정 요청 중 오류가 발생했습니다.');
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
}

// ---------------- 해외 경제 투자 목록 렌더링 함수 ----------------

function renderMyInvestments(mainRes) {
  const tbody = document.getElementById('my-investment-list');
  if (!tbody) return;
  tbody.innerHTML = '';

  const investments = mainRes.investments || mainRes.foreignInvestments || [];
  
  if (!currentUser || !currentUser.country || investments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #777; padding: 20px;">투자 내역이 없습니다.</td></tr>`;
    return;
  }

  // 로그인한 국가가 '투자국'인 항목만 필터링
  const myInvestments = investments.filter(inv => {
    const investor = inv['투자국'] || inv['investor'] || '';
    return cleanName(investor) === cleanName(currentUser.country);
  });

  if (myInvestments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #777; padding: 20px;">등록된 해외 경제 투자 내역이 없습니다.</td></tr>`;
    return;
  }

  myInvestments.forEach(inv => {
    const targetCountry = inv['피투자국'] || inv['targetCountry'] || '-';
    const targetGrade = inv['피투자국등급'] || inv['targetGrade'] || '-';
    const investAmount = parseFloat(inv['투자금'] || inv['amount'] || 0);
    const isProfitable = inv['수익여부'] || inv['isProfitable'] || '-';
    const redemptionRate = parseFloat(inv['환수율'] || inv['redemptionRate'] || 0);
    const growthInc = parseFloat(inv['성장률증가'] || inv['growthIncrease'] || 0);
    const netProfit = parseFloat(inv['차익금'] || inv['netProfit'] || 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${targetCountry}</td>
      <td>${targetGrade}</td>
      <td>${formatMoney(investAmount)}</td>
      <td>${isProfitable}</td>
      <td>${redemptionRate.toFixed(2)}%</td>
      <td>${growthInc > 0 ? `+${growthInc.toFixed(2)}%p` : `${growthInc.toFixed(2)}%p`}</td>
      <td>${formatMoney(netProfit)}</td>
    `;
    tbody.appendChild(tr);
  });
}
