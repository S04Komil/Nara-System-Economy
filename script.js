document.addEventListener("DOMContentLoaded", function() {
  // =============================================================
  // [수정] Firebase Realtime Database 경로 설정 (공개 URL 기준)
  // =============================================================
  const FIREBASE_DB_URL = "https://narasystemeconomy-default-rtdb.asia-southeast1.firebasedatabase.app/";

  const API_URL = `${FIREBASE_DB_URL}/nara_economy/main_city.json`;  // 본연도시트
  const API_OEI = `${FIREBASE_DB_URL}/nara_economy/overseas_investment.json`;  // 해외경제투자 시트
  
  // 1-1. 수정 전용 구글 api (Apps Script 유지)
  const API_EDIT = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec";
  const MIL_API_EDIT = "https://script.google.com/macros/s/AKfycby34j_Pyq7atkRRcYAUXnjb3O31rQQa4NDrg7uZa2ADpi0g7Za6rUCVPIb0LkEyFrvg/exec";

  // 2. 항목별 전체 연도 시계열 JSON 경로 (파이어베이스 경로에 맞게 매핑)
  const API_URL_GDP = `${FIREBASE_DB_URL}/nara_rank/gdp_per.json`; // GDP순위
  const API_URL_DEF = `${FIREBASE_DB_URL}/nara_rank/defence.json`; // 국방비순위
  const API_URL_CAP = `${FIREBASE_DB_URL}/nara_rank/gdp_per_capita.json`; // 1인당GDP순위
  // 기존 시계열 경로 아래에 추가
  const API_URL_ARMY = `${FIREBASE_DB_URL}/nara_military/army.json`; // 육군 실시간 전력
  const API_URL_NAVY = `${FIREBASE_DB_URL}/nara_military/navy.json`; // 해군 실시간 전력
  const API_URL_AIR  = `${FIREBASE_DB_URL}/nara_military/air.json`;  // 공군 실시간 전력
  const API_URL_MILITARY_CHANGE = `${FIREBASE_DB_URL}/nara_rank/military_rank_change.json`; // 군사력순위변화 시계열
  const API_URL_TOTAL_MILITARY  = `${FIREBASE_DB_URL}/nara_rank/total_military.json`;   // 종합 군사력 순위
  const API_URL_ARMY_CHANGE = `${FIREBASE_DB_URL}/nara_rank/army_rank_change.json`; // 육군 순위 변화 시계열
  const API_URL_NAVY_CHANGE = `${FIREBASE_DB_URL}/nara_rank/navy_rank_change.json`; // 해군 순위 변화 시계열
  const API_URL_AIR_CHANGE  = `${FIREBASE_DB_URL}/nara_rank/air_rank_change.json`;  // 공군 순위 변화 시계열

  // 3. 세계 통계 성장률 API
  const API_URL_GROWTH = `${FIREBASE_DB_URL}/nara_rank/global.json`; //세계 통계 성장률

  // 4. 회원가입/로그인 및 데이터 업데이트 전용 Apps Script 웹 앱 URL
  const LOGIN_GAS_URL = "https://script.google.com/macros/s/AKfycbzEdyNoBaRzsz5puqJup02WA6dEmUp-3BLU7ULgqxeGZUrvGx_Xcf68imojU9oFFCFk/exec"; 
  const GAS_WEB_APP_URL = LOGIN_GAS_URL; // 백엔드 처리 URL 통합

  let currentUser = JSON.parse(localStorage.getItem('nara_user') || 'null');

  let mainData = []; //메인경제 데이터
  let globalGdpData = []; //GDP순위 시계열 데이터
  let globalDefData = []; //국방비순위 시계열 데이터
  let globalCapData = []; //1인당GDP순위 시계열 데이터
  let flagMap = new Map(); // 국방비 시계열 국기링크 URL 저장용
  let worldTotals = { gdp: 0, pop: 0, def: 0, cap: 0 };
  let currentSheetYear = 1970;
  let globalArmyData = []; //육군데이터
  let globalNavyData = []; //해군데이터
  let globalAirData = []; //공군데이터
  let globalMilitaryChangeData = []; //종합군사력시계열 데이터
  let globalTotalMilitaryData = []; //종합군사력데이터
  let globalArmyChangeData = []; //육군 시계열 데이터
  let globalNavyChangeData = []; //해군 시계열 데이터
  let globalAirChangeData = []; // 공군 시계열 데이터

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // 유효한 숫자 데이터 파싱 함수
  const parseNumber = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

  // JSON 파일 호출을 위한 fetch 함수 (스마트 재시도 로직 유지)
  const fetchWithSmartRetry = async (url, name) => {
    let attempt = 1;
    let waitTime = 1000;
    while (true) {
      try {
        const cacheBusterUrl = `${url}?_t=${Date.now()}`;
        const res = await fetch(cacheBusterUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        if (!res.ok) throw new Error(`HTTP 에러 상태: ${res.status}`);
        
        const parsedData = await res.json();
        return parsedData;
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
      // 1. 모든 API 요청 정의
      const apiRequests = [
        { url: API_URL, name: "메인 API" },
        { url: API_URL_GDP, name: "GDP 시계열 API" },
        { url: API_URL_DEF, name: "국방비 시계열 API" },
        { url: API_URL_CAP, name: "1인당 GDP 시계열 API" },
        { url: API_URL_ARMY, name: "육군 실시간 전력" },
        { url: API_URL_NAVY, name: "해군 실시간 전력" },
        { url: API_URL_AIR, name: "공군 실시간 전력" },
        { url: API_URL_TOTAL_MILITARY, name: "종합 군사력 순위" },         // 👈 추가
        { url: API_URL_MILITARY_CHANGE, name: "군사력 순위 변화 시계열" },
        { url: API_URL_ARMY_CHANGE, name: "육군 순위 변화 시계열" },
        { url: API_URL_NAVY_CHANGE, name: "해군 순위 변화 시계열" },
        { url: API_URL_AIR_CHANGE, name: "공군 순위 변화 시계열" }
      ];

      // 2. Promise.allSettled를 사용해 개별 요청 실패가 전체 실패로 이어지지 않도록 분기 처리
      const results = await Promise.allSettled(
        apiRequests.map(req => fetchWithSmartRetry(req.url, req.name))
      );

      // 각 응답 결과를 안전하게 추출 (성공하면 데이터, 실패하면 빈 배열)
      const getDataOrEmpty = (index) => {
        return (results[index].status === 'fulfilled') ? results[index].value : [];
      };

      const mainRes = getDataOrEmpty(0);
      const gdpRes  = getDataOrEmpty(1);
      const defRes  = getDataOrEmpty(2);
      const capRes  = getDataOrEmpty(3);
      const armyRes = getDataOrEmpty(4);
      const navyRes = getDataOrEmpty(5);
      const airRes  = getDataOrEmpty(6);
      const totalMilRes   = getDataOrEmpty(7);  // 👈 추가
      const milChangeRes  = getDataOrEmpty(8);  // 👈 추가
      const armyChangeRes = getDataOrEmpty(9);  // 👈 추가
      const navyChangeRes = getDataOrEmpty(10); // 👈 추가
      const airChangeRes  = getDataOrEmpty(11); // 👈 추가

      mainData = Array.isArray(mainRes) ? mainRes : [];
      globalGdpData = Array.isArray(gdpRes) ? gdpRes : [];
      globalDefData = Array.isArray(defRes) ? defRes : [];
      globalCapData = Array.isArray(capRes) ? capRes : [];
      globalArmyData = Array.isArray(armyRes) ? armyRes : [];
      globalNavyData = Array.isArray(navyRes) ? navyRes : [];
      globalAirData  = Array.isArray(airRes) ? airRes : [];
      
      // 💡 2. 가져온 군사력 데이터를 전역 변수에 쏙쏙 대입!
      globalTotalMilitaryData  = Array.isArray(totalMilRes) ? totalMilRes : [];
      globalMilitaryChangeData = Array.isArray(milChangeRes) ? milChangeRes : [];
      globalArmyChangeData     = Array.isArray(armyChangeRes) ? armyChangeRes : [];
      globalNavyChangeData     = Array.isArray(navyChangeRes) ? navyChangeRes : [];
      globalAirChangeData      = Array.isArray(airChangeRes) ? airChangeRes : [];

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

      let detectedYear = null;

      if (mainData[0]) {
        const rawYear = mainData[0]['연도'] || mainData[0]['sheetName'] || mainData[0]['Year'];
        if (rawYear) {
          const parsed = parseInt(String(rawYear).replace(/[^\d]/g, ''), 10);
          if (!isNaN(parsed)) detectedYear = parsed;
        }
      }

      if (!detectedYear && globalGdpData.length > 0) {
        const yearKeys = getSortedYearKeys(globalGdpData);
        if (yearKeys.length > 0) {
          const latestKey = yearKeys[yearKeys.length - 1];
          const parsed = parseInt(latestKey.replace(/[^\d]/g, ''), 10);
          if (!isNaN(parsed)) detectedYear = parsed;
        }
      }

      if (detectedYear) {
        currentSheetYear = detectedYear;
      }

      const dataYearEl = document.getElementById('data-year');
      if (dataYearEl) {
        dataYearEl.innerText = `${currentSheetYear}년 데이터 기준`;
      }

      calculateWorldTotals(mainData);
      renderMainCards(mainData);
      renderWorldStats();
      
      if (typeof updateAuthUI === 'function') updateAuthUI();
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
      .then(dataArr => {
        if (!dataArr || !Array.isArray(dataArr) || dataArr.length === 0) return;
        
        // 현재 설정된 currentSheetYear와 일치하는 성장률 데이터 찾기 (없으면 최신 데이터)
        let targetData = dataArr.find(item => {
          const y = parseInt(String(item['연도'] || item['sheetName'] || '').replace(/[^\d]/g, ''), 10);
          return y === currentSheetYear;
        }) || dataArr[dataArr.length - 1];

        const formatGrowth = (val) => {
          if (val === null || val === undefined || val === '' || isNaN(parseFloat(val))) return "-";
          const num = parseFloat(val);
          const prefix = num > 0 ? "▲ " : num < 0 ? "▼ " : "";
          return `${prefix}${Math.abs(num).toFixed(2)}%`;
        };

        const gdpEl = document.getElementById('world-gdp-growth');
        const popEl = document.getElementById('world-pop-growth');
        const capEl = document.getElementById('world-cap-growth');

        if (gdpEl) gdpEl.innerText = formatGrowth(targetData['전연도대비GDP성장률']);
        if (popEl) popEl.innerText = formatGrowth(targetData['전연도대비인구성장률']);
        if (capEl) capEl.innerText = formatGrowth(targetData['전연도대비1인당GDP성장률']);
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

    // =========================================================
    // 군사력 종합 / 육군 / 공군 / 해군 1위 카드 렌더링 (globalTotalMilitaryData 기준)
    // =========================================================
    const validMilitary = (Array.isArray(globalTotalMilitaryData) ? globalTotalMilitaryData : [])
      .filter(item => item && typeof item === 'object' && cleanName(extractCountryFromRow(item)) !== '전세계');

    const getMilitaryTop = (scoreKey) => {
      if (!validMilitary.length) return null;
      return validMilitary.reduce((best, item) => {
        const curScore = parseNumber(item[scoreKey]);
        const bestScore = best ? parseNumber(best[scoreKey]) : -Infinity;
        return curScore > bestScore ? item : best;
      }, null);
    };

    const setMilitaryCard = (countryElId, valElId, scoreKey) => {
      const countryEl = document.getElementById(countryElId);
      const valEl = document.getElementById(valElId);
      const topItem = getMilitaryTop(scoreKey);

      if (!topItem) {
        if (countryEl) countryEl.innerText = '-';
        if (valEl) valEl.innerText = '-';
        return;
      }

      const scoreVal = parseNumber(topItem[scoreKey]);
      if (countryEl) {
        countryEl.innerText = extractCountryFromRow(topItem) || '-';
      }
      if (valEl) {
        valEl.innerText = `${Math.round(scoreVal).toLocaleString()} 점`;
      }
    };

    setMilitaryCard('top-total-military-country', 'top-total-military-val', '군사력종합');
    setMilitaryCard('top-army-country', 'top-army-val', '육군점수');
    setMilitaryCard('top-air-country', 'top-air-val', '공군점수');
    setMilitaryCard('top-navy-country', 'top-navy-val', '해군점수');
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

window.switchCategory = function(key, title, unitType, navBtnId, sheetName) {
  if (sheetName) {
    const parsedYear = parseInt(String(sheetName).replace(/[^\d]/g, ''), 10);
    if (!isNaN(parsedYear)) {
      currentSheetYear = parsedYear;
    }
  }

  const mainView = document.getElementById('main-view') || document.getElementById('main-dashboard-view');
  const rankView = document.getElementById('rank-view');
  const myEconomyView = document.getElementById('my-economy-view');

  if (key === 'my-economy-view' || key === 'my-economy' || key === '자국경제') {
    if (mainView) mainView.style.display = 'none';
    if (rankView) rankView.style.display = 'none';
    if (myEconomyView) myEconomyView.style.display = 'block';

    document.querySelectorAll('.nav-item button').forEach(btn => btn.classList.remove('active'));
    if (navBtnId) {
      const btn = document.getElementById(navBtnId);
      if (btn) btn.classList.add('active');
    }

    if (typeof window.showMyEconomyView === 'function') {
      window.showMyEconomyView();
    } else if (typeof showMyEconomyView === 'function') {
      showMyEconomyView();
    }
    return;
  }

  if (mainView) mainView.style.display = 'none';
  if (myEconomyView) myEconomyView.style.display = 'none';
  if (rankView) rankView.style.display = 'block';

  document.getElementById('rank-title').innerText = title;

  document.querySelectorAll('.nav-item button').forEach(btn => btn.classList.remove('active'));
  if (navBtnId) {
    const btn = document.getElementById(navBtnId);
    if (btn) btn.classList.add('active');
  }

  const listEl = document.getElementById('rank-list');
  listEl.innerHTML = '';

  // 1. 탭별 데이터 소스, 점수 컬럼 키, 시계열 데이터 및 기준 총합 분기 설정 (군사력 로직 원복)
  let rawDataSource = mainData;
  let targetScoreKey = key;
  let targetSeriesData = [];
  let totalBaseVal = 0;

  if (key === '육군') {
    rawDataSource = globalTotalMilitaryData;
    targetScoreKey = '육군점수';
    targetSeriesData = globalArmyChangeData;
  } else if (key === '공군') {
    rawDataSource = globalTotalMilitaryData;
    targetScoreKey = '공군점수';
    targetSeriesData = globalAirChangeData;
  } else if (key === '해군') {
    rawDataSource = globalTotalMilitaryData;
    targetScoreKey = '해군점수';
    targetSeriesData = globalNavyChangeData;
  } else if (key === '군사력종합' || key === '종합군사력' || key === '총점수') {
    rawDataSource = globalTotalMilitaryData;
    targetScoreKey = '총점수';
    targetSeriesData = globalMilitaryChangeData;
  } else if (key === 'GDP(10억달러)' || key === 'GDP') {
    targetSeriesData = globalGdpData;
    totalBaseVal = worldTotals.gdp;
  } else if (key === '국방비(10억달러)' || key === '국방비') {
    targetSeriesData = globalDefData;
    totalBaseVal = worldTotals.def;
  } else if (key === '1인당GDP') {
    targetSeriesData = globalCapData;
  } else if (key === '인구(만명)' || key === '인구') {
    totalBaseVal = worldTotals.pop;
  }

  // 2. 현재 연도 기준 점수 리스트 생성
  let currentList = rawDataSource.map(item => {
    let rawCountry = extractCountryFromRow(item);
    let cleanedName = cleanName(rawCountry);

    if (cleanedName === '전세계') return null;

    let rawVal = item[targetScoreKey] !== undefined ? item[targetScoreKey] : item[key];
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '' || String(rawVal).trim() === 'N/A') {
      return null;
    }

    let numVal = parseFloat(String(rawVal).replace(/,/g, ''));
    if (isNaN(numVal) || numVal < 0) return null;

    if (key === 'GDP(10억달러)' || key === '국방비(10억달러)' || key === 'GDP' || key === '국방비') {
      numVal *= 10;
    }

    return { country: rawCountry, cleanKey: cleanedName, val: numVal };
  })
  .filter(item => item !== null && item.country !== '')
  .sort((a, b) => b.val - a.val || a.cleanKey.localeCompare(b.cleanKey));

  const prevRankMap = new Map();

  // 3. 전년도 순위 비교 맵 생성
  if (key !== '인구(만명)' && key !== '인구' && targetSeriesData && targetSeriesData.length > 0) {
    const yearKeys = getSortedYearKeys(targetSeriesData);

    const validYearKeys = yearKeys.filter(k => {
      const y = parseInt(k.replace(/[^\d]/g, ''), 10);
      return y <= currentSheetYear;
    });

    if (validYearKeys.length > 0) {
      const exactIdx = validYearKeys.findIndex(k => parseInt(k.replace(/[^\d]/g, ''), 10) === currentSheetYear);
      
      let prevYearKey = null;
      if (exactIdx > 0) {
        prevYearKey = validYearKeys[exactIdx - 1];
      } else if (exactIdx === -1 && validYearKeys.length >= 2) {
        prevYearKey = validYearKeys[validYearKeys.length - 2];
      } else if (validYearKeys.length >= 1) {
        prevYearKey = validYearKeys[0];
      }

      if (prevYearKey) {
        let prevList = targetSeriesData
          .map(item => {
            let rawCountry = extractCountryFromRow(item);
            let cleanedName = cleanName(rawCountry);

            if (cleanedName === '전세계') return null;

            let rawVal = item[prevYearKey];
            if ((rawVal === undefined || rawVal === null || String(rawVal).trim() === '') && targetScoreKey) {
              rawVal = item[targetScoreKey];
            }

            if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '' || String(rawVal).trim() === 'N/A') {
              return null;
            }

            let numVal = parseFloat(String(rawVal).replace(/,/g, ''));
            if (isNaN(numVal) || numVal < 0) return null;

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
      isWorld: false,
      isUnion: false
    };
  });

  // 주요 연합 깃발/로고 URL 맵
  const unionFlagMap = new Map([
    ['NATO', 'https://upload.wikimedia.org/wikipedia/commons/3/37/Flag_of_NATO.svg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original'],
    ['WTO', 'https://upload.wikimedia.org/wikipedia/commons/1/1b/Warsaw_Pact_Logo.svg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original'],
    ['EU', 'https://upload.wikimedia.org/wikipedia/commons/b/b7/Flag_of_Europe.svg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original'],
    ['CSTO', 'https://upload.wikimedia.org/wikipedia/commons/b/b8/Flag_of_the_Collective_Security_Treaty_Organization.svg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original'],
    ['SCO', 'https://upload.wikimedia.org/wikipedia/ko/7/7b/SCO.svg?utm_source=ko.wikipedia.org&utm_campaign=index&utm_content=original']
  ]);

  // === 💡 경제 부문(GDP, 국방비, 1인당 GDP)에서만 연합 데이터 집계 및 추가 ===
  const isGdpKey = (key === 'GDP(10억달러)' || key === 'GDP');
  const isDefKey = (key === '국방비(10억달러)' || key === '국방비');
  const isPerCapGdpKey = (key === '1인당GDP');

  if (isGdpKey || isDefKey || isPerCapGdpKey) {
    const unionTotals = new Map();

    mainData.forEach(item => {
      const rawUnionStr = String(item['소속연합'] || item['연합'] || '').trim();
      if (!rawUnionStr || rawUnionStr === '-' || rawUnionStr === 'N/A' || rawUnionStr === '무소속') return;

      const unions = rawUnionStr.split(',').map(u => u.trim()).filter(Boolean);

      const gdpVal = parseNumber(item['GDP'] || item['GDP(10억달러)']) * 10;
      const defVal = parseNumber(item['국방비'] || item['국방비(10억달러)']) * 10;
      const popVal = parseNumber(item['인구'] || item['인구(만명)']) * 10000;

      unions.forEach(unionName => {
        if (!unionTotals.has(unionName)) {
          unionTotals.set(unionName, { gdp: 0, def: 0, pop: 0 });
        }

        const uData = unionTotals.get(unionName);
        uData.gdp += gdpVal;
        uData.def += defVal;
        uData.pop += popVal;
      });
    });

    unionTotals.forEach((uData, unionName) => {
      let unionVal = 0;

      if (isGdpKey) {
        unionVal = uData.gdp;
      } else if (isDefKey) {
        unionVal = uData.def;
      } else if (isPerCapGdpKey) {
        unionVal = uData.pop > 0 ? (uData.gdp * 100000000) / uData.pop : 0;
      }

      if (unionVal > 0) {
        listData.push({
          country: `[연합] ${unionName}`,
          cleanKey: unionName,
          val: unionVal,
          currentRank: null,
          prevRank: null,
          isWorld: false,
          isUnion: true
        });
      }
    });

    listData.sort((a, b) => b.val - a.val || a.cleanKey.localeCompare(b.cleanKey));
  }

  if (key === '1인당GDP') {
    listData.push({
      country: '전세계',
      cleanKey: '전세계',
      val: worldTotals.cap,
      currentRank: null,
      prevRank: null,
      isWorld: true,
      isUnion: false
    });
    listData.sort((a, b) => b.val - a.val || a.cleanKey.localeCompare(b.cleanKey));
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
    } else if (unitType === '점수') {
      formattedVal = `${Math.round(item.val).toLocaleString()} 점`;
    }

    let rankDiffHtml = "";
    let rankDisplay = "";

    if (item.isWorld || item.isUnion) {
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
    if (item.isUnion) {
      const unionFlagUrl = unionFlagMap.get(item.cleanKey);
      if (unionFlagUrl) {
        flagHtml = `<img src="${unionFlagUrl}" class="rank-flag" alt="${item.cleanKey} 연합기" style="width: 22px; height: 15px; object-fit: contain; border-radius: 2px; margin-right: 2px; vertical-align: middle;">`;
      }
    } else {
      const flagUrl = flagMap.get(item.cleanKey);
      if (flagUrl && !item.isWorld) {
        flagHtml = `<img src="${flagUrl}" class="rank-flag" alt="${item.country} 국기" style="width: 22px; height: 15px; object-fit: cover; border-radius: 2px; margin-right: 2px; vertical-align: middle;">`;
      }
    }

    let percent = 0;
    if (unitType === '점수' || key === '1인당GDP' || totalBaseVal === 0) {
      percent = (item.val / maxValInList) * 100;
    } else {
      percent = (item.val / totalBaseVal) * 100;
    }
    percent = Math.min(Math.max(percent, 0), 100).toFixed(1);

    const li = document.createElement('li');
    li.className = `rank-item ${item.isWorld ? 'world-item' : ''} ${item.isUnion ? 'union-item' : ''}`;
    
    const countryClickableAttr = (item.isWorld || item.isUnion) ? '' : `onclick="openCountryModal('${item.cleanKey}')" style="cursor: pointer;"`;

    li.innerHTML = `
      <div class="rank-bar" style="width: ${percent}%; ${item.isUnion ? 'background: rgba(255, 193, 7, 0.12); border-right: 2px solid rgba(255, 193, 7, 0.5);' : ''}"></div>
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
    const powerEl = document.getElementById('modal-power');
    if (powerEl) powerEl.innerText = getPropByCleanKey(item, '강대국등급') || getPropByCleanKey(item, '강국등급') || '-';

    const rawGdp = (parseFloat(getPropByCleanKey(item, 'GDP(10억달러)') || getPropByCleanKey(item, 'GDP')) || 0) * 10;
    const gdpEl = document.getElementById('modal-gdp');
    if (gdpEl) gdpEl.innerText = formatMoney(rawGdp);
    const gdpRankEl = document.getElementById('modal-gdp-rank');
    if (gdpRankEl) gdpRankEl.innerText = getCountryRank('GDP', cleanKey);

    const rawDef = (parseFloat(getPropByCleanKey(item, '국방비(10억달러)') || getPropByCleanKey(item, '국방비')) || 0) * 10;
    const rawDefRatio = getPropByCleanKey(item, 'GDP대비국방비');
    
    let defRatioDisplay = "-";
    if (rawDefRatio !== undefined && rawDefRatio !== '' && !isNaN(parseFloat(rawDefRatio))) {
      let numRatio = parseFloat(rawDefRatio);
      defRatioDisplay = `${numRatio.toFixed(2)}%`; // ✔️ 공백 없이 붙이기
    } else if (rawGdp > 0) {
      defRatioDisplay = `${((rawDef / rawGdp) * 100).toFixed(2)}%`; // ✔️ 공백 없이 붙이기
    }
    
    const rawEquip = (parseFloat(getPropByCleanKey(item, '총장비구입비')) || 0) * 10;
    const rawequipRatio = getPropByCleanKey(item, '국방비대비장비구입비');
    let equipRatioDisplay = "-";
    if (rawequipRatio !== undefined && rawequipRatio !== '' && !isNaN(parseFloat(rawequipRatio))) {
      let numRatio = parseFloat(rawequipRatio);
      equipRatioDisplay = `${numRatio.toFixed(2)}%`;
    }
    

    const defRatioEl = document.getElementById('modal-def-ratio');
    if (defRatioEl) defRatioEl.innerText = defRatioDisplay;
    const defEl = document.getElementById('modal-def');
    if (defEl) defEl.innerText = formatMoney(rawDef);
    const defRankEl = document.getElementById('modal-def-rank');
    if (defRankEl) defRankEl.innerText = getCountryRank('국방비', cleanKey);

    const equipRatioEl = document.getElementById('modal-equip-ratio');
    if (equipRatioEl) equipRatioEl.innerText = equipRatioDisplay;
    const equipEl = document.getElementById('modal-equip-global');
    if (equipEl) equipEl.innerText = formatMoney(rawEquip);
    const equipRankEl = document.getElementById('modal-equip');
    if (equipRankEl) equipRankEl.innerText = formatMoney((parseFloat(getPropByCleanKey(item, '장비구입비')) || 0) * 10);

    const popEl = document.getElementById('modal-pop');
    if (popEl) popEl.innerText = formatPopulation(getPropByCleanKey(item, '인구(만명)') || getPropByCleanKey(item, '인구'));
    const popRankEl = document.getElementById('modal-pop-rank');
    if (popRankEl) popRankEl.innerText = getCountryRank('인구', cleanKey);

    const capVal = parseFloat(getPropByCleanKey(item, '1인당GDP')) || 0;
    const capEl = document.getElementById('modal-cap');
    if (capEl) capEl.innerText = `${Math.round(capVal).toLocaleString()} 달러`;
    const capRankEl = document.getElementById('modal-cap-rank');
    if (capRankEl) capRankEl.innerText = getCountryRank('1인당GDP', cleanKey);
    const EconomyGradeEl = document.getElementById('modal-EconomyGrade');
    if (EconomyGradeEl) EconomyGradeEl.innerText = getPropByCleanKey(item, '등급') || getPropByCleanKey(item, '경제등급') || '-';
    
    const taxVal = getPropByCleanKey(item, '세율');
    const taxEl = document.getElementById('modal-tax');
    if (taxEl) taxEl.innerText = taxVal !== undefined && taxVal !== '' ? `${taxVal}%` : '-';
    
    const rawBudgetVal = getPropByCleanKey(item, '국가예산');
    const rawBudget = (parseFloat(rawBudgetVal) || 0) * 10;
    const budgetEl = document.getElementById('modal-budget');
    if (budgetEl) budgetEl.innerText = rawBudget !== 0 ? formatMoney(rawBudget) : '-';

    // R&D 및 기술 정보 연동
    const rawRndRatio = getPropByCleanKey(item, 'GDP대비RD예산');
    const rndRatioEl = document.getElementById('modal-rnd-ratio');
    if (rndRatioEl) {
      if (rawRndRatio !== undefined && rawRndRatio !== '' && !isNaN(parseFloat(rawRndRatio))) {
        let numRatio = parseFloat(rawRndRatio);
        rndRatioEl.innerText = `${numRatio.toFixed(2)}%`;
      } else {
        rndRatioEl.innerText = '-';
      }
    }

    const rawRndBudget = parseFloat(getPropByCleanKey(item, 'RD예산')) || 0;
    const rndBudgetEl = document.getElementById('modal-rnd-budget');
    if (rndBudgetEl) {
      rndBudgetEl.innerText = rawRndBudget !== 0 ? formatMoney(rawRndBudget * 10) : '-';
    }

    const techLevelVal = getPropByCleanKey(item, '기술개발정도');
    const techLevelEl = document.getElementById('modal-tech-level');
    if (techLevelEl) {
      techLevelEl.innerText = techLevelVal !== undefined && techLevelVal !== '' ? `${techLevelVal}점` : '-';
    }

    const futureTechVal = getPropByCleanKey(item, '미래기술 적용') || getPropByCleanKey(item, '미래기술적용') || '-';
    const futureTechEl = document.getElementById('modal-future-tech');
    if (futureTechEl) {
      futureTechEl.innerText = `${futureTechVal} 장비사용가능`;
    }

    const systemEl = document.getElementById('modal-system');
    if (systemEl) systemEl.innerText = getPropByCleanKey(item, '경제체제') || '-';
    
    const mainIndustry = getPropByCleanKey(item, '주업') || '-';
    const industryEl = document.getElementById('modal-industry');
    if (industryEl) industryEl.innerText = mainIndustry;

    const welfareEl = document.getElementById('modal-welfare');
    const welfareE2 = document.getElementById('modal-welfare-budget');
    const welfare_budget = parseFloat(getPropByCleanKey(item, '복지지출비') || 0) * 10;
    if (welfareEl) welfareEl.innerText = getPropByCleanKey(item, '복지수준') || '-';
    if (welfareE2) welfareE2.innerText = formatMoney(welfare_budget) || '-';

    const rawTreasuryVal = getPropByCleanKey(item, '국고');
    const treasuryEl = document.getElementById('modal-treasury');
    if (treasuryEl) {
      if (rawTreasuryVal !== undefined && rawTreasuryVal !== '' && !isNaN(parseFloat(rawTreasuryVal))) {
        treasuryEl.innerText = formatMoney(rawTreasuryVal*10);
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
    const isLoggedIn = Boolean(currentUser && currentUser.country);
    const cleanUserCountry = isLoggedIn ? cleanName(currentUser.country) : '';
    const flagUrl = isLoggedIn ? (flagMap.get(cleanUserCountry) || '') : '';

    // PC 상단 영역
    const navMyCountry = document.getElementById('nav-my-country-item');
    const authNavArea = document.getElementById('auth-nav-area');
    const userProfileArea = document.getElementById('user-profile-area');
    const userFlag = document.getElementById('user-flag');
    const userFlagFallback = document.getElementById('user-flag-fallback');
    const dropdown = document.getElementById('user-profile-dropdown');

    if (dropdown) dropdown.style.display = 'none';

    if (navMyCountry) navMyCountry.style.display = isLoggedIn ? 'block' : 'none';
    if (authNavArea) authNavArea.style.display = isLoggedIn ? 'none' : 'block';
    if (userProfileArea) userProfileArea.style.display = isLoggedIn ? 'block' : 'none';

    if (userFlag && userFlagFallback) {
      if (isLoggedIn && flagUrl) {
        userFlag.src = flagUrl;
        userFlag.alt = `${currentUser.country} 국기`;
        userFlag.style.display = 'inline-block';
        userFlagFallback.style.display = 'none';
      } else {
        userFlag.style.display = 'none';
        userFlagFallback.style.display = isLoggedIn ? 'inline-flex' : 'none';
      }
    }

    // 모바일 우측 영역 및 드로어 동기화
    const mobileAuthArea = document.getElementById('mobile-auth-area');
    const mobileUserArea = document.getElementById('mobile-user-area');
    const mobileFlag = document.getElementById('mobile-user-flag');
    const mobileFlagFallback = document.getElementById('mobile-user-flag-fallback');
    const drawerMyCountryBtn = document.getElementById('drawer-my-country-btn');
    const drawerLogoutBtn = document.getElementById('drawer-logout-btn');

    if (mobileAuthArea) mobileAuthArea.style.display = isLoggedIn ? 'none' : 'block';
    if (mobileUserArea) mobileUserArea.style.display = isLoggedIn ? 'block' : 'none';
    if (drawerMyCountryBtn) drawerMyCountryBtn.style.display = isLoggedIn ? 'block' : 'none';
    if (drawerLogoutBtn) drawerLogoutBtn.style.display = isLoggedIn ? 'block' : 'none';

    if (mobileFlag && mobileFlagFallback) {
      if (isLoggedIn && flagUrl) {
        mobileFlag.src = flagUrl;
        mobileFlag.alt = `${currentUser.country} 국기`;
        mobileFlag.style.display = 'inline-block';
        mobileFlagFallback.style.display = 'none';
      } else {
        mobileFlag.style.display = 'none';
        mobileFlagFallback.style.display = isLoggedIn ? 'inline-flex' : 'none';
      }
    }
  }

  window.openMyCountryModal = function() {
    window.showMyEconomyView();
  };

  window.closeAuthModal = function() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = "none";
  };

  // 일반 회원가입
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

  // 일반 아이디/비밀번호 로그인
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
      currentUser = { username: result.username || id, email: id, country: result.country, authProvider: 'LOCAL' };
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

// 1. Google OAuth 토큰 디코딩 함수
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error("JWT Parsing Error:", err);
    return {};
  }
}

// 2. Apps Script 백엔드 연동 및 시트 DB 처리
async function processGoogleLogin(userData) {
  try {
    const userEmail = userData.email;
    if (!userEmail) {
      alert("유효한 구글 이메일이 아닙니다.");
      return;
    }

    const requestBody = {
      action: "googleLogin",
      email: userEmail
    };

    const response = await fetch(LOGIN_GAS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();

    if (result.success || result.result === "success") {
      const userCountry = result.country || "미정";
      
      currentUser = {
        username: result.username || userEmail,
        email: userEmail,
        country: userCountry,
        authProvider: "GOOGLE"
      };

      localStorage.setItem("nara_user", JSON.stringify(currentUser));
      
      // 신규 가입(국가: 미정) 여부에 따라 안내 문구 변경
      if (userCountry === "미정" || result.isNewUser) {
        alert(`[${currentUser.username}] 님, 회원가입이 완료되었습니다!\n국가를 지정하기 위해 관리자에게 이메일과 국가를 문의하십시오.`);
      } else {
        alert(`[${currentUser.username}] 님, 로그인되었습니다. (국가: ${currentUser.country})`);
      }
      
      if (typeof closeAuthModal === 'function') closeAuthModal();
      if (typeof updateAuthUI === 'function') updateAuthUI();
    } else {
      alert(result.message || "구글 로그인 처리에 실패했습니다.");
    }
  } catch (err) {
    console.error("❌ Google Login DB Error:", err);
    alert("로그인 데이터베이스 연결에 실패했습니다.");
  }
}

// 3. 구글 로그인 성공 콜백 함수
window.handleGoogleLogin = function(response) {
  //console.log("1. Google Login 버튼 응답 도착:", response);

  try {
    const responsePayload = parseJwt(response.credential);
    //console.log("2. 디코딩된 Google 토큰 Payload:", responsePayload);
    
    if (!responsePayload.email) {
      alert("구글 계정 이메일 정보를 불러올 수 없습니다.");
      return;
    }

    const googleUser = {
      email: responsePayload.email,
      name: responsePayload.name || "",
      picture: responsePayload.picture || "",
      authProvider: 'GOOGLE'
    };

    processGoogleLogin(googleUser);
  } catch (err) {
    console.error("❌ Google Token Processing Error:", err);
    alert("구글 로그인 처리 중 오류가 발생했습니다.");
  }
};

// 중복 초기화 방지 플래그
let isGoogleAuthInitialized = false;

// 4. 구글 로그인 버튼 렌더링 및 초기화
function initGoogleAuth() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    // 최초 1회만 initialize 수행
    if (!isGoogleAuthInitialized) {
      google.accounts.id.initialize({
        client_id: "455580188168-cc2ti6s0vv4rj3u8m4qpa4p6io727nv0.apps.googleusercontent.com",
        callback: window.handleGoogleLogin,
        auto_select: false,
        use_fedcm_for_prompt: false,
        context: "signin"
      });
      isGoogleAuthInitialized = true;
    }

    const btnContainer = document.getElementById("google-login-btn");
    if (btnContainer) {
      btnContainer.innerHTML = "";
      
      google.accounts.id.renderButton(btnContainer, {
        theme: "outline",
        size: "large",
        type: "standard",
        shape: "rectangular"
      });
    }
  } else {
    setTimeout(initGoogleAuth, 200);
  }
}

// 5. 페이지 로드 시 구글 로그인 초기화 실행
window.addEventListener('DOMContentLoaded', initGoogleAuth);
  
// ---------------- 자국 경제 관리 및 수정 뷰 ----------------

  window.showMyEconomyView = function() {
    if (!currentUser) {
      alert('로그인이 필요한 기능입니다.');
      window.windowShowLoginModal && window.windowShowLoginModal();
      return;
    }

    const myCountryName = currentUser.country || '';
    const cleanMyCountry = cleanName(myCountryName);

    const myObj = mainData.find(d => cleanName(d['국가명'] || d['국가']) === cleanMyCountry) || {};

    const gdpSorted = [...mainData].sort((a, b) => parseNumber(b['GDP'] || b['GDP(10억달러)']) - parseNumber(a['GDP'] || a['GDP(10억달러)']));
    const defSorted = [...mainData].sort((a, b) => parseNumber(b['국방비'] || b['국방비(10억달러)']) - parseNumber(a['국방비'] || a['국방비(10억달러)']));
    const popSorted = [...mainData].sort((a, b) => parseNumber(b['인구'] || b['인구(만명)']) - parseNumber(a['인구'] || a['인구(만명)']));
    const perGdpSorted = [...mainData].sort((a, b) => parseNumber(b['1인당GDP']) - parseNumber(a['1인당GDP']));

    const getRankStr = (arr) => {
      const idx = arr.findIndex(d => cleanName(d['국가명'] || d['국가']) === cleanMyCountry);
      return idx !== -1 ? `${idx + 1}위` : '-';
    };

    const flagUrl = flagMap.get(cleanMyCountry) || myObj['국기'] || myObj['국기링크'] || '';

    const flagImg = document.getElementById('my-country-flag');
    const titleEl = document.getElementById('my-country-title');
    if (flagImg) {
      flagImg.src = flagUrl;
      flagImg.style.display = flagUrl ? 'inline-block' : 'none';
    }
    if (titleEl) titleEl.innerText = myCountryName || '국가명 없음';

    const continentEl = document.getElementById('my-continent');
    const unionEl = document.getElementById('my-union');
    const powerE1 = document.getElementById('modal-power-grade');
    if (continentEl) continentEl.innerText = myObj['대륙'] || myObj['소속대륙'] || '-';
    if (unionEl) unionEl.innerText = myObj['소속연합'] || myObj['연합'] || '-';
    if (powerE1) powerE1.innerText = myObj['강대국등급'] || myObj['국가등급'] || '-';

    const gdpVal = parseNumber(myObj['GDP'] || myObj['GDP(10억달러)']);
    const gdpEl = document.getElementById('my-gdp-display');
    const gdpRankEl = document.getElementById('my-gdp-rank');
    if (gdpEl) gdpEl.innerText = formatMoney(gdpVal * 10);
    if (gdpRankEl) gdpRankEl.innerText = getRankStr(gdpSorted);

    const defRateInput = document.getElementById('edit-def-rate');
    const defValEl = document.getElementById('my-def-display');
    const defRankEl = document.getElementById('my-def-rank');
    if (defRateInput) defRateInput.value = parseFloat(myObj['GDP대비국방비'] || 0).toFixed(2);
    if (defValEl) defValEl.innerText = formatMoney(parseNumber(myObj['국방비'] || myObj['국방비(10억달러)']) * 10);
    if (defRankEl) defRankEl.innerText = getRankStr(defSorted);

    const equipRateInput = document.getElementById('edit-equip-rate');
    const equipValEl = document.getElementById('my-equip-display');
    const equipRankEl = document.getElementById('my-equip-rank');
    if (equipRateInput) equipRateInput.value = parseFloat(myObj['국방비대비장비구입비'] || 0).toFixed(2);
    if (equipValEl) equipValEl.innerText = formatMoney(parseNumber(myObj['총장비구입비']) * 10);
    if (equipRankEl) equipRankEl.innerText = formatMoney(parseNumber(myObj['장비구입비']) * 10);

    const popValEl = document.getElementById('my-pop-display');
    const popRankEl = document.getElementById('my-pop-rank');
    if (popValEl) popValEl.innerText = formatPopulation(parseNumber(myObj['인구'] || myObj['인구(만명)']));
    if (popRankEl) popRankEl.innerText = getRankStr(popSorted);

    const perGdpValEl = document.getElementById('my-per-gdp-display');
    const perGdpRankEl = document.getElementById('my-per-gdp-rank');
    const EconomyGradeE1 = document.getElementById('my-economy-grade');
    if (perGdpValEl) perGdpValEl.innerText = `${Math.round(parseNumber(myObj['1인당GDP'])).toLocaleString()} 달러`;
    if (perGdpRankEl) perGdpRankEl.innerText = getRankStr(perGdpSorted);
    if (EconomyGradeE1) EconomyGradeE1.innerText = myObj['등급'] || myObj['경제등급'] || '-';
    

    const taxRateInput = document.getElementById('edit-tax-rate');
    const budgetEl = document.getElementById('my-budget-display');
    if (taxRateInput) taxRateInput.value = parseFloat(myObj['세율'] || 0).toFixed(2);
    if (budgetEl) budgetEl.innerText = formatMoney(parseNumber(myObj['국가예산']) * 10);

    const rndRateInput = document.getElementById('edit-rnd-ratio');
    const rndgetEl = document.getElementById('my-rnd-budget-display');
    if (rndRateInput) rndRateInput.value = parseFloat(myObj['GDP대비RD예산'] || 0).toFixed(2);
    if (rndgetEl) rndgetEl.innerText = formatMoney(parseNumber(myObj['RD예산']) * 10);
    // 기술개발정도 및 미래기술적용 추가
    const techLevelEl = document.getElementById('my-tech-level-display');
    const futureTechEl = document.getElementById('my-future-tech-display');

    if (techLevelEl) {
      const techVal = myObj['기술개발정도'];
      techLevelEl.innerText = techVal !== undefined && techVal !== '' ? `${techVal}점` : '-';
    }

    if (futureTechEl) {
      const futureVal = myObj['미래기술 적용'] || myObj['미래기술적용'] || '-';
      futureTechEl.innerText = futureVal;
    }

    const systemSelect = document.getElementById('edit-economic-system');
    if (systemSelect) systemSelect.value = myObj['경제체제'] || '시장경제';

    const selectedJobs = (myObj['주업'] || '').split(/\s+/).filter(Boolean);

    document.querySelectorAll('input[name="industry"]').forEach(cb => {
      cb.checked = selectedJobs.includes(cb.value);
    });

    const welfareSelect = document.getElementById('edit-welfare');
    const welfareBudget = document.getElementById('welfare-budget-display')
    const investRateInput = document.getElementById('edit-invest-rate');
    if (welfareSelect) welfareSelect.value = myObj['복지수준'] || '복지없음';
    if (welfareBudget) welfareBudget.innerText = formatMoney(parseNumber(myObj['복지지출비(10억달러)'] || myObj['복지지출비'])*10);
    if (investRateInput) investRateInput.value = parseFloat(myObj['경제투자율'] || 0).toFixed(2);

    const treasuryEl = document.getElementById('my-treasury-display');
    const growthRateEl = document.getElementById('my-growth-rate-display');
    const profitE1 = document.getElementById('my-profit-display');
    const nextGDP = document.getElementById('my-nextGDP');
    if(profitE1) profitE1.innerText = formatMoney(parseNumber(myObj['최종순이익'] || myObj['순이익'])*10);
    if (treasuryEl) treasuryEl.innerText = formatMoney(parseNumber(myObj['국고'])*10);
    if (growthRateEl) growthRateEl.innerText = `${parseNumber(myObj['최종경제성장률'] || myObj['경제성장률']).toFixed(2)}%`;
    if (nextGDP) nextGDP.innerText = formatMoney(parseNumber(myObj['다음연도GDP'])*10);

    if (typeof loadMyInvestments === 'function') {
      loadMyInvestments();
    }
  };

  // 자국 경제 설정 저장
  window.saveMyEconomyData = async function() {
    if (!currentUser || !currentUser.country) {
      alert('로그인이 필요하거나 국가 정보가 없습니다.');
      return;
    }

    const defRate = parseFloat(document.getElementById('edit-def-rate')?.value || 0); // GDP대비국방비
    const taxRate = parseFloat(document.getElementById('edit-tax-rate')?.value || 0); // 세율
    const investRate = parseFloat(document.getElementById('edit-invest-rate')?.value || 0); // 경제투자율
    const equipRate = parseFloat(document.getElementById('edit-equip-rate')?.value || 0); // GDP대비 장비구입비
    const rndRate = parseFloat(document.getElementById('edit-rnd-ratio')?.value || 0); // GDP대비 R&D 예산 추가
    const economicSystem = document.getElementById('edit-economic-system')?.value || '';
    const welfare = document.getElementById('edit-welfare')?.value || '';

    const selectedJobs = [];
    document.querySelectorAll('input[name="industry"]:checked').forEach(cb => {
      selectedJobs.push(cb.value);
    });

    if (defRate < 0 || taxRate < 10 || investRate < 0 || equipRate <0 || rndRate <0) {
        alert('GDP대비국방비 혹은 세율(최소10%) 혹은 경제투자율 혹은 국방비대비장비구입비 혹은 GDP대비R&D예산 중 최소값 이하인 것이 있습니다.');
        return;
    }

    const payload = {
      action: 'updateMyEconomy',
      country: cleanName(currentUser.country),
      defRate: defRate,
      taxRate: taxRate,
      investRate: investRate,
      equipRate: equipRate,
      rndRate: rndRate, // payload에 추가
      economicSystem: economicSystem,
      welfare: welfare,
      mainJobs: selectedJobs.join(' ')
    };

    try {
      const response = await fetch(API_EDIT, { 
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.success || result.result === 'success') {
        alert('자국 경제 설정이 정상적으로 저장되었습니다. \n사이트에 반영하기까지 약간의 시간이 필요합니다.');

        setTimeout(() => {
          if (typeof showMyEconomyView === 'function') {
            showMyEconomyView();
          }
          if (typeof checkFirebaseChanges === 'function') {
            checkFirebaseChanges();
          }
          loadMainData();
        }, 3000);
      } else {
        alert('저장 실패: ' + (result.message || '알 수 없는 오류'));
      }
    } catch (err) {
      console.error('저장 중 오류 발생:', err);
      alert('저장 처리 도중 오류가 발생했습니다.');
    }
  };
  // 해외 경제 투자 목록 불러오기
  async function loadMyInvestments(retryCount = 0) {
    if (!currentUser || !currentUser.country) return;

    const tbody = document.getElementById('my-investment-list');
    if (!tbody) return;

    const maxRetries = 5;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">투자 내역을 불러오는 중... ${retryCount > 0 ? `(재시도 ${retryCount}/${maxRetries})` : ''}</td></tr>`;

    try {
      // 캐시 방지 타임스탬프 적용
      const cacheBusterUrl = `${API_OEI}?_t=${new Date().getTime()}`;
      const response = await fetch(cacheBusterUrl);
      
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const dataArr = await response.json();

      if (Array.isArray(dataArr)) {
        const userCountry = cleanName(currentUser.country);
        
        // 수정: 투자국이 내 국가이거나, 피투자국이 내 국가인 데이터 모두 필터링
        const myInvestments = dataArr.filter(item => 
          cleanName(item['투자국']) === userCountry || 
          cleanName(item['피투자국']) === userCountry
        );
        
        renderMyInvestments(myInvestments);
      } else {
        if (retryCount < maxRetries) {
          console.warn(`[해외투자] 불러오기 실패. 1.5초 후 재시도 (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => {
            loadMyInvestments(retryCount + 1);
          }, 1500);
        } else {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">투자 내역을 불러오지 못했습니다.</td></tr>';
        }
      }
    } catch (err) {
      console.error('해외투자 불러오기 오류:', err);
      if (retryCount < maxRetries) {
        setTimeout(() => {
          loadMyInvestments(retryCount + 1);
        }, 1500);
      } else {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
      }
    }
}

function renderMyInvestments(investments) {
    const tbody = document.getElementById('my-investment-list');
    if (!tbody) return;

    if (!investments || investments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">현재 해외 투자 내역이 없습니다.</td></tr>';
      return;
    }

    // 현재 로그인한 유저의 국가 정제
    const userCountry = currentUser ? cleanName(currentUser.country) : '';

    // JSON 한글 키 명칭 매핑
    tbody.innerHTML = investments.map(item => {
      const invCountry = item['투자국'] || '-';
      const targetCountry = item['피투자국'] || '-';
      
      // 피투자국이 내 국가인지 확인
      const isTargetMyCountry = userCountry && cleanName(targetCountry) === userCountry;

      // 1. 화면에 표시될 국가명 설정 (피투자국이 내 국가면 '투자국명 (투자국)', 아니면 기존 피투자국)
      const displayCountry = isTargetMyCountry ? `${invCountry} (투자국)` : targetCountry;

      // 2. 자신이 피투자국일 때는 삭제 버튼을 숨기거나 '-' 처리 (원하시면 비활성화 버튼으로 변경 가능)
      const actionButton = isTargetMyCountry 
        ? '-' 
        : `<button type="button" class="btn-delete" onclick="deleteInvestment('${targetCountry}')">삭제</button>`;

      const pGrade = item['피투자국 등급'] || '-';
      const amount = parseFloat(item['투자금액(10억달러)']) || 0;
      const profitStatus = item['수익여부'] || '-';
      const exchangeRate = item['환수율(%)'] !== undefined ? `${item['환수율(%)']}%` : '-';
      const growthRate = item['성장률(%p)'] !== undefined ? `${item['성장률(%p)']}%p` : '-';
      const profitGain = parseFloat(item['투자국의 차익금']) || 0;

      return `
        <tr>
          <td>${displayCountry}</td>
          <td>${pGrade}</td>
          <td>${formatMoney(amount * 10)}</td>
          <td>${profitStatus}</td>
          <td>${exchangeRate}</td>
          <td>${growthRate}</td>
          <td>${formatMoney(profitGain * 10)}</td>
          <td>${actionButton}</td>
        </tr>
      `;
    }).join('');
}
  async function submitInvestment() {
    if (!currentUser || !currentUser.country) {
      alert("로그인이 필요합니다.");
      return;
    }

    const targetCountry = document.getElementById("invest-target-country")?.value;
    const amount = parseFloat(document.getElementById("invest-amount")?.value || 0); //투자금액
    const profitStatus = document.getElementById("invest-return-option")?.value || "X";

    if (!targetCountry) {
      alert("피투자국을 선택해 주세요.");
      return;
    }
    if (amount <= 0 || isNaN(amount)) {
      alert("투자금을 0보다 큰 숫자로 입력해 주세요.");
      return;
    }

    const payload = {
      action: "saveInvestData",
      myCountry: currentUser.country,
      targetCountry: targetCountry,
      amount: amount,
      profitStatus: profitStatus
    };

    try {
      const response = await fetch(API_EDIT, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.result === "success" || result.success) {
        alert("해외투자 정보가 저장되었습니다. \n 사이트에 반영하기까지 약간의 시간이 필요합니다.");
        if (typeof closeInvestmentModal === "function") {
          closeInvestmentModal();
        }

        setTimeout(() => {
          if (typeof showMyEconomyView === "function") {
            showMyEconomyView();
          }
          if (typeof checkFirebaseChanges === "function") {
            checkFirebaseChanges();
          }
          if (typeof loadMainData === "function") {
            loadMainData();
          }
        }, 3000);
      } else {
        alert("저장 실패: " + (result.message || "오류가 발생했습니다."));
      }
    } catch (err) {
      console.error("해외투자 저장 오류:", err);
      alert("저장 처리 중 오류가 발생했습니다.");
    }
  }

  function openInvestmentModal() {
    const modal = document.getElementById("invest-modal");
    const selectTarget = document.getElementById("invest-target-country");
    
    if (!modal) return;

    if (selectTarget) {
      selectTarget.innerHTML = '<option value="">국가를 선택하세요</option>';
      
      const myCountry = (currentUser && currentUser.country) || window.myCountryName || "";
      const cleanMyCountry = cleanName(myCountry);

      if (Array.isArray(mainData) && mainData.length > 0) {
        mainData.forEach(item => {
          const rawCountryName = item.국가 || extractCountryFromRow(item);
          const cleanCName = cleanName(rawCountryName);

          if (rawCountryName && cleanCName !== '전세계' && cleanCName !== cleanMyCountry) {
            const opt = document.createElement("option");
            opt.value = rawCountryName;
            opt.textContent = rawCountryName;
            selectTarget.appendChild(opt);
          }
        });
      }
    }

    modal.style.display = "flex";
  }

  // 투자 모달 닫기 시 텍스트 초기화 (closeInvestmentModal 함수에 추가)
function closeInvestmentModal() {
  const modal = document.getElementById('invest-modal');
  if (modal) {
    modal.style.display = 'none';
    document.getElementById('invest-form').reset();
    const displayEl = document.getElementById('invest-converted-text');
    if (displayEl) displayEl.textContent = '';
  }
}

  function adjustValue(inputId, step, precision) {
    const input = document.getElementById(inputId);
    if (!input) return;
    let val = parseFloat(input.value) || 0;
    val += step;
    if (val < 0) val = 0;
    input.value = val.toFixed(precision);
    
    calculateInvestmentPreview();
  }

  function onInvestTargetChange(targetCountry) {
    calculateInvestmentPreview();
  }

  function calculateInvestmentPreview() {
    // 실시간 계산 박스 갱신 로직 위치
  }

  async function deleteInvestment(targetCountry) {
    const myCountry = currentUser.country || window.myCountryName || "";
    const cleanMyCountry = cleanName(myCountry);
    
    if (!cleanMyCountry) {
      alert("로그인 정보(자국명)를 찾을 수 없습니다.");
      return;
    }

    if (!confirm(`[${targetCountry}] 대상 해외투자 내역을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const payload = {
        action: "deleteInvestment",
        ownerCountry: cleanMyCountry,
        targetCountry: targetCountry
      };

      const response = await fetch(API_EDIT, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.result === "success") {
        alert("성공적으로 삭제되었습니다. \n 사이트에 반영하기까지 약간의 시간이 필요합니다.");
        checkFirebaseChanges();
        loadMainData();
      } else {
        alert("삭제 실패: " + result.message);
      }
    } catch (error) {
      console.error("해외투자 삭제 중 오류 발생:", error);
      alert("삭제 처리 중 오류가 발생했습니다.");
    }
  }

  // 전역 스코프 등록
  window.openInvestmentModal = openInvestmentModal;
  window.closeInvestmentModal = closeInvestmentModal;
  window.onInvestTargetChange = onInvestTargetChange;
  window.submitInvestment = submitInvestment;
  window.deleteInvestment = deleteInvestment;
  window.adjustValue = adjustValue;

  // 로그아웃 처리 함수
window.handleLogout = function() {
  if (confirm("로그아웃 하시겠습니까?")) {
    // 1. 저장된 사용자 정보 제거
    localStorage.removeItem('nara_user');
    currentUser = null;

    // 2. 알림창 및 UI 갱신
    alert("로그아웃 되었습니다.");
    updateAuthUI();

    // 3. 메인 화면으로 이동
    if (typeof window.showMainView === 'function') {
      window.showMainView();
    }
  }
};
  function initGoogleAuth() {
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.initialize({
      client_id: "455580188168-cc2ti6s0vv4rj3u8m4qpa4p6io727nv0.apps.googleusercontent.com", // 본인의 구글 클라이언트 ID
      callback: window.handleGoogleLogin // 콜백 함수 연결 확인
    });

    // 구글 로그인 버튼렌더링
    const btnContainer = document.getElementById("google-login-btn"); // 버튼이 들어갈 div ID
    if (btnContainer) {
      google.accounts.id.renderButton(btnContainer, {
        theme: "outline",
        size: "large"
      });
    }
  } else {
    // SDK가 아직 안 불러와졌으면 재시도
    setTimeout(initGoogleAuth, 100);
  }
}
  // 사용자가 다른 탭에 갔다 돌아오거나 탭이 다시 활성화될 때 최신 데이터 자동 로드
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      //console.log("🔄 탭 활성화: 최신 데이터를 불러옵니다.");
      if (typeof loadMainData === "function") {
        loadMainData();
      }
    }
  });
  // 기준표 모달 열기
async function openStandardModal() {
  const modal = document.getElementById('standard-modal');
  const tbody = document.getElementById('standard-table-body');
  const thead = document.getElementById('standard-table-head');
  
  if (thead) thead.innerHTML = ''; // 별도 헤더 영역 초기화

  try {
    const res = await fetch(`${FIREBASE_DB_URL}/nara_economy/standard.json`);
    const rows = await res.json(); // 2차원 배열 [[A1, B1, ...], [A2, B2, ...]]

    if (rows && rows.length > 0) {
      let html = '';
      
      // 1. 전체 행 중에서 실제 데이터가 들어있는 가장 오른쪽(마지막) 열의 인덱스를 계산
      let maxColIdx = 0;
      rows.forEach(row => {
        if (Array.isArray(row)) {
          for (let c = row.length - 1; c >= 0; c--) {
            if (row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '') {
              if (c > maxColIdx) maxColIdx = c;
              break;
            }
          }
        }
      });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;

        // 현재 행이 N-0(첫 번째 칸)에만 값이 있고 나머지 열이 비어있는지 확인
        const isTitleRow = String(row[0] || '').trim() !== '' && 
                           row.slice(1, maxColIdx + 1).every(cell => String(cell || '').trim() === '');
        
        // 다음 행(N+1)이 존재하고, 그 다음 행이 완전히 비어있는지 확인
        const nextRow = rows[i + 1];
        const isNextRowEmpty = nextRow && nextRow.slice(0, maxColIdx + 1).every(cell => String(cell || '').trim() === '');

        // 2. [가로 병합] N-0에만 글자가 있고 다음 행이 비어있는 경우 -> 두 행을 하나로 합병하여 섹션 제목(th 스타일)으로 처리
        if (isTitleRow && isNextRowEmpty) {
          const titleText = row[0];
          html += `<tr class="table-section-header">
                     <td colspan="${maxColIdx + 1}" style="font-weight: bold; background-color: rgba(0,0,0,0.06); padding: 10px; text-align: left; border: 1px solid #ddd;">${titleText}</td>
                   </tr>`;
          i++; // 빈 다음 행은 이미 합쳐서 처리했으므로 건너뜀
          continue;
        }

        // 3. 일반적인 빈 행인 경우 여백 처리
        const isEmptyRow = row.slice(0, maxColIdx + 1).every(cell => String(cell || '').trim() === '');
        if (isEmptyRow) {
          html += `<tr style="height: 12px;"><td colspan="${maxColIdx + 1}" style="border:none;"></td></tr>`;
          continue;
        }

        // 4. 일반 데이터 행 출력 (값이 존재하는 최대 열까지만 잘라서 렌더링)
        let colsHtml = '';
        for (let j = 0; j <= maxColIdx; j++) {
          const val = (row[j] !== null && row[j] !== undefined) ? row[j] : '';
          
          // 셀이 비어있지 않거나 기본 출력인 경우 <td> 생성
          colsHtml += `<td>${val}</td>`;
        }

        html += `<tr>${colsHtml}</tr>`;
      }

      tbody.innerHTML = html;
    } else {
      tbody.innerHTML = '<tr><td colspan="100%">기준표 데이터가 없습니다.</td></tr>';
    }
  } catch (err) {
    console.error('기준표 로드 실패:', err);
    tbody.innerHTML = '<tr><td colspan="100%">기준표 데이터를 불러오지 못했습니다.</td></tr>';
  }

  modal.style.display = 'block';
}
// 기준표 모달 닫기
function closeStandardModal() {
  document.getElementById('standard-modal').style.display = 'none';
}

window.openStandardModal = openStandardModal;
window.closeStandardModal = closeStandardModal;

  // 모달 열기 및 대상 국가 목록 채우기
function openRemittanceModal() {
  const modal = document.getElementById('remittance-modal');
  const selectEl = document.getElementById('remittance-target-country');
  
  if (!modal) return;

  if (selectEl) {
    selectEl.innerHTML = '<option value="">국가를 선택하세요</option>';
    
    const myCountry = (currentUser && currentUser.country) || window.myCountryName || "";
    const cleanMyCountry = cleanName(myCountry);

    if (Array.isArray(mainData) && mainData.length > 0) {
      mainData.forEach(item => {
        const rawCountryName = item.국가 || extractCountryFromRow(item);
        const cleanCName = cleanName(rawCountryName);

        if (rawCountryName && cleanCName !== '전세계' && cleanCName !== cleanMyCountry) {
          const opt = document.createElement("option");
          opt.value = rawCountryName;
          opt.textContent = rawCountryName;
          selectEl.appendChild(opt);
        }
      });
    }
  }

  modal.style.display = 'flex';
}

// API_EDIT으로 송금 요청 전송
async function submitRemittance() {
  const targetCountry = document.getElementById('remittance-target-country').value;
  const amount = parseFloat(document.getElementById('remittance-amount').value);
  const reason = document.getElementById('remittance-reason').value || "국고 송금";

  if (!currentUser || !currentUser.country) {
    alert("로그인이 필요합니다.");
    return;
  }

  if (!targetCountry || isNaN(amount) || amount <= 0) {
    alert("올바른 대상 국가와 금액을 입력해 주세요.");
    return;
  }

  const submitBtn = document.querySelector("#remittance-form button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const payload = {
      action: "remittance",
      fromCountry: currentUser.country,
      toCountry: targetCountry,
      amount: amount,
      reason: reason
    };

    const response = await fetch(API_EDIT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === "success" || result.result === "success") {
      alert(`${targetCountry}에게 ${amount} (10억 달러 단위) 송금이 완료되었습니다.`);
      closeRemittanceModal();
      
      if (typeof loadData === "function") loadData();
      checkFirebaseChanges();

      loadMainData();
    } else {
      alert("송금 실패: " + (result.message || "오류가 발생했습니다."));
    }
  } catch (error) {
    console.error("송금 요청 중 오류 발생:", error);
    alert("송금 처리 중 통신 오류가 발생했습니다.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
window.openRemittanceModal = openRemittanceModal;
window.closeRemittanceModal = closeRemittanceModal;
window.submitRemittance = submitRemittance;

function updateConvertedAmount(val) {
  const displayEl = document.getElementById('remittance-converted-text');
  if (!displayEl) return;

  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) {
    displayEl.textContent = '';
    return;
  }

  // 10억 달러 = 1,000,000,000
  const actualAmount = num * 1000000000;
  
  // 1 미만(0.1 ~ 0.9)일 때는 'X억 달러', 1 이상일 때는 'X억 달러 ($X,XXX,XXX,XXX)' 형식으로 표시
  let formattedText = '';
  const eok = Math.round(num * 10); // 0.1 -> 1억, 1 -> 10억
  
  if (eok < 10) {
    formattedText = `= 약 ${eok}억 달러 ($${actualAmount.toLocaleString()})`;
  } else {
    const cho = Math.floor(eok / 10000);
    const remainEok = eok % 10000;
    
    let koreanUnit = '';
    if (cho > 0) koreanUnit += `${cho}조 `;
    if (remainEok > 0) koreanUnit += `${remainEok}억 `;
    
    formattedText = `= 약 ${koreanUnit.trim()}달러 ($${actualAmount.toLocaleString()})`;
  }

  displayEl.textContent = formattedText;
}

// 모달을 닫을 때 텍스트도 함께 초기화하도록 closeRemittanceModal 함수에 추가
function closeRemittanceModal() {
  const modal = document.getElementById('remittance-modal');
  if (modal) {
    modal.style.display = 'none';
    document.getElementById('remittance-form').reset();
    const displayEl = document.getElementById('remittance-converted-text');
    if (displayEl) displayEl.textContent = '';
  }
}
  // 해외투자 모달 실시간 금액 환산 함수
function updateInvestConvertedAmount(val) {
  const displayEl = document.getElementById('invest-converted-text');
  if (!displayEl) return;

  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) {
    displayEl.textContent = '';
    return;
  }

  // 10억 달러 = 1,000,000,000
  const actualAmount = num * 1000000000;
  const eok = Math.round(num * 10); // 0.1 -> 1억, 1 -> 10억
  
  let formattedText = '';
  if (eok < 10) {
    formattedText = `= 약 ${eok}억 달러 ($${actualAmount.toLocaleString()})`;
  } else {
    const cho = Math.floor(eok / 10000);
    const remainEok = eok % 10000;
    
    let koreanUnit = '';
    if (cho > 0) koreanUnit += `${cho}조 `;
    if (remainEok > 0) koreanUnit += `${remainEok}억 `;
    
    formattedText = `= 약 ${koreanUnit.trim()}달러 ($${actualAmount.toLocaleString()})`;
  }

  displayEl.textContent = formattedText;
}

window.updateInvestConvertedAmount = updateInvestConvertedAmount;
window.updateConvertedAmount = updateConvertedAmount;

 // 패치노트 데이터를 보관할 변수
let changelogData = null;

// 패치노트 모달 열기
async function openChangelogModal() {
  const modal = document.getElementById('changelog-modal');
  if (modal) modal.style.display = 'flex';

  // 아직 데이터를 가져온 적이 없다면 fetch로 불러오기
  if (!changelogData) {
    await loadChangelog();
  }
}

// 패치노트 모달 닫기
function closeChangelogModal() {
  const modal = document.getElementById('changelog-modal');
  if (modal) modal.style.display = 'none';
}
window.loadChangelog = loadChangelog;
// JSON 파일 읽어서 화면에 뿌려주는 함수
// 패치노트를 불러오는 함수 (탭 구분 기능 추가)
async function loadChangelog(type = 'economy') {
  const container = document.getElementById('changelog-list');
  if (!container) return;

  // 불러올 JSON 파일 결정 ('economy' 또는 'website')
  const filename = type === 'website' ? 'web-changelog.json' : 'changelog.json';
  
  // 버튼 활성화 상태 스타일 업데이트 (버튼 ID가 각각 btn-economy, btn-website 라고 가정)
  const btnEconomy = document.getElementById('btn-economy');
  const btnWebsite = document.getElementById('btn-website');
  
  if (btnEconomy && btnWebsite) {
    if (type === 'website') {
      btnWebsite.style.background = '#007bff';
      btnWebsite.style.color = '#fff';
      btnEconomy.style.background = '#f8f9fa';
      btnEconomy.style.color = '#333';
    } else {
      btnEconomy.style.background = '#007bff';
      btnEconomy.style.color = '#fff';
      btnWebsite.style.background = '#f8f9fa';
      btnWebsite.style.color = '#333';
    }
  }

  container.innerHTML = '<p style="text-align: center; color: #666;">불러오는 중...</p>';

  try {
    const response = await fetch(filename);
    if (!response.ok) throw new Error('패치노트를 불러오는데 실패했습니다.');
    
    const changelogData = await response.json();

    let html = '';
    changelogData.forEach((item, index) => {
      // 가장 최근 패치노트(첫 번째 항목)만 기본으로 열어두기
      const isOpen = index === 0 ? 'open' : '';

      html += `
        <details class="changelog-item" ${isOpen} style="margin-bottom: 12px; border: 1px solid #e1e4e8; border-radius: 6px; padding: 10px 14px; background: #fff;">
          <summary style="font-weight: bold; font-size: 15px; color: var(--primary-color, #007bff); cursor: pointer; user-select: none; outline: none;">
            <span style="font-size: 15px;">${item.version} - ${item.title}</span>
          </summary>
          
          <div class="changelog-body" style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ddd;">
      `;

      // sections 배열 순회 (리스트 및 표 렌더링)
      if (item.sections && Array.isArray(item.sections)) {
        item.sections.forEach(sec => {
          
          // 1. 일반 리스트(불릿 포인트)
          if (sec.type === 'list' && sec.content && sec.content.length > 0) {
            html += `
              <ul style="margin: 8px 0 12px 0; padding-left: 20px; line-height: 1.6; font-size: 14px; color: #333;">
                ${sec.content.map(text => `<li>${text}</li>`).join('')}
              </ul>
            `;
          }
          
          // 2. 표 형태
          else if (sec.type === 'table' && sec.rows && sec.rows.length > 0) {
            const headers = sec.headers || ['항목', '기존 사항', '변경 사항'];
            html += `
              <table style="width: 100%; border-collapse: collapse; margin: 10px 0 15px 0; font-size: 13px; text-align: left;">
                <thead>
                  <tr style="background-color: #f8f9fa;">
                    ${headers.map(h => `<th style="border: 1px solid #333; padding: 8px; font-weight: bold;">${h}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${sec.rows.map(row => `
                    <tr>
                      ${row.map(cell => `<td style="border: 1px solid #333; padding: 8px; vertical-align: top;">${cell}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;
          }

        });
      }

      html += `
          </div>
        </details>
      `;
    });

    container.innerHTML = html;

  } catch (error) {
    console.error(error);
    container.innerHTML = '<p style="color: red; text-align: center;">패치노트 데이터를 불러올 수 없습니다.</p>';
  }
}

// 모든 모달 외부(배경) 클릭 시 닫기
window.addEventListener('click', function(event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.style.display = 'none';
  }
});
window.openChangelogModal = openChangelogModal;
window.closeChangelogModal = closeChangelogModal;

// 페이지 내 모든 요소(HTML, CSS 등)가 완료되었을 때 실행
window.addEventListener('load', () => {
  checkNoticeModal();
});

// 안내문 모달 표시 여부 확인
function checkNoticeModal() {
  const hideUntil = localStorage.getItem('hideNoticeUntil');
  const now = new Date().getTime();

  // 저장된 숨김 기한이 없거나 기한이 지난 경우에만 표시
  if (!hideUntil || now > parseInt(hideUntil)) {
    const noticeModal = document.getElementById('notice-modal');
    if (noticeModal) {
      noticeModal.style.display = 'flex'; // 안 뜨는 현상 방지를 위해 직접 flex 지정
    }
  }
}

// 안내문 모달 닫기
function closeNoticeModal() {
  const dontShowToday = document.getElementById('dont-show-today');
  
  if (dontShowToday && dontShowToday.checked) {
    // 24시간 후의 타임스탬프 계산 후 저장
    const expires = new Date().getTime() + (24 * 60 * 60 * 1000);
    localStorage.setItem('hideNoticeUntil', expires);
  }

  const noticeModal = document.getElementById('notice-modal');
  if (noticeModal) {
    noticeModal.style.display = 'none';
  }
}

// 전역 함수 등록
window.checkNoticeModal = checkNoticeModal;
window.closeNoticeModal = closeNoticeModal;

// 구글 앱스스크립트 배포 URL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbx3QQutdUCyAOHnn10W_xXKCFj9KPVrNOJ3V2RKyPvNbc3bfpylRvzuLwRsjGl2a1szcw/exec";

// JSON 데이터 저장 및 선택 변수
let equipmentList = [];
let importLogsList = [];
let SelectEquipmentIndex = null; // 오타 수정 및 전역 초기화

// ==========================================
// 1. JSON 데이터 불러오기 (GET)
// ==========================================

// 페이지 로드 시 JSON 데이터 불러오기 ("DOMContentLoaded" 이벤트로 오타 수정)
document.addEventListener("DOMContentLoaded", () => {
  loadEquipmentData();
  loadImportLogsData();
});

// 1. 장비 데이터 불러오기 함수
async function loadEquipmentData() {
  try {
    // 파이어베이스 Realtime Database 경로 지정
    const response = await fetch(`${FIREBASE_DB_URL}/nara_military/equipment.json?_t=${Date.now()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP 에러! 상태 코드: ${response.status}`);
    }

    const data = await response.json();
    equipmentList = Array.isArray(data) ? data : [];
    
    populateEquipmentDropdown();
  } catch (error) {
    console.error("장비 데이터를 불러오는 중 오류 발생:", error);
  }
}

// 수출입 로그 불러오기
async function loadImportLogsData() {
  try {
    // 파이어베이스 Realtime Database 경로 지정
    const response = await fetch(`${FIREBASE_DB_URL}/nara_military/export_import_log.json?_t=${Date.now()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP 에러! 상태 코드: ${response.status}`);
    }

    const data = await response.json();
    importLogsList = Array.isArray(data) ? data : [];
    renderImportLogsTable();
    
  } catch (error) {
    console.error("수출입 로그를 불러오는 중 오류 발생:", error);
  }
}
// ==========================================
// 2. UI 동적 연동 (드롭다운 & 표 렌더링)
// ==========================================

// Helper: 사용자 자국명 가져오기
function getMyCountry() {
  const rawCountry = (typeof currentUser !== "undefined" && currentUser.country) || window.myCountryName || "";
  return typeof cleanName === "function" ? cleanName(rawCountry) : rawCountry.trim();
}

// 2. 모달 드롭다운 채우기 함수
function populateEquipmentDropdown() {
  const selectEl = document.getElementById("importEquipmentSelect");
  if (!selectEl) return;

  selectEl.innerHTML = '<option value="">-- 장비를 선택하세요 --</option>';

  if (!equipmentList || equipmentList.length === 0) return;

  const myCountry = getMyCountry(); // 자국명 가져오기

  equipmentList.forEach((item, index) => {
    const exporter = item["수출국"] || item.exporter || item.producer || "미지정";
    const name = item["장비이름"] || item.name || "미지정";
    const category = item["장비유형"] || item.category || "";
    const rawPrice = item["1대당 가격"] || item["1대당가격"] || item.price || 0;
    const price = Number(rawPrice);

    // 1만 이상이면 억 단위로 환산, 미만이면 만$ 유지
    const formattedPrice = price >= 10000 
      ? (price / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '억$' 
      : price.toLocaleString('en-US') + '만$';

    const option = document.createElement("option");
    option.value = index; // 원본 인덱스 유지
    option.textContent = `[${exporter}] ${name} (${category}) - ${formattedPrice}`;
    selectEl.appendChild(option);
  });
}

// 드롭다운 선택 시 필드 자동 채우기
function onSelectEquipment(index) {
  if (index === "" || index === null || index === undefined || !equipmentList[index]) {
    SelectEquipmentIndex = null;
    if (document.getElementById("importExporter")) document.getElementById("importExporter").value = "";
    if (document.getElementById("importCategory")) document.getElementById("importCategory").value = "";
    if (document.getElementById("importUnitPrice")) document.getElementById("importUnitPrice").value = "";
    if (document.getElementById("importTotalPrice")) document.getElementById("importTotalPrice").value = "";
    return;
  }

  SelectEquipmentIndex = index;
  const selected = equipmentList[index];
  const exporter = selected["수출국"] || selected.exporter || selected.producer || "";
  const category = selected["장비유형"] || selected.category || "";
  const price = parseFloat(selected["1대당 가격"] || selected["1대당가격"] || selected.price || 0);

  if (document.getElementById("importExporter")) document.getElementById("importExporter").value = exporter;
  if (document.getElementById("importCategory")) document.getElementById("importCategory").value = category;
  if (document.getElementById("importUnitPrice")) document.getElementById("importUnitPrice").value = price;
  
  calculateTotalPrice();
}

// 수량 변경 시 총 금액 자동 계산
function calculateTotalPrice() {
  const priceEl = document.getElementById("importUnitPrice");
  const qtyEl = document.getElementById("importQuantity");
  const totalEl = document.getElementById("importTotalPrice");

  if (!priceEl || !qtyEl || !totalEl) return;

  const price = parseFloat(priceEl.value) || 0;
  const quantity = parseInt(qtyEl.value, 10) || 0;
  
  totalEl.value = price * quantity;
}

// 수출입 로그 테이블 렌더링
// 수출입 로그 테이블 렌더링
function renderImportLogsTable() {
  const tbody = document.getElementById("import-logs-tbody") || document.getElementById("log-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  const myCountry = getMyCountry();

  if (!importLogsList || importLogsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">기록된 수출입 내역이 없습니다.</td></tr>';
    return;
  }

  const myLogs = importLogsList.filter((log) => {
    const importer = log["수입국"] || log.importer || "";
    const exporter = log["수출국"] || log.exporter || "";
    
    const cleanImp = typeof cleanName === "function" ? cleanName(importer) : importer.trim();
    const cleanExp = typeof cleanName === "function" ? cleanName(exporter) : exporter.trim();

    return myCountry && (cleanImp === myCountry || cleanExp === myCountry);
  });

  if (myLogs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">자국 관련 수출입 내역이 없습니다.</td></tr>';
    return;
  }

  myLogs.forEach((log) => {
    const tr = document.createElement("tr");
    
    const date = log["일시"] || log.timestamp || log.date || "-";
    const importer = log["수입국"] || log.importer || "-";
    const exporter = log["수출국"] || log.exporter || "-";
    const name = log["장비이름"] || log.name || "-";
    const category = log["장비유형"] || log.category || "-";
    const quantity = parseInt(log["수량"] || log.quantity || 1, 10);
    const rawTotalPrice = parseFloat(log["총 금액"] || log["총금액"] || log.totalPrice || 0);
    const totalPrice = Number(rawTotalPrice);
    const status = log["상태"] || "승인 대기";

    // 1만 이상이면 억 단위로 환산, 미만이면 만$ 유지
    const formattedTotalPrice = totalPrice >= 10000 
      ? (totalPrice / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '억$' 
      : totalPrice.toLocaleString('en-US') + '만$';

    const cleanExp = typeof cleanName === "function" ? cleanName(exporter) : exporter.trim();

    // 상태 뱃지 및 버튼 제어 (버튼 클릭 시 quantity, totalPrice 전달 추가)
    let statusHtml = "";
    if (status === "승인 완료") {
      statusHtml = '<span style="color: #28a745; font-weight: bold;">승인 완료</span>';
    } else if (status === "거절됨") {
      statusHtml = '<span style="color: #dc3545; font-weight: bold;">거절됨</span>';
    } else {
      if (cleanExp === myCountry) {
        statusHtml = `
          <button onclick="handleExportApprove('${date}', '${exporter}', '${importer}', '${name}', '승인 완료', ${quantity}, ${totalPrice})" style="background-color: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 4px;">승인</button>
          <button onclick="handleExportApprove('${date}', '${exporter}', '${importer}', '${name}', '거절됨', ${quantity}, ${totalPrice})" style="background-color: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">거절</button>
        `;
      } else {
        statusHtml = '<span style="color: #ffc107; font-weight: bold;">수출 허가 대기중</span>';
      }
    }

    tr.innerHTML = `
      <td>${date}</td>
      <td><strong>${importer}</strong></td>
      <td>${exporter}</td>
      <td>${name}</td>
      <td>${category}</td>
      <td>${quantity}</td>
      <td>${formattedTotalPrice}</td>
      <td>${statusHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 수출 승인/거절 요청 처리 함수
async function handleExportApprove(timestamp, exporter, importer, name, status, quantity = 1, totalPrice = 0) {
  const actionText = status === "승인 완료" ? "승인" : "거절";
  if (!confirm(`[${importer}]의 ${name} 수입 요청을 ${actionText}하시겠습니까?`)) {
    return;
  }

  const payload = {
    action: "approveImportLog",
    timestamp: timestamp,
    exporter: exporter,
    importer: importer,
    name: name,
    status: status
  };

  try {
    const targetApiUrl = GAS_API_URL;

    // 1. 승인/거절 상태(Log) 업데이트 요청
    const response = await fetch(targetApiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.result === "success" || result.status === "success") {
      
      // 2. '승인 완료' 시 거래 금액을 메인 경제 시트에 반영 (updateEquipmentTrade)
      if (status === "승인 완료") {
        // 단가 및 총금액 계산 (기본 단위: 만달러)
        let finalAmount = Number(totalPrice);
        if (finalAmount <= 0) {
          const eqInfo = (equipmentList || []).find(e => (e["장비이름"] || e.name) === name);
          const unitPrice = eqInfo ? Number(eqInfo["1대당 가격"] || eqInfo["1대당가격"] || eqInfo.price || 0) : 0;
          finalAmount = unitPrice * Number(quantity);
        }

        if (finalAmount > 0) {
          // 만달러 단위를 메인 경제 시트 단위(10억달러)로 변환 (만달러 / 100,000)
          const amountInBillion = finalAmount / 100000;

          try {
            const tradePayload = {
              action: "updateEquipmentTrade",
              importer: importer,
              exporter: exporter,
              amount: amountInBillion
            };

            await fetch(API_EDIT, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify(tradePayload)
            });
          } catch (tradeError) {
            console.error("장비 거래 금액 반영 중 오류 발생:", tradeError);
          }
        }
      }

      alert(`수출 허가가 성공적으로 [${status}] 처리되었습니다.`);
      closeLogModal();
      if (typeof loadImportLogsData === "function") loadImportLogsData();
      if (typeof loadMainData === "function") loadMainData();
      checkFirebaseChanges();
      loadMainData();
    } else {
      alert("처리 실패: " + (result.message || "알 수 없는 오류"));
    }
  } catch (error) {
    console.error("수출 허가 처리 오류:", error);
    alert("서버 통신 중 오류가 발생했습니다.");
  }
}

// ==========================================
// 3. 모달 제어 및 이벤트 처리
// ==========================================

function openEquipmentModal() {
  const myCountry = getMyCountry();
  
  if (!myCountry) {
    alert("로그인 정보(자국명)를 찾을 수 없습니다.");
    return;
  }

  const exporterInput = document.getElementById("eq-exporter");
  if (exporterInput) {
    exporterInput.value = myCountry;
  }

  const modal = document.getElementById("equipment-modal");
  if (modal) modal.style.display = "flex";
}

function closeEquipmentModal() {
  const modal = document.getElementById("equipment-modal");
  if (modal) modal.style.display = "none";
}

function openImportModal() {
  if (!equipmentList || equipmentList.length === 0) {
    loadEquipmentData();
  } else {
    populateEquipmentDropdown();
  }

  const countryInput = document.getElementById("importCountry") || document.getElementById("imp-importer");
  if (countryInput) {
    countryInput.value = typeof getMyCountry === "function" ? getMyCountry() : "";
  }

  const modal = document.getElementById("importEquipmentModal") || document.getElementById("import-modal");
  if (modal) {
    modal.style.display = "flex";
  }
}

function closeImportModal() {
  const importForm = document.getElementById("import-form") || document.getElementById("imp-form");
  if (importForm) {
    importForm.reset();
  }

  SelectEquipmentIndex = null;

  const fieldsToReset = [
    "importCountry",
    "importExporter",
    "importCategory",
    "importUnitPrice",
    "importTotalPrice"
  ];

  fieldsToReset.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const modal = document.getElementById("importEquipmentModal") || document.getElementById("import-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

function openLogModal() {
  loadImportLogsData();
  const modal = document.getElementById("log-modal");
  if (modal) modal.style.display = "flex";
}

function closeLogModal() {
  const modal = document.getElementById("log-modal");
  if (modal) modal.style.display = "none";
}

// ------------------------------------------
// 장비 등록 폼 Submit 처리
// ------------------------------------------
const equipmentForm = document.getElementById("equipment-form");
if (equipmentForm) {
  equipmentForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    if(parseFloat(document.getElementById("eq-price").value) <0){
      alert('대당 달러가 0달러 미만입니다. 이상으로 올려주세요');
    }

    const payload = {
      action: "addEquipment",
      exporter: document.getElementById("eq-exporter").value,
      name: document.getElementById("eq-name").value,
      category: document.getElementById("eq-category").value,
      price: parseFloat(document.getElementById("eq-price").value)
    };

    try {
      const response = await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.result === "success" || result.status === "success") {
        alert("장비가 성공적으로 등록되었습니다!");
        equipmentForm.reset();
        closeEquipmentModal();
        checkFirebaseChanges();
        loadMainData();
        if (typeof loadEquipmentData === "function") loadEquipmentData();
      } else {
        alert("장비 등록 실패: " + (result.message || "알 수 없는 오류"));
      }
    } catch (error) {
      console.error("장비 등록 처리 중 오류 발생:", error);
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  });
}

// ------------------------------------------
// 수입 신청 폼 Submit 처리
// ------------------------------------------
const importForm = document.getElementById("import-form");
if (importForm) {
  importForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const myCountry = getMyCountry();
    if (!myCountry) {
      alert("로그인 정보(자국명)를 찾을 수 없습니다.");
      return;
    }

    if (SelectEquipmentIndex === null || !equipmentList[SelectEquipmentIndex]) {
      alert("수입할 장비를 먼저 선택해주세요.");
      return;
    }

    const selectedItem = equipmentList[SelectEquipmentIndex];
    const selectedName = selectedItem["장비이름"] || selectedItem.name;
    const exporterValue = document.getElementById("importExporter").value;
    const quantityVal = parseInt(document.getElementById("importQuantity").value, 10);
    const unitPriceVal = parseFloat(document.getElementById("importUnitPrice").value);
    const totalPriceVal = parseFloat(document.getElementById("importTotalPrice").value);
    const categoryVal = document.getElementById("importCategory").value;

    // 수출국과 수입국이 같은지 확인 (자국 구매 여부)
    const isSelfImport = (exporterValue === myCountry);

    const payload = {
      action: isSelfImport ? "selfImportLog" : "importLog",
      exporter: exporterValue,
      name: selectedName,
      category: categoryVal,
      price: unitPriceVal,
      quantity: quantityVal,
      totalPrice: totalPriceVal,
      importer: myCountry
    };

    try {
      const response = await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.result === "success" || result.status === "success") {
        if (isSelfImport) {
          alert("자국 장비 구매가 성공적으로 완료되었습니다!");
        } else {
          alert("수입 기록이 성공적으로 제출되었습니다!\n사이트에 반영되기까지 약간의 시간이 필요합니다.");
        }
        
        closeImportModal();
        if (typeof loadImportLogsData === "function") loadImportLogsData();
        if (typeof loadMainData === "function") loadMainData();
        checkFirebaseChanges();
        loadMainData();
      } else {
        alert("처리 실패: " + (result.message || "알 수 없는 오류"));
      }
    } catch (error) {
      console.error("수입 신청 처리 중 오류 발생:", error);
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  });
}

// 검색어에 맞게 드롭다운 옵션 필터링
function filterEquipmentOptions(keyword) {
  const selectEl = document.getElementById("importEquipmentSelect");
  if (!selectEl || !equipmentList) return;

  const cleanKeyword = keyword.toLowerCase().trim();
  selectEl.innerHTML = '<option value="">-- 장비를 선택하세요 --</option>';

  // 현재 사용자 자국명 가져오기
  const myCountry = typeof getMyCountry === "function" ? getMyCountry() : "";

  equipmentList.forEach((item, index) => {
    const exporter = item["수출국"] || item.exporter || item.producer || "";
    const name = item["장비이름"] || item.name || "";
    const category = item["장비유형"] || item.category || "";
    const rawPrice = item["1대당 가격"] || item["1대당가격"] || item.price || 0;
    const price = Number(rawPrice);

    // 1만 이상이면 억 단위로 환산, 미만이면 만$ 유지
    const formattedPrice = price >= 10000 
      ? (price / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '억$' 
      : price.toLocaleString('en-US') + '만$';

    const fullText = `[${exporter}] ${name} (${category})`.toLowerCase();

    if (fullText.includes(cleanKeyword)) {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = `[${exporter}] ${name} (${category}) - ${formattedPrice}`;
      selectEl.appendChild(option);
    }
  });
}
// ==========================================
// 4. 내 장비 목록 관리 모달 기능
// ==========================================

// 내 장비 목록 모달 열기
function openMyEquipmentModal() {
  const myCountry = getMyCountry();

  if (!myCountry) {
    alert("로그인 정보(자국명)를 찾을 수 없습니다.");
    return;
  }

  // 데이터가 없으면 다시 불러오기
  if (!equipmentList || equipmentList.length === 0) {
    loadEquipmentData().then(() => {
      renderMyEquipmentTable();
    });
  } else {
    renderMyEquipmentTable();
  }

  const modal = document.getElementById("my-equipment-modal");
  if (modal) {
    modal.style.display = "flex";
  }
}

// 내 장비 목록 모달 닫기
function closeMyEquipmentModal() {
  const modal = document.getElementById("my-equipment-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

// 자국 장비 데이터 표 렌더링
function renderMyEquipmentTable() {
  const tbody = document.getElementById("my-equipment-list-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  const myCountry = getMyCountry();

  // 내 국가 데이터 필터링
  const myEquipments = (equipmentList || []).filter((eq) => {
    const exporter = eq["수출국"] || eq.exporter || eq.producer || "";
    const cleanExporter = typeof cleanName === "function" ? cleanName(exporter) : exporter.trim();
    return myCountry && cleanExporter === myCountry;
  });

  if (myEquipments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px;">등록된 자국 장비가 없습니다.</td></tr>';
    return;
  }

  myEquipments.forEach((item) => {
    const name = item["장비이름"] || item.name || "미지정";
    const category = item["장비유형"] || item.category || "-";
    const price = item["1대당 가격"] || item["1대당가격"] || item.price || 0;

    // 1만 이상이면 억 단위로 환산, 미만이면 만$ 유지
    const formattedPrice = price >= 10000 
      ? (price / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '억$' 
      : price.toLocaleString('en-US') + '만$';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>${name}</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${category}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formattedPrice}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">
        <button onclick="deleteMyEquipment('${name}')" style="background-color: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 장비 삭제 요청
async function deleteMyEquipment(name) {
  const myCountry = getMyCountry();

  if (!confirm(`정말로 [${name}] 장비를 삭제하시겠습니까?`)) {
    return;
  }

  const payload = {
    action: "deleteEquipment",
    exporter: myCountry,
    name: name
  };

  try {
    const response = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.result === "success" || result.status === "success") {
      alert("장비가 성공적으로 삭제되었습니다.");
      if (typeof loadEquipmentData === "function") {
        await loadEquipmentData();
        renderMyEquipmentTable();
        checkFirebaseChanges();
        loadMainData();
      }
    } else {
      alert("삭제 실패: " + (result.message || "알 수 없는 오류"));
    }
  } catch (error) {
    console.error("장비 삭제 처리 중 오류 발생:", error);
    alert("서버 통신 중 오류가 발생했습니다.");
  }
}

// 전역 window 객체 바인딩 추가
window.openMyEquipmentModal = openMyEquipmentModal;
window.closeMyEquipmentModal = closeMyEquipmentModal;
window.renderMyEquipmentTable = renderMyEquipmentTable;
window.deleteMyEquipment = deleteMyEquipment;


// 전역 window 객체에 함수 바인딩
window.onSelectEquipment = onSelectEquipment;
window.calculateTotalPrice = calculateTotalPrice;
window.handleExportApprove = handleExportApprove;
window.openEquipmentModal = openEquipmentModal;
window.closeEquipmentModal = closeEquipmentModal;
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.openLogModal = openLogModal;
window.closeLogModal = closeLogModal;
window.loadEquipmentData = loadEquipmentData;
window.filterEquipmentOptions = filterEquipmentOptions;
window.loadImportLogsData = loadImportLogsData;

  // ========================================== //
// 모든 파이어베이스 JSON 파일 실시간 변경 감지 및 자동 새로고침
// ========================================== //

// 감시할 주요 파이어베이스 경로 리스트
const watchPaths = [
  `${FIREBASE_DB_URL}/nara_economy/main_city.json`,
  `${FIREBASE_DB_URL}/nara_economy/overseas_investment.json`,
  `${FIREBASE_DB_URL}/nara_economy/standard.json`,
  `${FIREBASE_DB_URL}/nara_military/equipment.json`,
  `${FIREBASE_DB_URL}/nara_military/export_import_log.json`,
  `${FIREBASE_DB_URL}/nara_rank/gdp_per.json`,
  `${FIREBASE_DB_URL}/nara_rank/defence.json`,
  `${FIREBASE_DB_URL}/nara_rank/gdp_per_capita.json`,
  `${FIREBASE_DB_URL}/nara_rank/army.json`,
  `${FIREBASE_DB_URL}/nara_rank/navy.json`,
  `${FIREBASE_DB_URL}/nara_rank/air.json`
];

// 각 경로의 최초 데이터 상태를 저장할 객체
const initialDataSnapshots = {};
let isInitialized = false;

async function checkFirebaseChanges() {
  try {
    for (const url of watchPaths) {
      // 캐시를 방지하기 위해 타임스탬프 추가
      const res = await fetch(`${url}?_t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const textData = await res.text();

      if (!isInitialized) {
        // 최초 실행 시점의 데이터 상태를 기억
        initialDataSnapshots[url] = textData;
      } else {
        // 이전 상태와 현재 상태가 다르면 데이터가 변경된 것으로 판단!
        if (initialDataSnapshots[url] !== textData) {
          //console.log(`🔄 파이어베이스 데이터 변경 감지 (${url})! 2초 후 화면을 최신화합니다.`);
          initialDataSnapshots[url] = textData; // 최신 상태로 갱신

          // 💡 서버 동기화 시간을 고려하여 2초(2000ms) 동안 대기한 후 화면 갱신 함수 실행
          setTimeout(() => {
            if (typeof loadMainData === 'function') {
              loadMainData();
            }
            if (typeof showMyEconomyView === 'function') {
              showMyEconomyView();
            }
            //console.log("✨ 최신 데이터 반영 완료!");
          }, 2000);
          
          return;
        }
      }
    }
    isInitialized = true;
  } catch (err) {
    console.warn("데이터 변경 감지 중 통신 오류:", err);
  }
}
  // 페이지 내 모든 폼의 제출(submit)을 감지하여 자동으로 버튼을 잠금
document.addEventListener("submit", function (e) {
  // 실제 제출 버튼(type="submit") 가져오기
  const submitBtn = e.submitter || e.target.querySelector("button[type='submit']");
  
  if (submitBtn) {
    // 중복 클릭 방지를 위해 비활성화
    submitBtn.disabled = true;

    // 만약 서버 통신 에러나 취소 등으로 버튼을 다시 살려야 할 상황을 대비해 
    // 일정 시간(예: 5초) 뒤에 자동으로 풀리게 안전장치를 둘 수도 있습니다. (선택사항)
    setTimeout(() => { submitBtn.disabled = false; }, 5000);
  }
});
  // 페이지 로드 시 저장된 다크모드 설정 불러오기
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    updateThemeButtonUI(true);
  }
});

// 다크모드 토글 함수
function toggleDarkMode() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const isDark = currentTheme === "dark";

  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");
    updateThemeButtonUI(false);
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
    updateThemeButtonUI(true);
  }
}

// 버튼 텍스트 및 아이콘 업데이트 헬퍼 함수
function updateThemeButtonUI(isDark) {
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) {
    btn.innerText = isDark ? "☀️ 라이트모드" : "🌙 다크모드";
  }
}

// 전역 함수 등록
window.toggleDarkMode = toggleDarkMode;
function validateAndSubmitArmyData() {
  // 1. DOM에서 현재 보유수와 입력된 증감값 매핑
  const items = [
    { name: "전차(3.5세대)", curId: "cur-tank-35", inputId: "edit-tank-35" },
    { name: "전차(3세대)", curId: "cur-tank-30", inputId: "edit-tank-30" },
    { name: "전차(2세대)", curId: "cur-tank-20", inputId: "edit-tank-20" },
    { name: "전차(1세대)", curId: "cur-tank-10", inputId: "edit-tank-10" },
    { name: "전차(1세대미만)", curId: "cur-tank-00", inputId: "edit-tank-00" },
    { name: "경전차(3.5세대)", curId: "cur-lighttank-35", inputId: "edit-lighttank-35" },
    { name: "경전차(3세대)", curId: "cur-lighttank-30", inputId: "edit-lighttank-30" },
    { name: "경전차(2세대)", curId: "cur-lighttank-20", inputId: "edit-lighttank-20" },
    { name: "경전차(1세대)", curId: "cur-lighttank-10", inputId: "edit-lighttank-10" },
    { name: "경전차(1세대미만)", curId: "cur-lighttank-00", inputId: "edit-lighttank-00" },
    { name: "차량", curId: "cur-vehicle", inputId: "edit-vehicle" },
    { name: "견인포(105mm미만)", curId: "cur-howitzer-under", inputId: "edit-howitzer-under" },
    { name: "견인포(105mm이상)", curId: "cur-howitzer-over", inputId: "edit-howitzer-over" },
    { name: "자주포(사거리20km미만)", curId: "cur-sph-under", inputId: "edit-sph-under" },
    { name: "자주포(사거리20km이상)", curId: "cur-sph-over", inputId: "edit-sph-over" },
    { name: "장갑차(APC)", curId: "cur-apc", inputId: "edit-apc" },
    { name: "장갑차(IFV)", curId: "cur-ifv", inputId: "edit-ifv" },
    { name: "헬기", curId: "cur-heli", inputId: "edit-heli" },
    { name: "공격헬기", curId: "cur-attack-heli", inputId: "edit-attack-heli" }
  ];

  // 2. 각 항목별 마이너스 초과 감소 여부 검증
  for (let item of items) {
    const currentVal = parseInt(document.getElementById(item.curId)?.innerText) || 0;
    const changeVal = parseInt(document.getElementById(item.inputId)?.value) || 0;

    // 마이너스(-) 입력값이 현재 보유수보다 클 경우 (예: 보유 5대인데 -6 입력)
    if (changeVal < 0 && Math.abs(changeVal) > currentVal) {
      alert(`[오류] ${item.name}의 감소 수치(${Math.abs(changeVal)}대)가 현재 보유수(${currentVal}대)보다 클 수 없습니다!`);
      document.getElementById(item.inputId).focus();
      return; // 즉시 중단
    }
  }

  // 3. 검증 통과 시 서버(Apps Script)로 전송
  sendArmyDataToServer(items);
}
async function sendArmyDataToServer() {
  const payloadData = {};

  // 1. 전차 (세대별 select 값과 edit-val-tank 입력값 조합)
  const tankVal = parseInt(document.getElementById('edit-val-tank')?.value) || 0;
  if (tankVal !== 0) {
    const gen = document.getElementById('select-tank-gen')?.value; // '3.5', '3.0', '2.0', '1.0', '0.0'
    let header = "전차";
    if (gen === '3.5') header = "전차35";
    else if (gen === '3.0') header = "전차3";
    else if (gen === '2.0') header = "전차2";
    else if (gen === '1.0') header = "전차1";
    else if (gen === '0.0') header = "전차";
    payloadData[header] = tankVal;
  }

  // 2. 경전차 (세대별 select 값과 edit-val-lighttank 입력값 조합)
  const lightVal = parseInt(document.getElementById('edit-val-lighttank')?.value) || 0;
  if (lightVal !== 0) {
    const gen = document.getElementById('select-lighttank-gen')?.value;
    let header = "경전차";
    if (gen === '3.5') header = "경전차35";
    else if (gen === '3.0') header = "경전차3";
    else if (gen === '2.0') header = "경전차2";
    else if (gen === '1.0') header = "경전차1";
    else if (gen === '0.0') header = "경전차";
    payloadData[header] = lightVal;
  }

  // 3. 차량 (일반 차량)
  const vehicleVal = parseInt(document.getElementById('edit-val-vehicle')?.value) || 0;
  if (vehicleVal !== 0) {
    payloadData["차량"] = vehicleVal;
  }

  // 4. 견인포 (select 타입에 따라 105견인포 / 155견인포 분기)
  const howitzerVal = parseInt(document.getElementById('edit-val-howitzer')?.value) || 0;
  if (howitzerVal !== 0) {
    const type = document.getElementById('select-howitzer-type')?.value; // 'under' 또는 'over'
    payloadData[type === 'under' ? "105견인포" : "155견인포"] = howitzerVal;
  }

  // 5. 자주포 (select 타입에 따라 단거리자주포 / 자주포 분기)
  const sphVal = parseInt(document.getElementById('edit-val-sph')?.value) || 0;
  if (sphVal !== 0) {
    const type = document.getElementById('select-sph-type')?.value; // 'under' 또는 'over'
    payloadData[type === 'under' ? "단거리자주포" : "자주포"] = sphVal;
  }

  // 6. 장갑차 (select 타입에 따라 장갑차 / IFV 분기)
  const apcVal = parseInt(document.getElementById('edit-val-apc')?.value) || 0;
  if (apcVal !== 0) {
    const type = document.getElementById('select-apc-type')?.value; // 'apc' 또는 'ifv'
    payloadData[type === 'apc' ? "장갑차" : "IFV"] = apcVal;
  }

  // 7. 헬기 (select 타입에 따라 헬기 / 공격헬기 분기)
  const heliVal = parseInt(document.getElementById('edit-val-heli')?.value) || 0;
  if (heliVal !== 0) {
    const type = document.getElementById('select-heli-type')?.value; // 'transport' 또는 'attack'
    payloadData[type === 'transport' ? "헬기" : "공격헬기"] = heliVal;
  }

  const payload = {
    action: "updateArmyEquipment",
    country: currentUser ? currentUser.country : "",
    changes: payloadData
  };

  // 🔍 콘솔에서 changes 객체에 값이 잘 담기는지 확인
  //console.log("🛡️ [육군 전송 데이터 확인 Payload]:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(MIL_API_EDIT, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    //console.log("🛡️ [육군 서버 응답 Result]:", result);

    if (result.success || result.result === "success") {
      alert("육군 전력이 성공적으로 업데이트되었습니다!");
      closeArmyEditModal();

      setTimeout(() => {
        if (typeof showMyEconomyView === "function") {
          showMyEconomyView();
        }
        if (typeof checkFirebaseChanges === "function") {
          checkFirebaseChanges();
        }
        if (typeof loadAndDisplayMyArmyEquipment === "function") {
          loadAndDisplayMyArmyEquipment();
        }
        loadMainData();
      }, 3000);
    } else {
      alert("업데이트 실패: " + (result.message || "알 수 없는 오류"));
    }
  } catch (err) {
    console.error("육군 전력 수정 오류:", err);
    alert("서버 통신 중 오류가 발생했습니다.");
  }
}
// 🛡️ 육군 전력 관리 모달 열기 및 데이터 연동
function openArmyEditModal() {
  const modal = document.getElementById('army-edit-modal');
  if (modal) modal.style.display = 'flex';
  loadAndDisplayMyArmyEquipment(); // 모달을 열 때 보유수 동기화 함수 호출
}

function closeArmyEditModal() {
  const modal = document.getElementById('army-edit-modal');
  if (modal) modal.style.display = 'none';
}

// 자국의 육군 장비 보유량을 불러와서 모달 UI에 채워주는 함수 (시트 헤더 형식 반영)
function loadAndDisplayMyArmyEquipment() {
  if (!currentUser || !currentUser.country) {
    console.warn("로그인된 유저 또는 국가 정보가 없습니다.");
    return;
  }
  
  const myCountryName = currentUser.country;
  const cleanMyCountry = cleanName(myCountryName);
  
  const armyArray = Array.isArray(globalArmyData) ? globalArmyData : [];
  const myObjArmy = armyArray.find(d => cleanName(d['국가명'] || d['국가']) === cleanMyCountry) || {};
  
  //console.log("현재 내 국가 육군 전력 데이터 매칭:", myObjArmy);

  // 💡 시트의 새로운 헤더 명칭(전차1, 전차2, 105견인포 등)과 정확히 일치하도록 매칭
  window.modalArmyCache = {
    tank: {
      '3.5': parseNumber(myObjArmy['전차35'] || 0),
      '3.0': parseNumber(myObjArmy['전차3'] || 0),
      '2.0': parseNumber(myObjArmy['전차2'] || 0),
      '1.0': parseNumber(myObjArmy['전차1'] || 0),
      '0.0': parseNumber(myObjArmy['전차'] || 0)
    },
    lighttank: {
      '3.5': parseNumber(myObjArmy['경전차35'] || 0),
      '3.0': parseNumber(myObjArmy['경전차3'] || 0),
      '2.0': parseNumber(myObjArmy['경전차2'] || 0),
      '1.0': parseNumber(myObjArmy['경전차1'] || 0),
      '0.0': parseNumber(myObjArmy['경전차'] || 0)
    },
    vehicle: parseNumber(myObjArmy['차량'] || 0),
    howitzer: {
      'under': parseNumber(myObjArmy['105견인포'] || 0),
      'over': parseNumber(myObjArmy['155견인포'] || 0)
    },
    sph: {
      'under': parseNumber(myObjArmy['단거리자주포'] || 0),
      'over': parseNumber(myObjArmy['자주포'] || 0)
    },
    apc: {
      'apc': parseNumber(myObjArmy['장갑차'] || 0),
      'ifv': parseNumber(myObjArmy['IFV'] || 0)
    },
    heli: {
      'transport': parseNumber(myObjArmy['헬기'] || 0),
      'attack': parseNumber(myObjArmy['공격헬기'] || 0)
    }
  };

  // 모든 종류의 보유수 텍스트 갱신 실행
  updateArmyCurrentDisplay('tank');
  updateArmyCurrentDisplay('lighttank');
  updateArmyCurrentDisplay('vehicle');
  updateArmyCurrentDisplay('howitzer');
  updateArmyCurrentDisplay('sph');
  updateArmyCurrentDisplay('apc');
  updateArmyCurrentDisplay('heli');
}

// 드롭다운 변경 또는 초기화 시 보유수 텍스트를 화면에 반영하는 함수
function updateArmyCurrentDisplay(category) {
  if (!window.modalArmyCache) return;
  const cache = window.modalArmyCache;
  let val = 0;

  if (category === 'tank') {
    const gen = document.getElementById('select-tank-gen')?.value || '3.5';
    val = cache.tank[gen] || 0;
    const el = document.getElementById('cur-val-tank');
    if (el) el.innerText = val;
  } else if (category === 'lighttank') {
    const gen = document.getElementById('select-lighttank-gen')?.value || '3.5';
    val = cache.lighttank[gen] || 0;
    const el = document.getElementById('cur-val-lighttank');
    if (el) el.innerText = val;
  } else if (category === 'vehicle') {
    val = cache.vehicle || 0;
    const el = document.getElementById('cur-val-vehicle');
    if (el) el.innerText = val;
  } else if (category === 'howitzer') {
    const type = document.getElementById('select-howitzer-type')?.value || 'under';
    val = cache.howitzer[type] || 0;
    const el = document.getElementById('cur-val-howitzer');
    if (el) el.innerText = val;
  } else if (category === 'sph') {
    const type = document.getElementById('select-sph-type')?.value || 'under';
    val = cache.sph[type] || 0;
    const el = document.getElementById('cur-val-sph');
    if (el) el.innerText = val;
  } else if (category === 'apc') {
    const type = document.getElementById('select-apc-type')?.value || 'apc';
    val = cache.apc[type] || 0;
    const el = document.getElementById('cur-val-apc');
    if (el) el.innerText = val;
  } else if (category === 'heli') {
    const type = document.getElementById('select-heli-type')?.value || 'transport';
    val = cache.heli[type] || 0;
    const el = document.getElementById('cur-val-heli');
    if (el) el.innerText = val;
  }
}

window.openArmyEditModal = openArmyEditModal;
window.closeArmyEditModal = closeArmyEditModal;
window.updateArmyCurrentDisplay = updateArmyCurrentDisplay;
window.validateAndSubmitArmyData = validateAndSubmitArmyData;

  // 🛡️ 공군 전력 관리 모달 열기 및 데이터 연동
function openAirEditModal() {
  const modal = document.getElementById('air-edit-modal');
  if (modal) modal.style.display = 'flex';
  loadAndDisplayMyAirEquipment();
}

function closeAirEditModal() {
  const modal = document.getElementById('air-edit-modal');
  if (modal) modal.style.display = 'none';
}

// 자국의 공군 장비 보유량을 불러와서 모달 UI에 채워주는 함수
function loadAndDisplayMyAirEquipment() {
  if (!currentUser || !currentUser.country) {
    console.warn("로그인된 유저 또는 국가 정보가 없습니다.");
    return;
  }
  
  const myCountryName = currentUser.country;
  const cleanMyCountry = cleanName(myCountryName);
  
  const airArray = Array.isArray(globalAirData) ? globalAirData : [];
  const myObjAir = airArray.find(d => cleanName(d['국가명'] || d['국가']) === cleanMyCountry) || {};
  
  // 공군 시트 헤더 명칭에 맞게 캐시 데이터 매핑
  window.modalAirCache = {
    fighter: {
      'sub1': parseNumber(myObjAir['전투기1세대미만'] || myObjAir['전투기0'] || 0),
      '1': parseNumber(myObjAir['전투기1'] || 0),
      '2': parseNumber(myObjAir['전투기2'] || 0),
      '3': parseNumber(myObjAir['전투기3'] || 0),
      '4': parseNumber(myObjAir['전투기4'] || 0),
      '4.5': parseNumber(myObjAir['전투기45'] || myObjAir['전투기4.5'] || 0),
      '5': parseNumber(myObjAir['전투기5'] || 0)
    },
    attacker: {
      'sub': parseNumber(myObjAir['아음속공격기'] || myObjAir['공격기'] || 0),
      'super': parseNumber(myObjAir['초음속공격기'] || 0)
    },
    bomber: parseNumber(myObjAir['폭격기'] || 0),
    special: parseNumber(myObjAir['특수목적항공기'] || 0),
    transport: parseNumber(myObjAir['수송기'] || 0)
  };

  updateAirCurrentDisplay('fighter');
  updateAirCurrentDisplay('attacker');
  updateAirCurrentDisplay('bomber');
  updateAirCurrentDisplay('special');
  updateAirCurrentDisplay('transport');
}

// 드롭다운 변경 시 보유수 텍스트 갱신
function updateAirCurrentDisplay(category) {
  if (!window.modalAirCache) return;
  const cache = window.modalAirCache;
  let val = 0;

  if (category === 'fighter') {
    const gen = document.getElementById('select-fighter-gen')?.value || '5';
    val = cache.fighter[gen] || 0;
    const el = document.getElementById('cur-val-fighter');
    if (el) el.innerText = val;
  } else if (category === 'attacker') {
    const type = document.getElementById('select-attacker-type')?.value || 'sub';
    val = cache.attacker[type] || 0;
    const el = document.getElementById('cur-val-attacker');
    if (el) el.innerText = val;
  } else if (category === 'bomber') {
    val = cache.bomber || 0;
    const el = document.getElementById('cur-val-bomber');
    if (el) el.innerText = val;
  } else if (category === 'special') {
    val = cache.special || 0;
    const el = document.getElementById('cur-val-special');
    if (el) el.innerText = val;
  } else if (category === 'transport') {
    val = cache.transport || 0;
    const el = document.getElementById('cur-val-transport');
    if (el) el.innerText = val;
  }
}

// 유효성 검증 (보유수보다 많은 마이너스 입력 방지)
function validateAndSubmitAirData() {
  // 현재 선택된 드롭다운 세부 세대/타입의 보유수와 비교 검증
  const fighterGen = document.getElementById('select-fighter-gen')?.value || '5';
  const curFighter = window.modalAirCache.fighter[fighterGen] || 0;
  const editFighter = parseInt(document.getElementById('edit-fighter')?.value) || 0;
  if (editFighter < 0 && Math.abs(editFighter) > curFighter) {
    alert(`[오류] 전투기(${fighterGen}세대) 감소 수치(${Math.abs(editFighter)}대)가 현재 보유수(${curFighter}대)보다 클 수 없습니다!`);
    document.getElementById('edit-fighter').focus();
    return;
  }

  const attackerType = document.getElementById('select-attacker-type')?.value || 'sub';
  const curAttacker = window.modalAirCache.attacker[attackerType] || 0;
  const editAttacker = parseInt(document.getElementById('edit-attacker')?.value) || 0;
  if (editAttacker < 0 && Math.abs(editAttacker) > curAttacker) {
    alert(`[오류] 공격기 감소 수치(${Math.abs(editAttacker)}대)가 현재 보유수(${curAttacker}대)보다 클 수 없습니다!`);
    document.getElementById('edit-attacker').focus();
    return;
  }

  const items = [
    { name: `전투기(${fighterGen}세대)`, inputId: 'edit-fighter', genKey: fighterGen },
    { name: `공격기(${attackerType})`, inputId: 'edit-attacker', typeKey: attackerType },
    { name: "폭격기", inputId: 'edit-bomber' },
    { name: "특수목적항공기", inputId: 'edit-special' },
    { name: "수송기", inputId: 'edit-transport' }
  ];

  sendAirDataToServer(items);
}

async function sendAirDataToServer(items) {
  const payloadData = {};
  
  items.forEach(item => {
    const val = parseInt(document.getElementById(item.inputId)?.value) || 0;
    if (val !== 0) {
      let sheetHeader = "";

      // 공군 시트 헤더명과 정확히 맵핑
      if (item.inputId === 'edit-fighter') {
        const gen = document.getElementById('select-fighter-gen')?.value;
        if (gen === 'sub1') sheetHeader = "전투기1세대미만";
        else if (gen === '4.5') sheetHeader = "전투기45"; // 시트 헤더가 '전투기45'인지 확인
        else sheetHeader = `전투기${gen}`; // 전투기1, 전투기2, 전투기3, 전투기4, 전투기5
      } else if (item.inputId === 'edit-attacker') {
        const type = document.getElementById('select-attacker-type')?.value;
        sheetHeader = (type === 'sub') ? "공격기" : "초음속공격기"; // 시트 헤더명 기준
      } else if (item.inputId === 'edit-bomber') {
        sheetHeader = "폭격기";
      } else if (item.inputId === 'edit-special') {
        sheetHeader = "특수목적항공기";
      } else if (item.inputId === 'edit-transport') {
        sheetHeader = "수송기";
      }

      if (sheetHeader) {
        payloadData[sheetHeader] = val;
      }
    }
  });

  const payload = {
    action: "updateAirEquipment",
    country: currentUser ? currentUser.country : "",
    changes: payloadData
  };

  try {
    const response = await fetch(MIL_API_EDIT, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (result.success || result.result === "success") {
      alert("공군 전력이 성공적으로 업데이트되었습니다!");
      closeAirEditModal();

      setTimeout(() => {
        if (typeof showMyEconomyView === "function") {
          showMyEconomyView();
        }
        if (typeof checkFirebaseChanges === "function") {
          checkFirebaseChanges();
        }
        if (typeof loadAndDisplayMyAirEquipment === "function") {
          loadAndDisplayMyAirEquipment();
        }
        loadMainData();
      }, 3000);
    } else {
      alert("업데이트 실패: " + (result.message || "알 수 없는 오류"));
    }
  } catch (err) {
    console.error("공군 전력 수정 오류:", err);
    alert("서버 통신 중 오류가 발생했습니다.");
  }
}

// 전역 등록
window.openAirEditModal = openAirEditModal;
window.closeAirEditModal = closeAirEditModal;
window.updateAirCurrentDisplay = updateAirCurrentDisplay;
window.validateAndSubmitAirData = validateAndSubmitAirData;

  // ⚓ 해군 모달 열기/닫기
function openNavyEditModal() {
  const modal = document.getElementById('navy-edit-modal');
  if (modal) modal.style.display = 'flex';
}

function closeNavyEditModal() {
  const modal = document.getElementById('navy-edit-modal');
  if (modal) modal.style.display = 'none';
}

// ⚓ 함급명 입력(포커스 아웃) 시 기존 데이터 자동 채우기 기능
function checkAndFillNavyClassData() {
  const classNameInput = document.getElementById('edit-navy-class-name');
  if (!classNameInput) return;
  
  const searchClassName = classNameInput.value.trim();
  if (!searchClassName) return;

  // 전역에 저장된 해군 데이터 배열 (없으면 빈 배열)
  const navyArray = Array.isArray(globalNavyData) ? globalNavyData : [];
  
  // 로그인된 유저의 국가명과 일치하고, 함급명도 일치하는 데이터를 탐색
  const myCountryName = currentUser ? currentUser.country : "";
  const matchedShip = navyArray.find(d => {
    const rowCountry = cleanName(d['국가명'] || d['국가'] || '');
    const rowClass = String(d['함급명'] || '').trim();
    return rowCountry === cleanName(myCountryName) && rowClass === searchClassName;
  });

  if (matchedShip) {
    // 1. 함종 선택
    const shipTypeEl = document.getElementById('select-navy-type');
    if (shipTypeEl && matchedShip['함종']) {
      shipTypeEl.value = String(matchedShip['함종']).trim();
    }

    // 2. 톤수 입력
    const tonsEl = document.getElementById('edit-navy-tons');
    if (tonsEl) {
      tonsEl.value = matchedShip['톤수'] || '';
    }

    // 3. 이지스 체계 체크박스 ('O' 또는 'TRUE'인 경우 체크)
    const aegisEl = document.getElementById('check-navy-aegis');
    if (aegisEl) {
      const val = String(matchedShip['이지스'] || '').trim().toUpperCase();
      aegisEl.checked = (val === 'O' || val === 'TRUE' || val === 'Y');
    }

    // 4. 핵추진 체크박스
    const nuclearEl = document.getElementById('check-navy-nuclear');
    if (nuclearEl) {
      const val = String(matchedShip['핵추진'] || '').trim().toUpperCase();
      nuclearEl.checked = (val === 'O' || val === 'TRUE' || val === 'Y');
    }

    // 5. VLS 체크박스
    const vlsEl = document.getElementById('check-navy-vls');
    if (vlsEl) {
      const val = String(matchedShip['VLS'] || '').trim().toUpperCase();
      vlsEl.checked = (val === 'O' || val === 'TRUE' || val === 'Y');
    }

    // 6. 보유 대수 입력 (현재 보유량 표시)
    const countEl = document.getElementById('edit-navy-count');
    if (countEl) {
      countEl.value = matchedShip['대수'] || 0;
    }

    //console.log("⚓ 기존 함급 데이터 자동 로드 성공:", searchClassName);
  }
}

// ⚓ 해군 전력 데이터 검증 및 서버 전송
async function validateAndSubmitNavyData() {
  const className = document.getElementById('edit-navy-class-name')?.value.trim();
  if (!className) {
    alert("함급명을 정확히 입력해주세요!");
    document.getElementById('edit-navy-class-name')?.focus();
    return;
  }

  const shipType = document.getElementById('select-navy-type')?.value || '구축함';
  const tons = parseFloat(document.getElementById('edit-navy-tons')?.value) || 0;
  
  // 체크형 항목은 시트 양식에 맞춰 'O' 또는 'X'로 변환
  const isAegis = document.getElementById('check-navy-aegis')?.checked ? 'O' : 'X';
  const isNuclear = document.getElementById('check-navy-nuclear')?.checked ? 'O' : 'X';
  const isVls = document.getElementById('check-navy-vls')?.checked ? 'O' : 'X';
  
  const count = parseInt(document.getElementById('edit-navy-count')?.value) || 0;

  const payloadData = {
    '함급명': className,
    '함종': shipType,
    '톤수': tons,
    '이지스': isAegis,
    '핵추진': isNuclear,
    'VLS': isVls,
    '대수': count
  };

  const payload = {
    action: "updateNavyEquipment",
    country: currentUser ? currentUser.country : "",
    changes: payloadData
  };

  //console.log("⚓ [해군 전송 데이터 Payload]:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(MIL_API_EDIT, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    //console.log("⚓ [해군 서버 응답 Result]:", result);

    if (result.success || result.result === "success") {
      alert("해군 함정 전력이 성공적으로 업데이트되었습니다!");
      closeNavyEditModal();

      setTimeout(() => {
        if (typeof showMyEconomyView === 'function') showMyEconomyView();
        if (typeof checkFirebaseChanges === 'function') checkFirebaseChanges();
        loadMainData();
      }, 3000);
    } else {
      alert("업데이트 실패: " + (result.message || "알 수 없는 오류"));
    }
  } catch (err) {
    console.error("해군 전력 수정 오류:", err);
    alert("서버 통신 중 오류가 발생했습니다.");
  }
}

// 전역 함수 등록
window.openNavyEditModal = openNavyEditModal;
window.closeNavyEditModal = closeNavyEditModal;
window.checkAndFillNavyClassData = checkAndFillNavyClassData;
window.validateAndSubmitNavyData = validateAndSubmitNavyData;

function syncDropdownThemeLabel() {
  const themeBtn = document.getElementById('dropdown-theme-toggle-mobile');
  if (!themeBtn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  themeBtn.innerText = isDark ? '☀️ 라이트모드' : '🌙 다크모드';
}
function getProfileDropdownEl(targetType) {
  if (targetType === 'pc') return document.getElementById('user-profile-dropdown-pc');
  if (targetType === 'mobile') return document.getElementById('user-profile-dropdown-mobile');
  return window.innerWidth <= 768
    ? document.getElementById('user-profile-dropdown-mobile')
    : document.getElementById('user-profile-dropdown-pc');
}

window.toggleUserProfileDropdown = function(event, targetType) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const pcDropdown = document.getElementById('user-profile-dropdown-pc');
  const mobileDropdown = document.getElementById('user-profile-dropdown-mobile');
  const dropdown = getProfileDropdownEl(targetType);
  if (!dropdown) return;

  const isOpen = dropdown.style.display === 'block';
  if (pcDropdown) pcDropdown.style.display = 'none';
  if (mobileDropdown) mobileDropdown.style.display = 'none';

  if (isOpen) return;

  if (currentUser) {
    const countryName = currentUser.country || '-';
    const flagUrl = flagMap.get(cleanName(countryName)) || '';
    const emailText = currentUser.email || currentUser.username || '-';

    ['pc', 'mobile'].forEach(mode => {
      const ddFlag = document.getElementById(`dropdown-user-flag-${mode}`);
      if (ddFlag) {
        if (flagUrl) {
          ddFlag.src = flagUrl;
          ddFlag.alt = `${countryName} 국기`;
          ddFlag.style.display = 'inline-block';
        } else {
          ddFlag.style.display = 'none';
        }
      }

      const ddCountry = document.getElementById(`dropdown-user-country-${mode}`);
      if (ddCountry) ddCountry.innerText = countryName;

      const ddEmail = document.getElementById(`dropdown-user-email-${mode}`);
      if (ddEmail) ddEmail.innerText = emailText;
    });
  }

  syncDropdownThemeLabel();
  dropdown.style.display = 'block';
};
  //드롭다운 리스너
  // document 클릭 닫기 리스너에 모바일 트리거 추가
  document.addEventListener('click', function(e) {
  const pcDropdown = document.getElementById('user-profile-dropdown-pc');
  const mobileDropdown = document.getElementById('user-profile-dropdown-mobile');
  const pcTrigger = document.getElementById('user-flag-trigger');
  const mobileTrigger = document.getElementById('mobile-flag-trigger');

  [pcDropdown, mobileDropdown].forEach(dropdown => {
    if (dropdown && dropdown.style.display === 'block') {
      const clickedInsideDropdown = dropdown.contains(e.target);
      const clickedPcTrigger = pcTrigger && pcTrigger.contains(e.target);
      const clickedMobileTrigger = mobileTrigger && mobileTrigger.contains(e.target);
      if (!clickedInsideDropdown && !clickedPcTrigger && !clickedMobileTrigger) {
        dropdown.style.display = 'none';
      }
    }
  });
  window.toggleMobileDrawer = function(event) {
  if (event) event.stopPropagation();

  const drawer = document.getElementById('mobile-nav-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  const icon = document.getElementById('mobile-menu-icon');
  if (!drawer || !backdrop) return;

  const isOpen = drawer.style.display === 'block';
  if (isOpen) {
    closeMobileDrawer();
  } else {
    drawer.style.display = 'block';
    backdrop.style.display = 'block';
    if (icon) icon.innerText = '—';
    syncMobileDrawerAuth();
  }
};

window.closeMobileDrawer = function() {
  const drawer = document.getElementById('mobile-nav-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  const icon = document.getElementById('mobile-menu-icon');
  if (drawer) drawer.style.display = 'none';
  if (backdrop) backdrop.style.display = 'none';
  if (icon) icon.innerText = '☰';
};

window.switchDrawerTab = function(tabName, btnEl) {
  document.querySelectorAll('.drawer-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  ['economy', 'military', 'menu'].forEach(key => {
    const panel = document.getElementById(`drawer-panel-${key}`);
    if (panel) panel.style.display = key === tabName ? 'flex' : 'none';
  });
};

window.drawerAction = function(fn) {
  closeMobileDrawer();
  if (typeof fn === 'function') fn();
};

function syncMobileDrawerAuth() {
  const isLoggedIn = Boolean(currentUser && currentUser.country);
  const myCountryBtn = document.getElementById('drawer-my-country-btn');
  const logoutBtn = document.getElementById('drawer-logout-btn');
  const mobileAuthArea = document.getElementById('mobile-auth-area');
  const mobileUserArea = document.getElementById('mobile-user-area');
  const mobileFlag = document.getElementById('mobile-user-flag');
  const mobileFlagFallback = document.getElementById('mobile-user-flag-fallback');

  if (myCountryBtn) myCountryBtn.style.display = isLoggedIn ? 'block' : 'none';
  if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'block' : 'none';
  if (mobileAuthArea) mobileAuthArea.style.display = isLoggedIn ? 'none' : 'block';
  if (mobileUserArea) mobileUserArea.style.display = isLoggedIn ? 'block' : 'none';

  if (isLoggedIn && mobileFlag && mobileFlagFallback) {
    const flagUrl = flagMap.get(cleanName(currentUser.country));
    if (flagUrl) {
      mobileFlag.src = flagUrl;
      mobileFlag.style.display = 'inline-block';
      mobileFlagFallback.style.display = 'none';
    } else {
      mobileFlag.style.display = 'none';
      mobileFlagFallback.style.display = 'inline-flex';
    }
  }
}
  
});
  function showSignedInputNotice(el, message) {
  if (!el) return;

  // 입력칸 바로 뒤에 경고 메시지 엘리먼트 생성 또는 재사용
  let noticeEl = el.parentElement ? el.parentElement.querySelector('.signed-input-error') : null;
  if (!noticeEl && el.parentElement) {
    noticeEl = document.createElement('div');
    noticeEl.className = 'signed-input-error';
    noticeEl.style.color = '#dc2626';
    noticeEl.style.fontSize = '0.78rem';
    noticeEl.style.marginTop = '4px';
    noticeEl.style.fontWeight = '600';
    el.parentElement.appendChild(noticeEl);
  }

  if (noticeEl) {
    noticeEl.textContent = message;
    noticeEl.style.display = 'block';
  }

  // 기존 프로젝트에 토스트/알림 함수가 있으면 함께 호출 (없으면 무시)
  if (typeof showToast === 'function') {
    showToast(message, 'error');
  }
}

function clearSignedInputNotice(el) {
  if (!el || !el.parentElement) return;
  const noticeEl = el.parentElement.querySelector('.signed-input-error');
  if (noticeEl) {
    noticeEl.textContent = '';
    noticeEl.style.display = 'none';
  }
}

function sanitizeSignedIntegerInput(el) {
  if (!el) return;
  const originalVal = el.value;
  let val = originalVal;

  // 빈 문자열이거나 '-'만 있는 경우(입력 중 상태)는 허용하되 기존 경고만 정리
  if (val === '' || val === '-') {
    clearSignedInputNotice(el);
    return;
  }

  // 숫자와 '-' 외 문자 제거
  const hadInvalidChar = /[^0-9-]/.test(val);
  val = val.replace(/[^0-9-]/g, '');

  // '-'가 맨 앞에만 오도록 정리 (중간이나 여러 개 들어간 '-' 제거)
  const isNegative = val.startsWith('-');
  const hadExtraMinus = (val.match(/-/g) || []).length > (isNegative ? 1 : 0);
  val = val.replace(/-/g, '');
  if (isNegative) {
    val = '-' + val;
  }

  if (hadInvalidChar || hadExtraMinus) {
    showSignedInputNotice(el, '정수(앞자리 - 포함)만 입력할 수 있습니다.');
  } else {
    clearSignedInputNotice(el);
  }

  if (el.value !== val) {
    el.value = val;
  }
}
});
