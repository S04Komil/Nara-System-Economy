document.addEventListener("DOMContentLoaded", function() {
  // 1. 현재 연도 메인 통합 API
  const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec"; 

  // 2. 항목별 전체 연도 시계열 API
  const API_URL_GDP = "https://script.google.com/macros/s/AKfycbzyzCjtpkPMsXf20Z9mylf_h_58KR-9wclFykOlzq9zADXWgr_dOVLc0KLzjsCF8CDowg/exec";
  const API_URL_DEF = "https://script.google.com/macros/s/AKfycbz8SvI3IPuc28iW3N5FI0rrwpqVHZb0suFjWPeINP8Lm9ZDMin6ynu0We4m95EqahAHRg/exec";
  const API_URL_CAP = "https://script.google.com/macros/s/AKfycbyyq9gnFw4mPr3jY6ReqYMJphX9TzfmecVnz0WfoFru9u9aiTwk3Cr5wzdbBw1aQ9xsyA/exec";

  // 3. 세계 통계 성장률 API
  const API_URL_GROWTH = "https://script.google.com/macros/s/AKfycbz2v5Yoh3CmMcTfKBUoO4EWiKOYe1kZ8Z3nWZ2Jvu6kzUICsaJgmlFatcBn1ixfShzJyA/exec"; 

  // 4. 회원가입/로그인 및 데이터 업데이트 전용 Apps Script 웹 앱 URL
  const LOGIN_GAS_URL = "https://script.google.com/macros/s/AKfycbzEdyNoBaRzsz5puqJup02WA6dEmUp-3BLU7ULgqxeGZUrvGx_Xcf68imojU9oFFCFk/exec"; 
  const GAS_WEB_APP_URL = LOGIN_GAS_URL; // 백엔드 처리 URL 통합

  let currentUser = JSON.parse(localStorage.getItem('nara_user') || 'null');

  let mainData = [];
  let globalGdpData = [];
  let globalDefData = [];
  let globalCapData = [];
  let flagMap = new Map(); // 국방비 시계열 국기링크 URL 저장용
  let worldTotals = { gdp: 0, pop: 0, def: 0, cap: 0 };
  let currentSheetYear = 1970;

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // 유효한 숫자 데이터 파싱 함수
  const parseNumber = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

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
        console.warn(`⚠️ [${name}] 수신 실패(${attempt}회) - ${waitTime/1000}초 후 재시도...`);
        await delay(waitTime);
        attempt++;
        waitTime = Math.min(waitTime + 500, 3000); 
      }
    }
  };

  const apiRequests = [
    { url: API_URL, name: "메인 API" },
    { url: API_URL_GDP, name: "GDP 시계열 API" },
    { url: API_URL_DEF, name: "국방비 시계열 API" },
    { url: API_URL_CAP, name: "1인당 GDP 시계열 API" }
  ];

  async function loadMainData() {
    try {
      const [mainRes, gdpRes, defRes, capRes] = await Promise.all(apiRequests.map(req => fetchWithSmartRetry(req.url, req.name)));
      
      mainData = mainRes ? (mainRes.data || mainRes) : [];
      globalGdpData = gdpRes ? (gdpRes.data || gdpRes) : [];
      globalDefData = defRes ? (defRes.data || defRes) : [];
      globalCapData = capRes ? (capRes.data || capRes) : [];

      extractFlags(globalDefData, defRes);

      const loadingEl = document.getElementById('loading');
      if (loadingEl) loadingEl.style.display = 'none';

      if (!mainData || mainData.length === 0) {
        if (loadingEl) {
          loadingEl.innerText = '불러올 데이터가 없습니다.';
          loadingEl.style.display = 'block';
        }
        return;
      }

      const dashboardEl = document.getElementById('dashboard');
      if (dashboardEl) dashboardEl.style.display = 'block';

      let sheetName = mainRes ? mainRes.sheetName : null;
      if (sheetName) {
        const dataYearEl = document.getElementById('data-year');
        if (dataYearEl) dataYearEl.innerText = `${sheetName} 기준`;
        currentSheetYear = parseInt(sheetName, 10) || 1970;
      } else {
        const dataYearEl = document.getElementById('data-year');
        if (dataYearEl) dataYearEl.innerText = `최신 데이터 기준`;
        currentSheetYear = 1970;
      }

      calculateWorldTotals(mainData);
      renderMainCards(mainData);
      renderWorldStats();
      
      updateAuthUI();
      fetchWorldGrowthData();
    } catch (error) {
      console.error('Data Fetch Error:', error);
      const loadingEl = document.getElementById('loading');
      if (loadingEl) loadingEl.innerText = '데이터를 불러오는 데 실패했습니다.';
    }
  }

  // 데이터 로드 실행
  loadMainData();

  function extractFlags(defData, rawRes) {
    let list = [];
    if (Array.isArray(defData) && defData.length > 0) {
      list = defData;
    } else if (defData && Array.isArray(defData.data)) {
      list = defData.data;
    } else if (rawRes && Array.isArray(rawRes.data)) {
      list = rawRes.data;
    } else if (Array.isArray(rawRes)) {
      list = rawRes;
    }

    if (!list || list.length === 0) return;

    list.forEach(row => {
      if (!row || typeof row !== 'object') return;

      let country = extractCountryFromRow(row);
      let keyName = cleanName(country);

      if (!keyName) return;

      let flagUrl = "";
      if (row['국기링크']) flagUrl = String(row['국기링크']).trim();
      else if (row['국기']) flagUrl = String(row['국기']).trim();
      else if (row['flag']) flagUrl = String(row['flag']).trim();
      else if (row['Flag']) flagUrl = String(row['Flag']).trim();

      if (!flagUrl) {
        for (let k of Object.keys(row)) {
          let cleanKey = k.replace(/[\s_]/g, '').toLowerCase();
          if (cleanKey === '국기링크' || cleanKey === '국기' || cleanKey === '국기url' || cleanKey === 'flag' || cleanKey === 'flagurl') {
            flagUrl = String(row[k]).trim();
            break;
          }
        }
      }

      if (!flagUrl) {
        for (let k of Object.keys(row)) {
          let val = String(row[k]).trim();
          if (val.startsWith('http://') || val.startsWith('https://')) {
            flagUrl = val;
            break;
          }
        }
      }

      if (flagUrl && flagUrl !== 'N/A' && flagUrl !== '-') {
        flagMap.set(keyName, flagUrl);
      }
    });
  }

  function fetchWorldGrowthData() {
    if (!API_URL_GROWTH) return;

    fetch(API_URL_GROWTH)
      .then(res => res.json())
      .then(data => {
        if (!data) return;
        
        const formatGrowth = (val) => {
          if (val === null || val === undefined || isNaN(val)) return "-";
          const num = parseFloat(val);
          const prefix = num > 0 ? "▲ " : num < 0 ? "▼ " : "";
          return `${prefix}${Math.abs(num).toFixed(2)}%`;
        };

        const gdpEl = document.getElementById('world-gdp-growth');
        const popEl = document.getElementById('world-pop-growth');
        const capEl = document.getElementById('world-cap-growth');

        if (gdpEl) gdpEl.innerText = formatGrowth(data.gdpGrowthRate);
        if (popEl) popEl.innerText = formatGrowth(data.popGrowthRate);
        if (capEl) capEl.innerText = formatGrowth(data.capGrowthRate);
      })
      .catch(err => console.error("성장률 데이터 로드 실패:", err));
  }

  function calculateWorldTotals(data) {
    let gdp = 0, pop = 0, def = 0;
    data.forEach(item => {
      let cName = extractCountryFromRow(item);
      if (cleanName(cName) === '전세계') return;

      gdp += ((parseFloat(item['GDP(10억달러)'] || item['GDP']) || 0) * 10);
      pop += (parseFloat(item['인구(만명)'] || item['인구']) || 0);
      def += ((parseFloat(item['국방비(10억달러)'] || item['국방비']) || 0) * 10);
    });

    let cap = pop > 0 ? (gdp / pop) * 10000 : 0;
    worldTotals = { gdp, pop, def, cap };
  }

  function formatMoney(billionVal) {
    let rawNum = parseFloat(billionVal) || 0;
    if (rawNum === 0) return "0달러";

    const isNegative = rawNum < 0;
    let val = Math.round(Math.abs(rawNum) * 100000000);

    let result = "";
    const jo = Math.floor(val / 1000000000000);
    val %= 1000000000000;
    const eok = Math.floor(val / 100000000);
    val %= 100000000;
    const man = Math.floor(val / 10000);

    if (jo > 0) result += `${jo}조 `;
    if (eok > 0) result += `${eok.toLocaleString()}억 `;
    if (man > 0) result += `${man.toLocaleString()}만`;

    const formattedText = result.trim() ? `${result.trim()}달러` : "0달러";
    return isNegative ? `-${formattedText}` : formattedText;
  }

  function formatPopulation(tenThousandVal) {
    let val = Math.round((parseFloat(tenThousandVal) || 0) * 10000);
    if (val >= 100000000) {
      const eok = (val / 100000000).toFixed(2);
      return `${eok}억 명`;
    } else {
      return `${(val / 10000).toLocaleString()}만 명`;
    }
  }

  function renderMainCards(data) {
    const validCountries = data.filter(item => cleanName(extractCountryFromRow(item)) !== '전세계');

    const getTop = (key, altKey) => validCountries.reduce((max, item) => (parseFloat(item[key] || item[altKey]) || 0) > (parseFloat(max[key] || max[altKey]) || 0) ? item : max, validCountries[0]);

    const topGdp = getTop('GDP(10억달러)', 'GDP');
    const topDef = getTop('국방비(10억달러)', '국방비');
    const topPop = getTop('인구(만명)', '인구');
    const topCap = getTop('1인당GDP', '1인당GDP');

    if (topGdp) {
      document.getElementById('top-gdp-country').innerText = topGdp['국가'] || topGdp['국가명'] || topGdp['카테고리'] || '-';
      document.getElementById('top-gdp-val').innerText = formatMoney((parseFloat(topGdp['GDP(10억달러)'] || topGdp['GDP']) || 0) * 10);
    }

    if (topDef) {
      document.getElementById('top-def-country').innerText = topDef['국가'] || topDef['국가명'] || topDef['카테고리'] || '-';
      document.getElementById('top-def-val').innerText = formatMoney((parseFloat(topDef['국방비(10억달러)'] || topDef['국방비']) || 0) * 10);
    }

    if (topPop) {
      document.getElementById('top-pop-country').innerText = topPop['top-pop-country'] || topPop['국가'] || topPop['국가명'] || topPop['카테고리'] || '-';
      document.getElementById('top-pop-val').innerText = formatPopulation(topPop['인구(만명)'] || topPop['인구']);
    }

    if (topCap) {
      document.getElementById('top-cap-country').innerText = topCap['국가'] || topCap['국가명'] || topCap['카테고리'] || '-';
      document.getElementById('top-cap-val').innerText = `${Math.round(parseFloat(topCap['1인당GDP']) || 0).toLocaleString()} 달러`;
    }
  }

  function renderWorldStats() {
    const gdpEl = document.getElementById('world-gdp');
    const popEl = document.getElementById('world-pop');
    const defEl = document.getElementById('world-def');
    const capEl = document.getElementById('world-cap');

    if (gdpEl) gdpEl.innerText = formatMoney(worldTotals.gdp);
    if (popEl) popEl.innerText = formatPopulation(worldTotals.pop);
    if (defEl) defEl.innerText = formatMoney(worldTotals.def);
    if (capEl) capEl.innerText = `${Math.round(worldTotals.cap).toLocaleString()} 달러`;
  }

  window.showMainView = function() {
    const mainView = document.getElementById('main-view') || document.getElementById('main-dashboard-view');
    if (mainView) mainView.style.display = 'block';

    const rankView = document.getElementById('rank-view');
    if (rankView) rankView.style.display = 'none';

    const myEconomyView = document.getElementById('my-economy-view');
    if (myEconomyView) myEconomyView.style.display = 'none';

    document.querySelectorAll('.nav-item button').forEach(btn => btn.classList.remove('active'));
  };

  function cleanName(str) {
    if (!str) return '';
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/[\s\u200B-\u200D\uFEFF_\-\(\)]/g, '');
  }

  function extractCountryFromRow(row) {
    if (!row || typeof row !== 'object') return '';
    if (row['국가']) return row['국가'];
    if (row['국가명']) return row['국가명'];
    if (row['카테고리']) return row['카테고리'];
    if (row['country']) return row['country'];
    if (row['Category']) return row['Category'];

    for (let k of Object.keys(row)) {
      let val = String(row[k]).trim();
      if (isNaN(Number(val)) && val.length > 0 && !k.includes('Year') && !k.includes('연도')) {
        return val;
      }
    }
    return '';
  }

  function getPropByCleanKey(row, targetKeyName) {
    if (!row || typeof row !== 'object') return undefined;
    
    if (row[targetKeyName] !== undefined) return row[targetKeyName];

    const targetClean = cleanName(targetKeyName);
    for (let k of Object.keys(row)) {
      if (cleanName(k) === targetClean) {
        return row[k];
      }
    }
    return undefined;
  }

  function getSortedYearKeys(seriesData) {
    if (!seriesData || seriesData.length === 0) return [];
    
    const sample = seriesData.find(item => item && typeof item === 'object') || {};
    const keys = Object.keys(sample);

    const yearKeys = keys.filter(k => {
      const cleanedKey = k.replace(/[^\d]/g, '');
      return cleanedKey.length >= 2 && cleanedKey.length <= 4;
    });

    return yearKeys.sort((a, b) => {
      const yearA = parseInt(a.replace(/[^\d]/g, ''), 10);
      const yearB = parseInt(b.replace(/[^\d]/g, ''), 10);
      return yearA - yearB;
    });
  }

  window.switchCategory = function(key, title, unitType, navBtnId) {
    const mainView = document.getElementById('main-view') || document.getElementById('main-dashboard-view');
    if (mainView) mainView.style.display = 'none';

    const rankView = document.getElementById('rank-view');
    if (rankView) rankView.style.display = 'block';

    const myEconomyView = document.getElementById('my-economy-view');
    if (myEconomyView) myEconomyView.style.display = 'none';

    document.getElementById('rank-title').innerText = title;

    document.querySelectorAll('.nav-item button').forEach(btn => btn.classList.remove('active'));
    if (navBtnId) {
      const btn = document.getElementById(navBtnId);
      if (btn) btn.classList.add('active');
    }

    const listEl = document.getElementById('rank-list');
    listEl.innerHTML = '';

    let totalBaseVal = 0;
    if (key === 'GDP(10억달러)' || key === 'GDP') totalBaseVal = worldTotals.gdp;
    else if (key === '인구(만명)' || key === '인구') totalBaseVal = worldTotals.pop;
    else if (key === '국방비(10억달러)' || key === '국방비') totalBaseVal = worldTotals.def;

    let currentList = mainData.map(item => {
      let rawCountry = extractCountryFromRow(item);
      let cleanedName = cleanName(rawCountry);

      if (cleanedName === '전세계') return null;

      let rawVal = item[key];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '' || String(rawVal).trim() === 'N/A') {
        return null;
      }

      let numVal = parseFloat(rawVal);
      if (isNaN(numVal) || numVal <= 0) return null;

      if (key === 'GDP(10억달러)' || key === '국방비(10억달러)') {
        numVal *= 10;
      }

      return { country: rawCountry, cleanKey: cleanedName, val: numVal };
    })
    .filter(item => item !== null && item.country !== '')
    .sort((a, b) => b.val - a.val || a.cleanKey.localeCompare(b.cleanKey));

    let targetSeriesData = [];
    if (key === 'GDP(10억달러)' || key === 'GDP') targetSeriesData = globalGdpData;
    else if (key === '국방비(10억달러)' || key === '국방비') targetSeriesData = globalDefData;
    else if (key === '1인당GDP') targetSeriesData = globalCapData;

    const prevRankMap = new Map();

    if (key !== '인구(만명)' && key !== '인구' && targetSeriesData && targetSeriesData.length > 0) {
      const yearKeys = getSortedYearKeys(targetSeriesData);

      const validYearKeys = yearKeys.filter(k => {
        const y = parseInt(k.replace(/[^\d]/g, ''), 10);
        return y <= currentSheetYear;
      });

      if (validYearKeys.length > 0) {
        let targetIndex = validYearKeys.length >= 2 ? validYearKeys.length - 2 : validYearKeys.length - 1;
        let prevYearKey = validYearKeys[targetIndex];

        let prevList = targetSeriesData
          .map(item => {
            let rawCountry = extractCountryFromRow(item);
            let cleanedName = cleanName(rawCountry);

            if (cleanedName === '전세계') return null;

            let rawVal = item[prevYearKey];
            if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '' || String(rawVal).trim() === 'N/A') {
              return null;
            }

            let numVal = parseFloat(rawVal);
            if (isNaN(numVal) || numVal <= 0) return null;

            if (key === 'GDP(10억달러)' || key === '국방비(10억달러)' || key === 'GDP' || key === '국방비') {
              numVal *= 10;
            }

            return { rawCountry: String(rawCountry).trim(), cleanKey: cleanedName, val: numVal };
          })
          .filter(item => item !== null && item.cleanKey !== '')
          .sort((a, b) => b.val - a.val || a.cleanKey.localeCompare(b.cleanKey));

        prevList.forEach((item, idx) => {
          prevRankMap.set(item.cleanKey, idx + 1);
        });
      }
    }

    let listData = currentList.map((item, idx) => {
      const currentRank = idx + 1;
      const prevRank = prevRankMap.get(item.cleanKey);

      return {
        country: item.country,
        cleanKey: item.cleanKey,
        val: item.val,
        currentRank: currentRank,
        prevRank: prevRank || null,
        isWorld: false
      };
    });

    if (key === '1인당GDP') {
      listData.push({
        country: '전세계',
        cleanKey: '전세계',
        val: worldTotals.cap,
        currentRank: null,
        prevRank: null,
        isWorld: true
      });
      listData.sort((a, b) => b.val - a.val);
    }

    const maxValInList = listData.length > 0 ? listData[0].val : 1;
    let rankCounter = 1;

    listData.forEach((item) => {
      let formattedVal = "";
      if (unitType === '달러') {
        formattedVal = formatMoney(item.val);
      } else if (unitType === '명') {
        formattedVal = formatPopulation(item.val);
      } else if (unitType === '달러_직접') {
        formattedVal = `${Math.round(item.val).toLocaleString()} 달러`;
      }

      let rankDiffHtml = "";
      let rankDisplay = "";

      if (item.isWorld) {
        rankDisplay = "-";
      } else {
        rankDisplay = `${rankCounter}.`;
        rankCounter++;

        if (key === '인구(만명)' || key === '인구') {
          rankDiffHtml = "";
        } else if (!item.prevRank) {
          rankDiffHtml = `<span class="rank-diff new">NEW</span>`;
        } else {
          const diff = item.prevRank - item.currentRank;
          if (diff > 0) rankDiffHtml = `<span class="rank-diff up">▲${diff}</span>`;
          else if (diff < 0) rankDiffHtml = `<span class="rank-diff down">▼${Math.abs(diff)}</span>`;
          else rankDiffHtml = `<span class="rank-diff same">-</span>`;
        }
      }

      let flagHtml = "";
      const flagUrl = flagMap.get(item.cleanKey);
      if (flagUrl && !item.isWorld) {
        flagHtml = `<img src="${flagUrl}" class="rank-flag" alt="${item.country} 국기" style="width: 22px; height: 15px; object-fit: cover; border-radius: 2px; margin-right: 2px; vertical-align: middle;">`;
      }

      let percent = 0;
      if (key === '1인당GDP') {
        percent = (item.val / maxValInList) * 100;
      } else {
        percent = totalBaseVal > 0 ? (item.val / totalBaseVal) * 100 : 0;
      }
      percent = Math.min(Math.max(percent, 0), 100).toFixed(1);

      const li = document.createElement('li');
      li.className = `rank-item ${item.isWorld ? 'world-item' : ''}`;
      
      const countryClickableAttr = item.isWorld ? '' : `onclick="openCountryModal('${item.cleanKey}')" style="cursor: pointer;"`;

      li.innerHTML = `
        <div class="rank-bar" style="width: ${percent}%;"></div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="rank-num">${rankDisplay}</span>
          ${rankDiffHtml}
          <span class="clickable-country" ${countryClickableAttr} style="display: flex; align-items: center; gap: 6px;">
            ${flagHtml}
            <span class="rank-country">${item.country}</span>
          </span>
        </div>
        <span class="rank-val">${formattedVal}</span>
      `;
      listEl.appendChild(li);
    });
  };

  // 모달 함수
  window.openCountryModal = function(cleanKey) {
    if (cleanKey === '전세계') return;

    const item = mainData.find(d => cleanName(extractCountryFromRow(d)) === cleanKey);
    if (!item) {
      alert("국가 상세 정보를 찾을 수 없습니다.");
      return;
    }

    const countryName = extractCountryFromRow(item);
    const flagUrl = flagMap.get(cleanKey) || "";

    const flagImg = document.getElementById('modal-flag');
    if (flagImg) {
      if (flagUrl) {
        flagImg.src = flagUrl;
        flagImg.style.display = 'block';
      } else {
        flagImg.style.display = 'none';
      }
    }
    const nameEl = document.getElementById('modal-country-name');
    if (nameEl) nameEl.innerText = countryName;

    const continentEl = document.getElementById('modal-continent');
    if (continentEl) continentEl.innerText = getPropByCleanKey(item, '대륙') || getPropByCleanKey(item, '소속대륙') || '-';
    const allianceEl = document.getElementById('modal-alliance');
    if (allianceEl) allianceEl.innerText = getPropByCleanKey(item, '소속연합') || getPropByCleanKey(item, '연합') || '-';

    const rawGdp = (parseFloat(getPropByCleanKey(item, 'GDP(10억달러)') || getPropByCleanKey(item, 'GDP')) || 0) * 10;
    const gdpEl = document.getElementById('modal-gdp');
    if (gdpEl) gdpEl.innerText = formatMoney(rawGdp);
    const gdpRankEl = document.getElementById('modal-gdp-rank');
    if (gdpRankEl) gdpRankEl.innerText = getCountryRank('GDP(10억달러)', cleanKey);

    const rawDef = (parseFloat(getPropByCleanKey(item, '국방비(10억달러)') || getPropByCleanKey(item, '국방비')) || 0) * 10;
    const rawDefRatio = getPropByCleanKey(item, 'GDP대비국방비');
    
    let defRatioDisplay = "-";
    if (rawDefRatio !== undefined && rawDefRatio !== '' && !isNaN(parseFloat(rawDefRatio))) {
      let numRatio = parseFloat(rawDefRatio);
      if (numRatio > 0 && numRatio < 1 && String(rawDefRatio).includes(".")) {
        numRatio = numRatio * 100;
      }
      defRatioDisplay = `${numRatio.toFixed(2)}%`;
    } else if (rawGdp > 0) {
      defRatioDisplay = `${((rawDef / rawGdp) * 100).toFixed(2)}%`;
    }

    const defRatioEl = document.getElementById('modal-def-ratio');
    if (defRatioEl) defRatioEl.innerText = defRatioDisplay;

    const defEl = document.getElementById('modal-def');
    if (defEl) defEl.innerText = formatMoney(rawDef);
    const defRankEl = document.getElementById('modal-def-rank');
    if (defRankEl) defRankEl.innerText = getCountryRank('국방비(10억달러)', cleanKey);

    const popEl = document.getElementById('modal-pop');
    if (popEl) popEl.innerText = formatPopulation(getPropByCleanKey(item, '인구(만명)') || getPropByCleanKey(item, '인구'));
    const popRankEl = document.getElementById('modal-pop-rank');
    if (popRankEl) popRankEl.innerText = getCountryRank('인구(만명)', cleanKey);

    const capVal = parseFloat(getPropByCleanKey(item, '1인당GDP')) || 0;
    const capEl = document.getElementById('modal-cap');
    if (capEl) capEl.innerText = `${Math.round(capVal).toLocaleString()} 달러`;
    const capRankEl = document.getElementById('modal-cap-rank');
    if (capRankEl) capRankEl.innerText = getCountryRank('1인당GDP', cleanKey);

    const taxVal = getPropByCleanKey(item, '세율');
    const taxEl = document.getElementById('modal-tax');
    if (taxEl) taxEl.innerText = taxVal !== undefined && taxVal !== '' ? `${taxVal}%` : '-';
    
    const rawBudgetVal = getPropByCleanKey(item, '국가예산');
    const rawBudget = (parseFloat(rawBudgetVal) || 0) * 10;
    const budgetEl = document.getElementById('modal-budget');
    if (budgetEl) budgetEl.innerText = rawBudget !== 0 ? formatMoney(rawBudget) : '-';

    const systemEl = document.getElementById('modal-system');
    if (systemEl) systemEl.innerText = getPropByCleanKey(item, '경제체제') || '-';
    
    const mainIndustry = getPropByCleanKey(item, '주업') || '-';
    const industryEl = document.getElementById('modal-industry');
    if (industryEl) industryEl.innerText = mainIndustry;

    const welfareEl = document.getElementById('modal-welfare');
    if (welfareEl) welfareEl.innerText = getPropByCleanKey(item, '복지수준') || '-';

    const rawTreasuryVal = getPropByCleanKey(item, '국고');
    const treasuryEl = document.getElementById('modal-treasury');
    if (treasuryEl) {
      if (rawTreasuryVal !== undefined && rawTreasuryVal !== '' && !isNaN(parseFloat(rawTreasuryVal))) {
        treasuryEl.innerText = formatMoney(rawTreasuryVal);
      } else {
        treasuryEl.innerText = '-';
      }
    }

    const rawGrowth = getPropByCleanKey(item, '최종경제성장률') !== undefined && getPropByCleanKey(item, '최종경제성장률') !== '' 
      ? getPropByCleanKey(item, '최종경제성장률') 
      : getPropByCleanKey(item, '경제성장률');
      
    const growthEl = document.getElementById('modal-growth');
    if (growthEl) {
      if (rawGrowth !== undefined && rawGrowth !== '' && !isNaN(parseFloat(rawGrowth))) {
        growthEl.innerText = `${parseFloat(rawGrowth).toFixed(2)}%`;
      } else {
        growthEl.innerText = '-';
      }
    }

    const modal = document.getElementById('country-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeCountryModal = function() {
    const modal = document.getElementById('country-modal');
    if (modal) modal.style.display = 'none';
  };

  window.addEventListener('click', function(e) {
    const modal = document.getElementById('country-modal');
    if (modal && e.target === modal) {
      modal.style.display = 'none';
    }
  });

  function getCountryRank(key, cleanKey) {
    const sorted = mainData
      .map(item => ({
        keyName: cleanName(extractCountryFromRow(item)),
        val: parseFloat(getPropByCleanKey(item, key)) || 0
      }))
      .filter(item => item.keyName !== '전세계' && item.val > 0)
      .sort((a, b) => b.val - a.val);

    const index = sorted.findIndex(item => item.keyName === cleanKey);
    return index !== -1 ? `${index + 1}위` : '-';
  }

  // 회원가입 / 로그인 모드 전환 함수
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

  window.windowShowLoginModal = function() {
    window.openAuthModal('login');
  };

  window.toggleAuthMode = function(event) {
    if (event) event.preventDefault();
    const submitBtn = document.getElementById('auth-submit-btn');
    const isLoginMode = submitBtn && submitBtn.innerText.includes('로그인');
    window.switchAuthTab(isLoginMode ? 'signup' : 'login');
  };

  function updateAuthUI() {
    const navMyCountry = document.getElementById('nav-my-country-item');
    const authNavArea = document.getElementById('auth-nav-area');
    const userProfileArea = document.getElementById('user-profile-area');
    const userCountryName = document.getElementById('user-country-name');
    const userFlag = document.getElementById('user-flag');

    if (currentUser && currentUser.country) {
      if (navMyCountry) navMyCountry.style.display = 'block';
      if (authNavArea) authNavArea.style.display = 'none';
      if (userProfileArea) userProfileArea.style.display = 'block';

      if (userCountryName) userCountryName.innerText = `${currentUser.country} (${currentUser.username || currentUser.email || ''})`;
      
      const cleanUserCountry = cleanName(currentUser.country);
      const flagUrl = flagMap.get(cleanUserCountry);
      if (userFlag) {
        if (flagUrl) {
          userFlag.src = flagUrl;
          userFlag.style.display = 'inline-block';
        } else {
          userFlag.style.display = 'none';
        }
      }
    } else {
      if (navMyCountry) navMyCountry.style.display = 'none';
      if (authNavArea) authNavArea.style.display = 'block';
      if (userProfileArea) userProfileArea.style.display = 'none';
    }
  }

  window.openMyCountryModal = function() {
    window.showMyEconomyView();
  };

  window.closeAuthModal = function() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = "none";
  };

  async function handleRegister() {
    const id = document.getElementById('auth-id').value.trim();
    const pw = document.getElementById('auth-pw').value.trim();
    const country = document.getElementById('auth-country').value.trim();

    if (!id || !pw || !country) {
      alert("모든 항목을 입력해 주세요.");
      return;
    }

    try {
      const res = await fetch(LOGIN_GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'register', id, pw, country })
      });
      const result = await res.json();

      if (result.success) {
        alert("회원가입이 완료되었습니다. 로그인해 주세요.");
        closeAuthModal();
      } else {
        alert(result.message || "회원가입 실패");
      }
    } catch (err) {
      console.error(err);
      alert("회원가입 중 오류가 발생했습니다.");
    }
  }

  async function handleLogin() {
    const id = document.getElementById('auth-id').value.trim();
    const pw = document.getElementById('auth-pw').value.trim();

    if (!id || !pw) {
      alert("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }

    try {
      const res = await fetch(LOGIN_GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'login', id, pw })
      });
      const result = await res.json();

      if (result.success) {
        currentUser = { username: result.username || id, email: id, country: result.country };
        localStorage.setItem('nara_user', JSON.stringify(currentUser));
        alert(`${result.country} 계정으로 로그인되었습니다.`);
        closeAuthModal();
        updateAuthUI();
      } else {
        alert(result.message || "로그인 실패");
      }
    } catch (err) {
      console.error(err);
      alert("로그인 중 오류가 발생했습니다.");
    }
  }

  window.handleLogout = function() {
    currentUser = null;
    localStorage.removeItem('nara_user');
    alert("로그아웃 되었습니다.");
    updateAuthUI();
    showMainView();
  };

  // ---------------- 자국 경제 관리 및 수정 뷰 ----------------

  window.showMyEconomyView = function() {
    if (!currentUser) {
      alert('로그인이 필요한 기능입니다.');
      window.windowShowLoginModal && window.windowShowLoginModal();
      return;
    }

    const mainView = document.getElementById('main-dashboard-view') || document.getElementById('main-view');
    const myView = document.getElementById('my-economy-view');

    if (mainView) mainView.style.display = 'none';
    if (myView) myView.style.display = 'block';

    // 로그인 사용자의 국가명(C열) 추출
    const myCountryName = currentUser.country || '';
    const cleanMyCountry = cleanName(myCountryName);

    // 전체 데이터 내에서 해당 국가 데이터 및 각종 순위 계산
    const myObj = mainData.find(d => cleanName(d['국가명'] || d['국가']) === cleanMyCountry) || {};

    // 순위 계산용 정렬 배열
    const gdpSorted = [...mainData].sort((a, b) => parseNumber(b['GDP'] || b['GDP(10억달러)']) - parseNumber(a['GDP'] || a['GDP(10억달러)']));
    const defSorted = [...mainData].sort((a, b) => parseNumber(b['국방비'] || b['국방비(10억달러)']) - parseNumber(a['국방비'] || a['국방비(10억달러)']));
    const popSorted = [...mainData].sort((a, b) => parseNumber(b['인구'] || b['인구(만명)']) - parseNumber(a['인구'] || a['인구(만명)']));
    const perGdpSorted = [...mainData].sort((a, b) => parseNumber(b['1인당GDP']) - parseNumber(a['1인당GDP']));

    const getRankStr = (arr) => {
      const idx = arr.findIndex(d => cleanName(d['국가명'] || d['국가']) === cleanMyCountry);
      return idx !== -1 ? `${idx + 1}위` : '-';
    };

    const flagUrl = flagMap.get(cleanMyCountry) || myObj['국기'] || myObj['국기링크'] || '';

    // [1행] 국기와 국가명
    const flagImg = document.getElementById('my-country-flag');
    const titleEl = document.getElementById('my-country-title');
    if (flagImg) {
      flagImg.src = flagUrl;
      flagImg.style.display = flagUrl ? 'inline-block' : 'none';
    }
    if (titleEl) titleEl.innerText = myCountryName || '국가명 없음';

    // [2행] 대륙과 소속연합
    const continentEl = document.getElementById('my-continent');
    const unionEl = document.getElementById('my-union');
    if (continentEl) continentEl.innerText = myObj['대륙'] || myObj['소속대륙'] || '-';
    if (unionEl) unionEl.innerText = myObj['소속연합'] || myObj['연합'] || '-';

    // [3행] GDP와 GDP 순위
    const gdpVal = parseNumber(myObj['GDP'] || myObj['GDP(10억달러)']);
    const gdpEl = document.getElementById('my-gdp-display');
    const gdpRankEl = document.getElementById('my-gdp-rank');
    if (gdpEl) gdpEl.innerText = formatMoney(gdpVal * 10);
    if (gdpRankEl) gdpRankEl.innerText = getRankStr(gdpSorted);

    // [4행] GDP대비 국방비(%), 국방비, 국방비 순위
    const defRateInput = document.getElementById('edit-def-rate');
    const defValEl = document.getElementById('my-def-display');
    const defRankEl = document.getElementById('my-def-rank');
    if (defRateInput) defRateInput.value = parseFloat(myObj['GDP대비국방비'] || 0).toFixed(2);
    if (defValEl) defValEl.innerText = formatMoney(parseNumber(myObj['국방비'] || myObj['국방비(10억달러)']) * 10);
    if (defRankEl) defRankEl.innerText = getRankStr(defSorted);

    // [5행] 인구수와 인구 순위
    const popValEl = document.getElementById('my-pop-display');
    const popRankEl = document.getElementById('my-pop-rank');
    if (popValEl) popValEl.innerText = formatPopulation(parseNumber(myObj['인구'] || myObj['인구(만명)']));
    if (popRankEl) popRankEl.innerText = getRankStr(popSorted);

    // [6행] 1인당 GDP와 1인당 GDP 순위
    const perGdpValEl = document.getElementById('my-per-gdp-display');
    const perGdpRankEl = document.getElementById('my-per-gdp-rank');
    if (perGdpValEl) perGdpValEl.innerText = `${Math.round(parseNumber(myObj['1인당GDP'])).toLocaleString()} 달러`;
    if (perGdpRankEl) perGdpRankEl.innerText = getRankStr(perGdpSorted);

    // [7행] 세율(%), 국가예산
    const taxRateInput = document.getElementById('edit-tax-rate');
    const budgetEl = document.getElementById('my-budget-display');
    if (taxRateInput) taxRateInput.value = parseFloat(myObj['세율'] || 0).toFixed(2);
    if (budgetEl) budgetEl.innerText = formatMoney(parseNumber(myObj['국가예산']) * 10);

    // [8행] 경제체제, 주업 (다수 선택형)
    const systemSelect = document.getElementById('edit-economic-system');
    if (systemSelect) systemSelect.value = myObj['경제체제'] || '시장경제';

    // 공백(띄어쓰기)을 기준으로 주업 목록을 분할하고 공백 제거
    const selectedJobs = (myObj['주업'] || '').split(/\s+/).filter(Boolean);

    // HTML element의 name="industry" 체크박스들을 탐색하여 일치 시 체크 처리
      document.querySelectorAll('input[name="industry"]').forEach(cb => {
        cb.checked = selectedJobs.includes(cb.value);
    });


    // [9행] 복지수준, 경제투자율(%)
    const welfareSelect = document.getElementById('edit-welfare');
    const investRateInput = document.getElementById('edit-invest-rate');
    if (welfareSelect) welfareSelect.value = myObj['복지수준'] || '복지없음';
    if (investRateInput) investRateInput.value = parseFloat(myObj['경제투자율'] || 0).toFixed(2);

    // [10행] 국고, 경제성장률
    const treasuryEl = document.getElementById('my-treasury-display');
    const growthRateEl = document.getElementById('my-growth-rate-display');
    if (treasuryEl) treasuryEl.innerText = formatMoney(parseNumber(myObj['국고']));
    if (growthRateEl) growthRateEl.innerText = `${parseNumber(myObj['최종경제성장률'] || myObj['경제성장률'])}%`;

    // 해외 경제 투자 목록 불러오기 및 렌더링
    if (typeof loadMyInvestments === 'function') {
      loadMyInvestments();
    }
  };

  // ---------------- 저장 버튼 클릭 시 실시간 데이터 전송 및 화면 업데이트 ----------------

  window.saveMyEconomyData = async function() {
  if (!currentUser || !currentUser.country) {
    alert('로그인이 필요하거나 국가 정보가 없습니다.');
    return;
  }

  const defRate = parseFloat(document.getElementById('edit-def-rate')?.value || 0);
  const taxRate = parseFloat(document.getElementById('edit-tax-rate')?.value || 0);
  const investRate = parseFloat(document.getElementById('edit-invest-rate')?.value || 0);
  const economicSystem = document.getElementById('edit-economic-system')?.value || '';
  const welfare = document.getElementById('edit-welfare')?.value || '';

  const selectedJobs = [];
  document.querySelectorAll('input[name="industry"]:checked').forEach(cb => {
    selectedJobs.push(cb.value);
  });

  const payload = {
    action: 'updateMyEconomy',
    country: cleanName(currentUser.country),
    defRate: defRate,
    taxRate: taxRate,
    investRate: investRate,
    economicSystem: economicSystem,
    welfare: welfare,
    mainJobs: selectedJobs.join(' ')
  };

  try {
    // 메인 API URL로 요청 전송
    const response = await fetch(API_URL, { 
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (result.success || result.result === 'success') {
      alert('자국 경제 설정이 정상적으로 저장되었습니다.');
      if (typeof loadMainData === 'function') {
        await loadMainData();
        showMyEconomyView();
      }
    } else {
      alert('저장 실패: ' + (result.message || '알 수 없는 오류'));
    }
  } catch (err) {
    console.error('저장 중 오류 발생:', err);
    alert('저장 처리 도중 오류가 발생했습니다.');
  }
};

  // =========== 해외 경제 투자 목록 불러오기 ===========
// 1. Apps Script 메인 API(API_URL)에서 // 자국 해외 투자 내역 불러오기 (실패 시 자동 재시도 적용)
async function loadMyInvestments(retryCount = 0) {
  if (!currentUser || !currentUser.country) return;

  const tbody = document.getElementById('my-investment-list');
  if (!tbody) return;

  const maxRetries = 5; // 최대 재시도 횟수

  // 재시도 중일 때도 "다시 불러오는 중..." 문구 표시
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">투자 내역을 불러오는 중... ${retryCount > 0 ? `(재시도 ${retryCount}/${maxRetries})` : ''}</td></tr>`;

  try {
    const url = `${API_URL}?target=investments&country=${encodeURIComponent(currentUser.country)}`;
    const response = await fetch(url);
    const result = await response.json();

    if (result.result === 'success' && Array.isArray(result.investments)) {
      renderMyInvestments(result.investments);
    } else {
      // 결과 실패 시 바로 문구를 띄우지 않고 다시 호출
      if (retryCount < maxRetries) {
        console.warn(`[해외투자] 불러오기 응답 미완료/실패. 1.5초 후 재시도 (${retryCount + 1}/${maxRetries})`);
        setTimeout(() => {
          loadMyInvestments(retryCount + 1);
        }, 1500); // 1.5초 후 재시도
      } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">투자 내역을 불러오지 못했습니다. (재시도 횟수 초과)</td></tr>';
      }
    }
  } catch (err) {
    console.error('해외투자 불러오기 오류:', err);
    
    // 네트워크/파싱 오류 시에도 지정 횟수까지 재시도
    if (retryCount < maxRetries) {
      setTimeout(() => {
        loadMyInvestments(retryCount + 1);
      }, 1500);
    } else {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
    }
  }
}

// 2. 전달받은 투자 목록 데이터를 HTML 테이블에 출력하기
function renderMyInvestments(investments) {
  const tbody = document.getElementById('my-investment-list');
  if (!tbody) return;

  if (!investments || investments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">현재 해외 투자 내역이 없습니다.</td></tr>';
    return;
  }

  // index.html의 7개 컬럼(피투자국, 피투자국 등급, 투자금, 수익여부, 환수율, 성장률 증가, 차익금)에 맞추어 출력
  tbody.innerHTML = investments.map(item => `
    <tr>
      <td>${item.targetCountry || '-'}</td>
      <td>${item.targetCountryrate || '-'}</td>
      <td>${Number(item.amount*10 || 0).toLocaleString()}억달러</td>
      <td>${item.profitStatus || '-'}</td>
      <td>${item.ReturnRate || '-'}%</td>
      <td${item.growthRate || '-'}%p</td>
      <td>${Number(item.Profitgain*10 || 0).toLocaleString()}억달러</td>
    </tr>
  `).join('');
}
});
