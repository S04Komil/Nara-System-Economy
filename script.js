document.addEventListener("DOMContentLoaded", function() {
  // 1. 현재 연도 메인 통합 API
  const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec";

  // 2. 항목별 전체 연도 시계열 API (업데이트됨)
  const API_URL_GDP = "https://script.google.com/macros/s/AKfycbzyzCjtpkPMsXf20Z9mylf_h_58KR-9wclFykOlzq9zADXWgr_dOVLc0KLzjsCF8CDowg/exec";
  const API_URL_DEF = "https://script.google.com/macros/s/AKfycbzBR1_K63Ynh5dmyXTEqsdq_208QZyUhDtN3x898rHvYm7CiENiBHiwyfp2i4gqMdRTdQ/exec";
  const API_URL_CAP = "https://script.google.com/macros/s/AKfycbyyq9gnFw4mPr3jY6ReqYMJphX9TzfmecVnz0WfoFru9u9aiTwk3Cr5wzdbBw1aQ9xsyA/exec";

  let mainData = [];
  let globalGdpData = [];
  let globalDefData = [];
  let globalCapData = [];
  let worldTotals = { gdp: 0, pop: 0, def: 0, cap: 0 };

  // 개별 API 성공 시까지 독립 재시도 함수
  const fetchUntilSuccess = async (url, name) => {
    let attempt = 1;
    while (true) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const data = await res.json();
        console.log(`[성공] ${name} (${attempt}번째 시도)`);
        return data;
      } catch (err) {
        console.warn(`[실패] ${name} (${attempt}번째 시도) - 1초 후 재시도...`, err);
        attempt++;
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 후 재시도
      }
    }
  };

  // 요청 목록 배열 정의
  const apiRequests = [
    { url: API_URL, name: "메인 API" },
    { url: API_URL_GDP, name: "GDP API" },
    { url: API_URL_DEF, name: "국방비 API" },
    { url: API_URL_CAP, name: "1인당GDP API" }
  ];

  // 배열을 순회하며 동시에 요청을 시작하되, 실패한 항목만 개별 반복
  Promise.all(apiRequests.map(item => fetchUntilSuccess(item.url, item.name)))
  .then(([mainRes, gdpRes, defRes, capRes]) => {
    console.group("📡 [API 수신 상태 확인]");
    console.log("1. 메인 API 응답:", mainRes);
    console.log("2. GDP 시계열 API 응답:", gdpRes);
    console.log("3. 국방비 시계열 API 응답:", defRes);
    console.log("4. 1인당GDP 시계열 API 응답:", capRes);
    console.groupEnd();

    document.getElementById('loading').style.display = 'none';

    mainData = mainRes ? (mainRes.data || mainRes) : [];
    globalGdpData = gdpRes ? (gdpRes.data || gdpRes) : [];
    globalDefData = defRes ? (defRes.data || defRes) : [];
    globalCapData = capRes ? (capRes.data || capRes) : [];

    if (!mainData || mainData.length === 0) {
      document.getElementById('loading').innerText = '불러올 데이터가 없습니다.';
      document.getElementById('loading').style.display = 'block';
      return;
    }

    document.getElementById('dashboard').style.display = 'block';

    let sheetName = mainRes ? mainRes.sheetName : null;
    if (sheetName) {
      document.getElementById('data-year').innerText = `${sheetName}년 기준`;
    } else {
      document.getElementById('data-year').innerText = `최신 데이터 기준`;
    }

    calculateWorldTotals(mainData);
    renderMainCards(mainData);
    renderWorldStats();
  })
  .catch(error => {
    console.error('Data Fetch Error:', error);
    document.getElementById('loading').innerText = '데이터를 불러오는 데 실패했습니다.';
  });

  function calculateWorldTotals(data) {
    let gdp = 0, pop = 0, def = 0;
    data.forEach(item => {
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
    const getTop = (key) => data.reduce((max, item) => (parseFloat(item[key]) || 0) > (parseFloat(max[key]) || 0) ? item : max, data[0]);

    const topGdp = getTop('GDP(10억달러)');
    const topDef = getTop('국방비(10억달러)');
    const topPop = getTop('인구(만명)');
    const topCap = getTop('1인당GDP');

    document.getElementById('top-gdp-country').innerText = topGdp['국가'] || '-';
    document.getElementById('top-gdp-val').innerText = formatMoney((parseFloat(topGdp['GDP(10억달러)']) || 0) * 10);

    document.getElementById('top-def-country').innerText = topDef['국가'] || '-';
    document.getElementById('top-def-val').innerText = formatMoney((parseFloat(topDef['국방비(10억달러)']) || 0) * 10);

    document.getElementById('top-pop-country').innerText = topPop['국가'] || '-';
    document.getElementById('top-pop-val').innerText = formatPopulation(topPop['인구(만명)']);

    document.getElementById('top-cap-country').innerText = topCap['국가'] || '-';
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
    return String(str).replace(/\s+/g, '').replace(/[^a-zA-Z0-9가-힣]/g, '');
  }

  function getSortedYearKeys(seriesData) {
    if (!seriesData || seriesData.length === 0) return [];
    
    const sample = seriesData[0];
    const yearKeys = Object.keys(sample).filter(k => /^\d+년?$/.test(k.trim()));

    return yearKeys.sort((a, b) => {
      const yearA = parseInt(a.replace(/\D/g, ''), 10);
      const yearB = parseInt(b.replace(/\D/g, ''), 10);
      return yearA - yearB;
    });
  }

  window.switchCategory = function(key, title, unitType, navBtnId) {
    document.getElementById('main-view').style.display = 'block' === 'none' ? 'block' : 'none';
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
      let rawVal = parseFloat(item[key]) || 0;
      if (key === 'GDP(10억달러)' || key === '국방비(10억달러)') {
        rawVal *= 10;
      }
      return {
        country: (item['국가'] || '').trim(),
        category: (item['카테고리'] || '').trim(),
        val: rawVal
      };
    }).filter(item => item.country !== '').sort((a, b) => b.val - a.val);

    let targetSeriesData = [];
    if (key === 'GDP(10억달러)') targetSeriesData = globalGdpData;
    else if (key === '국방비(10억달러)') targetSeriesData = globalDefData;
    else if (key === '1인당GDP') targetSeriesData = globalCapData;

    const prevRankMap = new Map();

    if (targetSeriesData && targetSeriesData.length > 0) {
      const yearKeys = getSortedYearKeys(targetSeriesData);

      if (yearKeys.length > 0) {
        let targetIndex = yearKeys.length >= 2 ? yearKeys.length - 2 : yearKeys.length - 1;
        let prevYearKey = yearKeys[targetIndex];

        let prevList = targetSeriesData.map(item => {
          let rawVal = parseFloat(item[prevYearKey]) || 0;
          if (key === 'GDP(10억달러)' || key === '국방비(10억달러)') {
            rawVal *= 10;
          }
          
          let rawCountry = item['국가'] || item['카테고리'] || Object.values(item)[0] || '';
          
          return {
            rawCountry: String(rawCountry).trim(),
            cleanKey: cleanName(rawCountry),
            val: rawVal
          };
        })
        .filter(item => item.cleanKey !== '' && item.val > 0)
        .sort((a, b) => b.val - a.val);

        prevList.forEach((item, idx) => {
          prevRankMap.set(item.cleanKey, idx + 1);
        });
      }
    }

    let listData = currentList.map((item, idx) => {
      const currentRank = idx + 1;
      
      const cleanCountryKey = cleanName(item.country);
      const cleanCategoryKey = cleanName(item.category);
      
      const prevRank = prevRankMap.get(cleanCountryKey) || prevRankMap.get(cleanCategoryKey);

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

    .then(([mainRes, gdpRes, defRes, capRes]) => {
    console.group("📡 [API 수신 상태 및 국가명 검증]");
    
    mainData = mainRes ? (mainRes.data || mainRes) : [];
    globalGdpData = gdpRes ? (gdpRes.data || gdpRes) : [];
    globalDefData = defRes ? (defRes.data || defRes) : [];
    globalCapData = capRes ? (capRes.data || capRes) : [];

    // 1. 메인 API 국가명 추출 확인
    const mainCountries = mainData.map(item => item['국가'] || item['카테고리']).filter(Boolean);
    console.log("1. 메인 API 국가 목록 (총 " + mainCountries.length + "개):", mainCountries);

    // 2. GDP 시계열 API 국가명 추출 확인
    if (globalGdpData.length > 0) {
      const gdpCountries = globalGdpData.map(item => item['국가'] || item['카테고리'] || Object.values(item)[0]);
      console.log("2. GDP API 국가 목록 (총 " + gdpCountries.length + "개):", gdpCountries);
    }

    // 3. 국방비 시계열 API 국가명 추출 확인
    if (globalDefData.length > 0) {
      const defCountries = globalDefData.map(item => item['국가'] || item['카테고리'] || Object.values(item)[0]);
      console.log("3. 국방비 API 국가 목록 (총 " + defCountries.length + "개):", defCountries);
    }

    // 4. 1인당 GDP 시계열 API 국가명 추출 확인
    if (globalCapData.length > 0) {
      const capCountries = globalCapData.map(item => item['국가'] || item['카테고리'] || Object.values(item)[0]);
      console.log("4. 1인당 GDP API 국가 목록 (총 " + capCountries.length + "개):", capCountries);
    }

    console.groupEnd();

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
    } else {
      document.getElementById('data-year').innerText = `최신 데이터 기준`;
    }

    calculateWorldTotals(mainData);
    renderMainCards(mainData);
    renderWorldStats();
  })
    });
  };
});
