document.addEventListener("DOMContentLoaded", function() {
  // 1. 현재 연도 메인 통합 API
  const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec"; 

  // 2. 항목별 전체 연도 시계열 API
  const API_URL_GDP = "https://script.google.com/macros/s/AKfycbzyzCjtpkPMsXf20Z9mylf_h_58KR-9wclFykOlzq9zADXWgr_dOVLc0KLzjsCF8CDowg/exec";
  const API_URL_DEF = "https://script.google.com/macros/s/AKfycbzBR1_K63Ynh5dmyXTEqsdq_208QZyUhDtN3x898rHvYm7CiENiBHiwyfp2i4gqMdRTdQ/exec";
  const API_URL_CAP = "https://script.google.com/macros/s/AKfycbyyq9gnFw4mPr3jY6ReqYMJphX9TzfmecVnz0WfoFru9u9aiTwk3Cr5wzdbBw1aQ9xsyA/exec";

  // 3. 세계 통계 성장률 API (나라시스템 세계통계 구글시트 연동 Apps Script URL)
  const API_URL_GROWTH = "https://script.google.com/macros/s/AKfycbz2v5Yoh3CmMcTfKBUoO4EWiKOYe1kZ8Z3nWZ2Jvu6kzUICsaJgmlFatcBn1ixfShzJyA/exec"; 

  let mainData = [];
  let globalGdpData = [];
  let globalDefData = [];
  let globalCapData = [];
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

  Promise.all(apiRequests.map(req => fetchWithSmartRetry(req.url, req.name)))
  .then(([mainRes, gdpRes, defRes, capRes]) => {
    mainData = mainRes ? (mainRes.data || mainRes) : [];
    globalGdpData = gdpRes ? (gdpRes.data || gdpRes) : [];
    globalDefData = defRes ? (defRes.data || defRes) : [];
    globalCapData = capRes ? (capRes.data || capRes) : [];

    document.getElementById('loading').style.display = 'none';

    if (!mainData || mainData.length === 0) {
      document.getElementById('loading').innerText = '불러올 데이터가 없습니다.';
      document.getElementById('loading').style.display = 'block';
      return;
    }

    document.getElementById('dashboard').style.display = 'block';

    let sheetName = mainRes ? mainRes.sheetName : null;
    if (sheetName) {
      document.getElementById('data-year').innerText = `${sheetName}년 기준`;
      currentSheetYear = parseInt(sheetName, 10) || 1970;
    } else {
      document.getElementById('data-year').innerText = `최신 데이터 기준`;
      currentSheetYear = 1970;
    }

    console.log(`🚀 [데이터 로드 완료] 기준 연도: ${currentSheetYear}년`);
    console.log("📊 메인 데이터 원본 수:", mainData.length);

    calculateWorldTotals(mainData);
    renderMainCards(mainData);
    renderWorldStats();
    
    // 성장률 데이터 추가 로드
    fetchWorldGrowthData();
  })
  .catch(error => {
    console.error('Data Fetch Error:', error);
    document.getElementById('loading').innerText = '데이터를 불러오는 데 실패했습니다.';
  });

  // 세계 성장률 데이터 가져오기 함수
  function fetchWorldGrowthData() {
    if (!API_URL_GROWTH || API_URL_GROWTH.includes("YOUR_APPS_SCRIPT")) return;

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

      gdp += ((parseFloat(item['GDP(10억달러)']) || 0) * 10);
      pop += (parseFloat(item['인구(만명)']) || 0);
      def += ((parseFloat(item['국방비(10억달러)']) || 0) * 10);
    });

    let cap = pop > 0 ? (gdp / pop) * 10000 : 0;
    worldTotals = { gdp, pop, def, cap };
  }

  function formatMoney(billionVal) {
    let val = Math.round((parseFloat(billionVal) || 0) * 100000000);
    if (val === 0) return "0달러";

    let result = "";
    const jo = Math.floor(val / 1000000000000);
    val %= 1000000000000;
    const eok = Math.floor(val / 100000000);
    val %= 100000000;
    const man = Math.floor(val / 10000);

    if (jo > 0) result += `${jo}조 `;
    if (eok > 0) result += `${eok.toLocaleString()}억 `;
    if (man > 0) result += `${man.toLocaleString()}만`;

    return result.trim() + "달러";
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

    const getTop = (key) => validCountries.reduce((max, item) => (parseFloat(item[key]) || 0) > (parseFloat(max[key]) || 0) ? item : max, validCountries[0]);

    const topGdp = getTop('GDP(10억달러)');
    const topDef = getTop('국방비(10억달러)');
    const topPop = getTop('인구(만명)');
    const topCap = getTop('1인당GDP');

    document.getElementById('top-gdp-country').innerText = topGdp['국가'] || topGdp['카테고리'] || '-';
    document.getElementById('top-gdp-val').innerText = formatMoney((parseFloat(topGdp['GDP(10억달러)']) || 0) * 10);

    document.getElementById('top-def-country').innerText = topDef['국가'] || topDef['카테고리'] || '-';
    document.getElementById('top-def-val').innerText = formatMoney((parseFloat(topDef['국방비(10억달러)']) || 0) * 10);

    document.getElementById('top-pop-country').innerText = topPop['top-pop-country'] || topPop['국가'] || topPop['카테고리'] || '-';
    document.getElementById('top-pop-val').innerText = formatPopulation(topPop['인구(만명)']);

    document.getElementById('top-cap-country').innerText = topCap['국가'] || topCap['카테고리'] || '-';
    document.getElementById('top-cap-val').innerText = `${Math.round(parseFloat(topCap['1인당GDP']) || 0).toLocaleString()} 달러`;
  }

  function renderWorldStats() {
    document.getElementById('world-gdp').innerText = formatMoney(worldTotals.gdp);
    document.getElementById('world-pop').innerText = formatPopulation(worldTotals.pop);
    document.getElementById('world-def').innerText = formatMoney(worldTotals.def);
    document.getElementById('world-cap').innerText = `${Math.round(worldTotals.cap).toLocaleString()} 달러`;
  }

  window.showMainView = function() {
    document.getElementById('main-view').style.display = 'block';
    document.getElementById('rank-view').style.display = 'none';

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
    console.group(`🔍 [카테고리 전환] ${title}`);

    document.getElementById('main-view').style.display = 'none';
    document.getElementById('rank-view').style.display = 'block';

    document.getElementById('rank-title').innerText = title;

    document.querySelectorAll('.nav-item button').forEach(btn => btn.classList.remove('active'));
    if (navBtnId) {
      document.getElementById(navBtnId).classList.add('active');
    }

    const listEl = document.getElementById('rank-list');
    listEl.innerHTML = '';

    let totalBaseVal = 0;
    if (key === 'GDP(10억달러)') totalBaseVal = worldTotals.gdp;
    else if (key === '인구(만명)') totalBaseVal = worldTotals.pop;
    else if (key === '국방비(10억달러)') totalBaseVal = worldTotals.def;

    let currentList = mainData.map(item => {
      let rawCountry = extractCountryFromRow(item);
      let cleanedName = cleanName(rawCountry);

      if (cleanedName === '전세계') return null;

      let rawVal = item[key];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '' || String(rawVal).trim() === 'N/A') {
        return null;
      }

      let numVal = parseFloat(rawVal);
      if (isNaN(numVal) || numVal <= 0) {
        return null;
      }

      if (key === 'GDP(10억달러)' || key === '국방비(10억달러)') {
        numVal *= 10;
      }

      return {
        country: rawCountry,
        cleanKey: cleanedName,
        val: numVal
      };
    })
    .filter(item => item !== null && item.country !== '')
    .sort((a, b) => {
      if (b.val !== a.val) return b.val - a.val;
      return a.cleanKey.localeCompare(b.cleanKey);
    });

    let targetSeriesData = [];
    if (key === 'GDP(10억달러)') targetSeriesData = globalGdpData;
    else if (key === '국방비(10억달러)') targetSeriesData = globalDefData;
    else if (key === '1인당GDP') targetSeriesData = globalCapData;

    const prevRankMap = new Map();

    if (key !== '인구(만명)' && targetSeriesData && targetSeriesData.length > 0) {
      const yearKeys = getSortedYearKeys(targetSeriesData);

      const validYearKeys = yearKeys.filter(k => {
        const y = parseInt(k.replace(/[^\d]/g, ''), 10);
        return y <= currentSheetYear;
      });

      if (validYearKeys.length > 0) {
        let targetIndex = validYearKeys.length >= 2 ? validYearKeys.length - 2 : validYearKeys.length - 1;
        let prevYearKey = validYearKeys[targetIndex];

        console.log(`📅 이전 비교 연도 컬럼 키: [${prevYearKey}]`);

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
            if (isNaN(numVal) || numVal <= 0) {
              return null;
            }

            if (key === 'GDP(10억달러)' || key === '국방비(10억달러)') {
              numVal *= 10;
            }

            return {
              rawCountry: String(rawCountry).trim(),
              cleanKey: cleanedName,
              val: numVal
            };
          })
          .filter(item => item !== null && item.cleanKey !== '')
          .sort((a, b) => {
            if (b.val !== a.val) return b.val - a.val;
            return a.cleanKey.localeCompare(b.cleanKey);
          });

        console.log(`✅ [${prevYearKey}] 유효 데이터 국가 수 (전세계 제외): ${prevList.length}개`);

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
        val: item.val,
        currentRank: currentRank,
        prevRank: prevRank || null,
        isWorld: false
      };
    });

    if (key === '1인당GDP') {
      listData.push({
        country: '전세계',
        val: worldTotals.cap,
        currentRank: null,
        prevRank: null,
        isWorld: true
      });
      listData.sort((a, b) => b.val - a.val);
    }

    const maxValInList = listData.length > 0 ? listData[0].val : 1;

    console.log("📈 [최종 순위 집계 국가 수]:", currentList.length);

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
        rankDiffHtml = "";
      } else {
        rankDisplay = `${rankCounter}.`;
        rankCounter++;

        if (key === '인구(만명)') {
          rankDiffHtml = "";
        } else if (!item.prevRank) {
          rankDiffHtml = `<span class="rank-diff new">NEW</span>`;
        } else {
          const diff = item.prevRank - item.currentRank;
          if (diff > 0) {
            rankDiffHtml = `<span class="rank-diff up">▲${diff}</span>`;
          } else if (diff < 0) {
            rankDiffHtml = `<span class="rank-diff down">▼${Math.abs(diff)}</span>`;
          } else {
            rankDiffHtml = `<span class="rank-diff same">-</span>`;
          }
        }
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
      li.innerHTML = `
        <div class="rank-bar" style="width: ${percent}%;"></div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="rank-num">${rankDisplay}</span>
          ${rankDiffHtml}
          <span class="rank-country">${item.country}</span>
        </div>
        <span class="rank-val">${formattedVal}</span>
      `;
      listEl.appendChild(li);
    });

    console.groupEnd();
  };
});
