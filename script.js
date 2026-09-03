document.addEventListener("DOMContentLoaded", function() {
  // 1. 현재 연도 메인 통합 API
  const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec";

  // 2. 항목별 전체 연도 시계열 API
  const API_URL_GDP = "https://script.google.com/macros/s/AKfycby615xcDIINI3ER0PuYnjGTlahZfxHVVB0IcCaLt8T1fs6xP6s4WEDCh-K7xF0aOu8gRg/exec";
  const API_URL_DEF = "https://script.google.com/macros/s/AKfycbzWJGsXLiZoqtRZZ9c-KLgD8TYbIHKE0pRQdMMioJUcwXN9Qh9OJKweTH_pmag73uOKPw/exec";
  const API_URL_CAP = "https://script.google.com/macros/s/AKfycbyLFzzbPTc9zJO5KIfkMSRF8-KZqMymmcC1pQcM702reQYa20h1NZ-QIe6sWa8lUULbiQ/exec";

  let mainData = [];
  let globalGdpData = [];
  let globalDefData = [];
  let globalCapData = [];
  let worldTotals = { gdp: 0, pop: 0, def: 0, cap: 0 };

  Promise.all([
    fetch(API_URL).then(res => res.json()).catch(() => null),
    fetch(API_URL_GDP).then(res => res.json()).catch(() => null),
    fetch(API_URL_DEF).then(res => res.json()).catch(() => null),
    fetch(API_URL_CAP).then(res => res.json()).catch(() => null)
  ])
  .then(([mainRes, gdpRes, defRes, capRes]) => {
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

    let cap = pop > 0 ? (gdp / pop) * 100000 : 0;
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

  // 연도 키('1934년', '1935년' 등) 추출 함수
  function getSortedYearKeys(seriesData) {
    if (!seriesData || seriesData.length === 0) return [];
    
    const sample = seriesData[0];
    const yearKeys = Object.keys(sample).filter(k => /^\d+년$/.test(k.trim()));

    return yearKeys.sort((a, b) => {
      const yearA = parseInt(a.replace('년', ''), 10);
      const yearB = parseInt(b.replace('년', ''), 10);
      return yearA - yearB;
    });
  }

  window.switchCategory = function(key, title, unitType, navBtnId) {
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

    // 1. 현재 연도 메인 데이터 정렬 (A열 '국가' 기준)
    let currentList = mainData.map(item => {
      let rawVal = parseFloat(item[key]) || 0;
      if (key === 'GDP(10억달러)' || key === '국방비(10억달러)') {
        rawVal *= 10;
      }
      return {
        country: (item['국가'] || '').trim(), // A열 국가명
        val: rawVal
      };
    }).filter(item => item.country !== '').sort((a, b) => b.val - a.val);

    // 2. 카테고리별 시계열 데이터 선택 및 직전 연도 순위 추출
    let targetSeriesData = [];
    if (key === 'GDP(10억달러)') targetSeriesData = globalGdpData;
    else if (key === '국방비(10억달러)') targetSeriesData = globalDefData;
    else if (key === '1인당GDP') targetSeriesData = globalCapData;

    const prevRankMap = new Map();

    if (targetSeriesData && targetSeriesData.length > 0) {
      const yearKeys = getSortedYearKeys(targetSeriesData);

      if (yearKeys.length >= 2) {
        const prevYearKey = yearKeys[yearKeys.length - 2]; // 직전 연도 열 (예: '1942년')

        let prevList = targetSeriesData.map(item => {
          let rawVal = parseFloat(item[prevYearKey]) || 0;
          if (key === 'GDP(10억달러)' || key === '국방비(10억달러)') {
            rawVal *= 10;
          }
          return {
            country: (item['국가'] || '').trim(), // A열 국가명
            val: rawVal
          };
        })
        .filter(item => item.country !== '' && item.val > 0)
        .sort((a, b) => b.val - a.val);

        // A열 국가명을 Key로 하여 직전 연도 순위 저장
        prevList.forEach((item, idx) => {
          prevRankMap.set(item.country, idx + 1);
        });
      }
    }

    // 3. 최종 데이터 바인딩 및 순위 변동 계산 (A열 국가명 기반)
    let listData = currentList.map((item, idx) => {
      const currentRank = idx + 1;
      const prevRank = prevRankMap.get(item.country);

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

    // 4. HTML DOM 렌더링
    listData.forEach((item, index) => {
      let formattedVal = "";
      if (unitType === '달러') {
        formattedVal = formatMoney(item.val);
      } else if (unitType === '명') {
        formattedVal = formatPopulation(item.val);
      } else if (unitType === '달러_직접') {
        formattedVal = `${Math.round(item.val).toLocaleString()} 달러`;
      }

      let rankDiffHtml = "";
      if (item.isWorld) {
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
          <span class="rank-num">${index + 1}.</span>
          ${rankDiffHtml}
          <span class="rank-country">${item.country}</span>
        </div>
        <span class="rank-val">${formattedVal}</span>
      `;
      listEl.appendChild(li);
    });
  };
});
