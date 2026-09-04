document.addEventListener("DOMContentLoaded", function() {
  // 1. 현재 연도 메인 통합 API
  const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec"; 

  // 2. 항목별 전체 연도 시계열 API
  const API_URL_GDP = "https://script.google.com/macros/s/AKfycbzyzCjtpkPMsXf20Z9mylf_h_58KR-9wclFykOlzq9zADXWgr_dOVLc0KLzjsCF8CDowg/exec";
  const API_URL_DEF = "https://script.google.com/macros/s/AKfycbz8SvI3IPuc28iW3N5FI0rrwpqVHZb0suFjWPeINP8Lm9ZDMin6ynu0We4m95EqahAHRg/exec";
  const API_URL_CAP = "https://script.google.com/macros/s/AKfycbyyq9gnFw4mPr3jY6ReqYMJphX9TzfmecVnz0WfoFru9u9aiTwk3Cr5wzdbBw1aQ9xsyA/exec";

  // 3. 세계 통계 성장률 API
  const API_URL_GROWTH = "https://script.google.com/macros/s/AKfycbz2v5Yoh3CmMcTfKBUoO4EWiKOYe1kZ8Z3nWZ2Jvu6kzUICsaJgmlFatcBn1ixfShzJyA/exec"; 

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

    // 국방비 시계열 데이터에서 국기 이미지 URL 추출
    extractFlags(globalDefData, defRes);

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

  // 국방비 시계열 데이터의 '국기링크' 추출 및 매핑 함수
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

    if (!list || list.length === 0) {
      console.warn("⚠️ [국기 매핑 실패] 국방비 시계열 데이터 배열을 찾을 수 없거나 비어 있습니다.");
      return;
    }

    list.forEach(row => {
      if (!row || typeof row !== 'object') return;

      let country = extractCountryFromRow(row);
      let keyName = cleanName(country);

      if (!keyName) return;

      let flagUrl = "";

      // 1. 헤더명 직접 매칭
      if (row['국기링크']) flagUrl = String(row['국기링크']).trim();
      else if (row['국기']) flagUrl = String(row['국기']).trim();
      else if (row['flag']) flagUrl = String(row['flag']).trim();
      else if (row['Flag']) flagUrl = String(row['Flag']).trim();

      // 2. 헤더 키 이름 정규화 검색
      if (!flagUrl) {
        for (let k of Object.keys(row)) {
          let cleanKey = k.replace(/[\s_]/g, '').toLowerCase();
          if (cleanKey === '국기링크' || cleanKey === '국기' || cleanKey === '국기url' || cleanKey === 'flag' || cleanKey === 'flagurl') {
            flagUrl = String(row[k]).trim();
            break;
          }
        }
      }

      // 3. 객체 값 중 URL 형식 탐색
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

    console.log(`🚩 [국명 매핑 완료] 총 ${flagMap.size}개 국기 저장됨`);
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

      // 국기 이미지 태그 생성
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

    console.groupEnd();
  };

  // -------------------------------------------------------------
  // 팝업 모달 함수 (수정 반영)
  // -------------------------------------------------------------
  window.openCountryModal = function(cleanKey) {
    if (cleanKey === '전세계') return;

    const item = mainData.find(d => cleanName(extractCountryFromRow(d)) === cleanKey);
    if (!item) {
      alert("국가 상세 정보를 찾을 수 없습니다.");
      return;
    }

    const countryName = extractCountryFromRow(item);
    const flagUrl = flagMap.get(cleanKey) || "";

    // 1행: 국기 및 국가명
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

    // 2행: 대륙과 소속연합
    const continentEl = document.getElementById('modal-continent');
    if (continentEl) continentEl.innerText = item['대륙'] || item['소속대륙'] || '-';
    const allianceEl = document.getElementById('modal-alliance');
    if (allianceEl) allianceEl.innerText = item['소속연합'] || item['연합'] || '-';

    // 3행: GDP와 GDP순위
    const rawGdp = (parseFloat(item['GDP(10억달러)']) || 0) * 10;
    const gdpEl = document.getElementById('modal-gdp');
    if (gdpEl) gdpEl.innerText = formatMoney(rawGdp);
    const gdpRankEl = document.getElementById('modal-gdp-rank');
    if (gdpRankEl) gdpRankEl.innerText = getCountryRank('GDP(10억달러)', cleanKey);

    // 4행: GDP대비국방비, 국방비, 국방비순위
    const rawDef = (parseFloat(item['국방비(10억달러)']) || 0) * 10;
    const defRatioCalculated = rawGdp > 0 ? ((rawDef / rawGdp) * 100).toFixed(2) + "%" : "-";
    const defRatioEl = document.getElementById('modal-def-ratio');
    if (defRatioEl) defRatioEl.innerText = item['GDP대비국방비'] || defRatioCalculated;
    const defEl = document.getElementById('modal-def');
    if (defEl) defEl.innerText = formatMoney(rawDef);
    const defRankEl = document.getElementById('modal-def-rank');
    if (defRankEl) defRankEl.innerText = getCountryRank('국방비(10억달러)', cleanKey);

    // 5행: 인구수와 인구순위
    const popEl = document.getElementById('modal-pop');
    if (popEl) popEl.innerText = formatPopulation(item['인구(만명)']);
    const popRankEl = document.getElementById('modal-pop-rank');
    if (popRankEl) popRankEl.innerText = getCountryRank('인구(만명)', cleanKey);

    // 6행: 1인당GDP와 1인당GDP순위
    const capVal = parseFloat(item['1인당GDP']) || 0;
    const capEl = document.getElementById('modal-cap');
    if (capEl) capEl.innerText = `${Math.round(capVal).toLocaleString()} 달러`;
    const capRankEl = document.getElementById('modal-cap-rank');
    if (capRankEl) capRankEl.innerText = getCountryRank('1인당GDP', cleanKey);

    // 7행: 세율과 국가예산 (M열 국가예산: 10억 단위 x10 반영)
    const taxEl = document.getElementById('modal-tax');
    if (taxEl) taxEl.innerText = item['세율'] !== undefined && item['세율'] !== '' ? `${item['세율']}%` : '-';
    
    const rawBudget = (parseFloat(item['국가예산']) || 0) * 10;
    const budgetEl = document.getElementById('modal-budget');
    if (budgetEl) budgetEl.innerText = rawBudget > 0 ? formatMoney(rawBudget) : '-';

    // 8행: 경제체제와 주업 (O열 주업 매핑)
    const systemEl = document.getElementById('modal-system');
    if (systemEl) systemEl.innerText = item['경제체제'] || '-';
    const industryEl = document.getElementById('modal-industry');
    if (industryEl) industryEl.innerText = item['주업'] || '-';

    // 9행: 복지수준 (Q열 복지수준 매핑)
    const welfareEl = document.getElementById('modal-welfare');
    if (welfareEl) welfareEl.innerText = item['복지수준'] || '-';

    // 10행: 국고
    const treasuryEl = document.getElementById('modal-treasury');
    if (treasuryEl) treasuryEl.innerText = item['국고'] ? formatMoney(item['국고']) : '-';

    // 11행: 경제성장률 (소수점 이하 2자리 제한 적용)
    const rawGrowth = item['최종경제성장률'] !== undefined && item['최종경제성장률'] !== '' ? item['최종경제성장률'] : item['경제성장률'];
    const growthEl = document.getElementById('modal-growth');
    if (growthEl) {
      if (rawGrowth !== undefined && rawGrowth !== '' && !isNaN(parseFloat(rawGrowth))) {
        growthEl.innerText = `${parseFloat(rawGrowth).toFixed(2)}%`;
      } else {
        growthEl.innerText = '-';
      }
    }

    // 모달 출력
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
        val: parseFloat(item[key]) || 0
      }))
      .filter(item => item.keyName !== '전세계' && item.val > 0)
      .sort((a, b) => b.val - a.val);

    const index = sorted.findIndex(item => item.keyName === cleanKey);
    return index !== -1 ? `${index + 1}위` : '-';
  }
});
