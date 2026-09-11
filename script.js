document.addEventListener("DOMContentLoaded", function() {
  // 1. 현재 연도 메인 통합 API
  const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agtolish_FjAGjPeeWn_-dC6DW1zN9C1/exec";

  // 2. 항목별 전체 연도 시계열 API
  const API_URL_GDP = "https://script.google.com/macros/s/AKfycbyzcJtpPMsXf2OZMylf_h_58KR-9wc1FyKO1zq9zADXWgr_dOVLc0KLzjsCF8CDowg/exec";
  const API_URL_DEF = "https://script.google.com/macros/s/AKfycbz8SvI3IPuc28iW3N5FI0rrwpqVHZb0sufjWPeINP8Lm9ZDMin6ynu0We4m95EqahAHRg/exec";
  const API_URL_CAP = "https://script.google.com/macros/s/AKfycbyyq9gnFw4mPr3jY6ReqYMJphX9TzfmecVnz0WFoFru9u9aiTwk3Cr5wzdbBw1aQ9xsyA/exec";

  // 3. 세계 통계 성장률 API
  const API_URL_GROWTH = "https://script.google.com/macros/s/AKfycbz2v5Yoh3CmMcTFkBUoO4EwiKOYe1kZ8Z3nWZ2JJvu6kZUICsaJgm1FatcBn1ixfShzJyA/exec";

  // 4. 회원가입/로그인 전용 Apps Script 웹 앱 URL
  const LOGIN_GAS_URL = "https://script.google.com/macros/s/AKfycbzEdyNoBaRzsz5puqJup02WA6dEmUp-3BLU7ULgxeGZUrvGx_Xcf68imoJU9oFFCFk/exec";

  let currentUser = JSON.parse(localStorage.getItem('nara_user')) || null;

  let mainData = [];
  let globalGdpData = [];
  let globalDefData = [];
  let globalCapData = [];
  let flagMap = new Map();
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
        attempt++;
        await delay(waitTime);
        waitTime = Math.min(waitTime * 1.5, 5000);
      }
    }
  };

  async function loadAllData() {
    try {
      const [mainRes, gdpRes, defRes, capRes, growthRes] = await Promise.all([
        fetchWithSmartRetry(API_URL, "메인 데이터"),
        fetchWithSmartRetry(API_URL_GDP, "GDP 시계열"),
        fetchWithSmartRetry(API_URL_DEF, "국방비 시계열"),
        fetchWithSmartRetry(API_URL_CAP, "1인당 GDP 시계열"),
        fetchWithSmartRetry(API_URL_GROWTH, "성장률 데이터")
      ]);

      mainData = mainRes.data || [];
      globalGdpData = gdpRes.data || [];
      globalDefData = defRes.data || [];
      globalCapData = capRes.data || [];

      if (mainRes.year) currentSheetYear = mainRes.year;

      mainData.forEach(item => {
        if (item.국가명 && item.국기) {
          flagMap.set(String(item.국가명).trim(), item.국기);
        }
      });

      renderMainDashboard(growthRes.data);
      updateUserUI();

      document.getElementById('loading').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';

    } catch (err) {
      document.getElementById('loading').innerText = "데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침 해주세요.";
    }
  }

  function renderMainDashboard(growthData) {
    document.getElementById('data-year').innerText = `${currentSheetYear}년 기준`;

    let topGdp = { name: '-', val: -1 };
    let topDef = { name: '-', val: -1 };
    let topPop = { name: '-', val: -1 };
    let topCap = { name: '-', val: -1 };

    let sumGdp = 0;
    let sumPop = 0;
    let sumDef = 0;

    mainData.forEach(item => {
      const gdp = parseFloat(item['GDP(10억달러)']) || 0;
      const def = parseFloat(item['국방비(10억달러)']) || 0;
      const pop = parseFloat(item['인구(만명)']) || 0;
      const cap = parseFloat(item['1인당GDP']) || 0;

      if (gdp > topGdp.val) topGdp = { name: item.국가명, val: gdp };
      if (def > topDef.val) topDef = { name: item.국가명, val: def };
      if (pop > topPop.val) topPop = { name: item.국가명, val: pop };
      if (cap > topCap.val) topCap = { name: item.국가명, val: cap };

      sumGdp += gdp;
      sumPop += pop;
      sumDef += def;
    });

    worldTotals.gdp = sumGdp;
    worldTotals.pop = sumPop;
    worldTotals.def = sumDef;

    const avgCap = sumPop > 0 ? (sumGdp * 1000000000) / (sumPop * 10000) : 0;
    worldTotals.cap = avgCap;

    document.getElementById('top-gdp-country').innerText = topGdp.name;
    document.getElementById('top-gdp-val').innerText = formatCurrency(topGdp.val);

    document.getElementById('top-def-country').innerText = topDef.name;
    document.getElementById('top-def-val').innerText = formatCurrency(topDef.val);

    document.getElementById('top-pop-country').innerText = topPop.name;
    document.getElementById('top-pop-val').innerText = formatPeople(topPop.val);

    document.getElementById('top-cap-country').innerText = topCap.name;
    document.getElementById('top-cap-val').innerText = formatDirectCap(topCap.val);

    document.getElementById('world-gdp').innerText = formatCurrency(sumGdp);
    document.getElementById('world-pop').innerText = formatPeople(sumPop);
    document.getElementById('world-def').innerText = formatCurrency(sumDef);
    document.getElementById('world-cap').innerText = formatDirectCap(avgCap);

    if (growthData) {
      document.getElementById('world-gdp-growth').innerText = formatPercent(growthData.gdpGrowth);
      document.getElementById('world-pop-growth').innerText = formatPercent(growthData.popGrowth);
      document.getElementById('world-cap-growth').innerText = formatPercent(growthData.capGrowth);
    }
  }

  // Auth / Modal 제어 함수 글로벌 바인딩
  window.switchAuthTab = function(mode) {
    const title = document.getElementById('auth-modal-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const countryGroup = document.getElementById('auth-country-group');
    const switchText = document.getElementById('auth-switch-text');
    const switchLink = document.getElementById('auth-switch-link');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');

    if (mode === 'signup' || mode === 'register') {
      if (tabLogin) tabLogin.classList.remove('active');
      if (tabSignup) tabSignup.classList.add('active');

      if (title) title.innerText = '회원가입';
      if (submitBtn) {
        submitBtn.innerText = '가입하기';
        submitBtn.onclick = handleRegister;
      }
      if (countryGroup) countryGroup.style.display = 'block';

      if (switchText) switchText.innerText = '이미 계정이 있으신가요?';
      if (switchLink) {
        switchLink.innerText = '로그인하기';
        switchLink.setAttribute('onclick', "event.preventDefault(); switchAuthTab('login');");
      }
    } else {
      if (tabSignup) tabSignup.classList.remove('active');
      if (tabLogin) tabLogin.classList.add('active');

      if (title) title.innerText = '로그인';
      if (submitBtn) {
        submitBtn.innerText = '로그인하기';
        submitBtn.onclick = handleLogin;
      }
      if (countryGroup) countryGroup.style.display = 'none';

      if (switchText) switchText.innerText = '계정이 없으신가요?';
      if (switchLink) {
        switchLink.innerText = '회원가입하기';
        switchLink.setAttribute('onclick', "event.preventDefault(); switchAuthTab('signup');");
      }
    }
  };

  window.openAuthModal = function(mode) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    window.switchAuthTab(mode || 'login');
    modal.style.display = 'flex';
  };

  window.closeAuthModal = function() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
  };

  window.toggleAuthMode = function(event) {
    if (event) event.preventDefault();
    const submitBtn = document.getElementById('auth-submit-btn');
    const isLogin = submitBtn && submitBtn.innerText.includes('로그인');
    window.switchAuthTab(isLogin ? 'signup' : 'login');
  };

  async function handleLogin() {
    const id = document.getElementById('auth-id').value.trim();
    const pw = document.getElementById('auth-pw').value.trim();

    if (!id || !pw) {
      alert("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }

    try {
      const res = await fetch(LOGIN_GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ action: 'login', id: id, pw: pw })
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(`${result.countryName} (으)로 로그인되었습니다.`);
        currentUser = {
          id: id,
          countryName: result.countryName,
          flag: flagMap.get(result.countryName) || ''
        };
        localStorage.setItem('nara_user', JSON.stringify(currentUser));
        updateUserUI();
        closeAuthModal();
      } else {
        alert(result.message || "로그인 실패");
      }
    } catch (e) {
      alert("로그인 처리 중 오류가 발생했습니다.");
    }
  }

  async function handleRegister() {
    const id = document.getElementById('auth-id').value.trim();
    const pw = document.getElementById('auth-pw').value.trim();
    const country = document.getElementById('auth-country').value.trim();

    if (!id || !pw || !country) {
      alert("아이디, 비밀번호, 국가명을 모두 입력해주세요.");
      return;
    }

    try {
      const res = await fetch(LOGIN_GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ action: 'register', id: id, pw: pw, country: country })
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert("회원가입이 완료되었습니다. 로그인 해주세요.");
        window.switchAuthTab('login');
      } else {
        alert(result.message || "회원가입 실패");
      }
    } catch (e) {
      alert("회원가입 처리 중 오류가 발생했습니다.");
    }
  }

  window.handleLogout = function() {
    currentUser = null;
    localStorage.removeItem('nara_user');
    updateUserUI();
    showMainView();
  };

  function updateUserUI() {
    const authNavArea = document.getElementById('auth-nav-area');
    const userProfileArea = document.getElementById('user-profile-area');
    const myCountryNav = document.getElementById('nav-my-country-item');

    if (currentUser) {
      if (authNavArea) authNavArea.style.display = 'none';
      if (userProfileArea) {
        userProfileArea.style.display = 'block';
        document.getElementById('user-country-name').innerText = currentUser.countryName;
        const flagImg = document.getElementById('user-flag');
        if (currentUser.flag) {
          flagImg.src = currentUser.flag;
          flagImg.style.display = 'inline-block';
        } else {
          flagImg.style.display = 'none';
        }
      }
      if (myCountryNav) myCountryNav.style.display = 'block';
    } else {
      if (authNavArea) authNavArea.style.display = 'block';
      if (userProfileArea) userProfileArea.style.display = 'none';
      if (myCountryNav) myCountryNav.style.display = 'none';
    }
  }

  window.openMyCountryModal = function() {
    if (!currentUser) return;
    openCountryModal(currentUser.countryName);
  };

  // 포맷팅 헬퍼 함수
  function formatCurrency(val) {
    if (isNaN(val) || val === null) return '-';
    return (val * 1000000000).toLocaleString('ko-KR') + ' 달러';
  }

  function formatPeople(val) {
    if (isNaN(val) || val === null) return '-';
    return (val * 10000).toLocaleString('ko-KR') + ' 명';
  }

  function formatDirectCap(val) {
    if (isNaN(val) || val === null) return '-';
    return Math.round(val).toLocaleString('ko-KR') + ' 달러';
  }

  function formatPercent(val) {
    if (isNaN(val) || val === null) return '-';
    return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
  }

  // 뷰 전환 관련 함수
  window.showMainView = function() {
    document.getElementById('main-view').style.display = 'block';
    document.getElementById('rank-view').style.display = 'none';
  };

  window.switchCategory = function(key, title, unitType, btnId) {
    document.getElementById('main-view').style.display = 'none';
    document.getElementById('rank-view').style.display = 'block';
    document.getElementById('rank-title').innerText = title;

    const rankList = document.getElementById('rank-list');
    rankList.innerHTML = '';

    const sortedData = [...mainData].sort((a, b) => {
      const valA = parseFloat(a[key]) || 0;
      const valB = parseFloat(b[key]) || 0;
      return valB - valA;
    });

    sortedData.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'rank-item';
      li.onclick = () => openCountryModal(item.국가명);

      const val = parseFloat(item[key]) || 0;
      let displayVal = '-';
      if (unitType === '달러') displayVal = formatCurrency(val);
      else if (unitType === '명') displayVal = formatPeople(val);
      else if (unitType === '달러_직접') displayVal = formatDirectCap(val);

      const flagSrc = item.국기 || flagMap.get(item.국가명) || '';

      li.innerHTML = `
        <span class="rank-num">${idx + 1}</span>
        <img src="${flagSrc}" alt="${item.국가명}" class="rank-flag" onerror="this.style.display='none';">
        <span class="rank-country">${item.국가명}</span>
        <span class="rank-val">${displayVal}</span>
      `;
      rankList.appendChild(li);
    });
  };

  window.openCountryModal = function(countryName) {
    const item = mainData.find(d => String(d.국가명).trim() === String(countryName).trim());
    if (!item) return;

    document.getElementById('modal-country-name').innerText = item.국가명 || '-';
    document.getElementById('modal-flag').src = item.국기 || flagMap.get(item.국가명) || '';
    document.getElementById('modal-continent').innerText = item.대륙 || '-';
    document.getElementById('modal-alliance').innerText = item.소속연합 || '-';

    document.getElementById('modal-gdp').innerText = formatCurrency(parseFloat(item['GDP(10억달러)']));
    document.getElementById('modal-gdp-rank').innerText = (item['GDP순위'] || '-') + ' 위';

    document.getElementById('modal-def-ratio').innerText = (item['GDP대비국방비'] || '-') + ' %';
    document.getElementById('modal-def').innerText = formatCurrency(parseFloat(item['국방비(10억달러)']));
    document.getElementById('modal-def-rank').innerText = (item['국방비순위'] || '-') + ' 위';

    document.getElementById('modal-pop').innerText = formatPeople(parseFloat(item['인구(만명)']));
    document.getElementById('modal-pop-rank').innerText = (item['인구순위'] || '-') + ' 위';

    document.getElementById('modal-cap').innerText = formatDirectCap(parseFloat(item['1인당GDP']));
    document.getElementById('modal-cap-rank').innerText = (item['1인당GDP순위'] || '-') + ' 위';

    document.getElementById('modal-tax').innerText = (item.세율 || '-') + ' %';
    document.getElementById('modal-budget').innerText = formatCurrency(parseFloat(item.국가예산));

    document.getElementById('modal-system').innerText = item.경제체제 || '-';
    document.getElementById('modal-industry').innerText = item.주업 || '-';
    document.getElementById('modal-welfare').innerText = item.복지수준 || '-';
    document.getElementById('modal-treasury').innerText = formatCurrency(parseFloat(item.국고));
    document.getElementById('modal-growth').innerText = formatPercent(parseFloat(item.경제성장률));

    document.getElementById('country-modal').style.display = 'flex';
  };

  window.closeCountryModal = function() {
    document.getElementById('country-modal').style.display = 'none';
  };

  loadAllData();
});
