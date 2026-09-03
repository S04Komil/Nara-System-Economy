document.addEventListener("DOMContentLoaded", function() {
  // 3개의 독립된 Apps Script API URL 설정
  const API_URL_GDP = "https://script.google.com/macros/s/AKfycby615xcDIINI3ER0PuYnjGTlahZfxHVVB0IcCaLt8T1fs6xP6s4WEDCh-K7xF0aOu8gRg/execc";
  const API_URL_DEF = "https://script.google.com/macros/s/AKfycbzWJGsXLiZoqtRZZ9c-KLgD8TYbIHKE0pRQdMMioJUcwXN9Qh9OJKweTH_pmag73uOKPw/exec";
  const API_URL_CAP = "https://script.google.com/macros/s/AKfycbyLFzzbPTc9zJO5KIfkMSRF8-KZqMymmcC1pQcM702reQYa20h1NZ-QIe6sWa8lUULbiQ/exec";

  // 각각의 스프레드시트 데이터를 담을 전역 변수 분리
  let globalGdpData = [];
  let globalDefData = [];
  let globalCapData = [];
  let currentSheetYear = "";

  let worldTotals = { gdp: 0, pop: 0, def: 0, cap: 0 };

  // 3개의 API를 병렬로 동시 호출
  Promise.all([
    fetch(API_URL_GDP).then(res => res.json()).catch(() => null),
    fetch(API_URL_DEF).then(res => res.json()).catch(() => null),
    fetch(API_URL_CAP).then(res => res.json()).catch(() => null)
  ])
  .then(([gdpRes, defRes, capRes]) => {
    document.getElementById('loading').style.display = 'none';

    globalGdpData = gdpRes ? (gdpRes.data || gdpRes) : [];
    globalDefData = defRes ? (defRes.data || defRes) : [];
    globalCapData = capRes ? (capRes.data || capRes) : [];

    // 기준 연도 설정 (GDP 응답 기준)
    if (gdpRes && gdpRes.sheetName) {
      currentSheetYear = gdpRes.sheetName;
      document.getElementById('data-year').innerText = `${currentSheetYear}년 기준`;
    } else {
      document.getElementById('data-year').innerText = `최신 데이터 기준`;
    }

    document.getElementById('dashboard').style.display = 'block';

    calculateWorldTotals();
    renderMainCards();
    renderWorldStats();
  })
  .catch(error => {
    console.error('Data Fetch Error:', error);
    document.getElementById('loading').innerText = '데이터를 불러오는 데 실패했습니다.';
  });

  function calculateWorldTotals() {
    let gdp = 0, pop = 0, def = 0;

    // GDP 합산 (10배 적용)
    globalGdpData.forEach(item => {
      gdp += ((parseFloat(item['GDP(10억달러)']) || parseFloat(item['값']) || 0) * 10);
      pop += (parseFloat(item['인구(만명)']) || 0);
    });

    // 국방비 합산 (10배 적용)
    globalDefData.forEach(item => {
      def += ((parseFloat(item['국방비(10억달러)']) || parseFloat(item['값']) || 0) * 10);
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

  function getTopItem(dataset, key) {
    if (!dataset || dataset.length === 0) return { 국가: '-', val: 0 };
    return dataset.reduce((max, item) => {
      const val = parseFloat(item[key] || item['값']) || 0;
      const maxVal = parseFloat(max[key] || max['값']) || 0;
      return val > maxVal ? item : max;
    }, dataset[0]);
  }

  function renderMainCards() {
    const topGdp = getTopItem(globalGdpData, 'GDP(10억달러)');
    const topDef = getTopItem(globalDefData, '국방비(10억달러)');
    const topPop = getTopItem(globalGdpData, '인구(만명)');
    const topCap = getTopItem(globalCapData, '1인당GDP');

    document.getElementById('top-gdp-country').innerText = topGdp['국가'] || '-';
    document.getElementById('top-gdp-val').innerText = formatMoney(((parseFloat(topGdp['GDP(10억달러)'] || topGdp['값']) || 0) * 10));

    document.getElementById('top-def-country').innerText = topDef['국가'] || '-';
    document.getElementById('top-def-val').innerText = formatMoney(((parseFloat(topDef['국방비(10억달러)'] || topDef['값']) || 0) * 10));

    document.getElementById('top-pop-country').innerText = topPop['국가'] || '-';
    document.getElementById('top-pop-val').innerText = formatPopulation(parseFloat(topPop['인구(만명)']) || 0);

    document.getElementById('top-cap-country').innerText = topCap['국가'] || '-';
    document.getElementById('top-cap-val').innerText = `${Math.round(parseFloat(topCap['1인당GDP'] || topCap['값']) || 0).toLocaleString()} 달러`;
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

    // 선택된 카테고리에 맞는 전역 변수 데이터셋 선택
    let targetDataset = [];
    let isMultiplyTen = false;

    if (key === 'GDP(10억달러)') {
      targetDataset = globalGdpData;
      isMultiplyTen = true;
    } else if (key === '국방비(10억달러)') {
      targetDataset = globalDefData;
      isMultiplyTen = true;
    } else if (key === '1인당GDP') {
      targetDataset = globalCapData;
    } else if (key === '인구(만명)') {
      targetDataset = globalGdpData;
    }

    let totalBaseVal = 0;
    if (key === 'GDP(10억달러)') totalBaseVal = worldTotals.gdp;
    else if (key === '인구(만명)') totalBaseVal = worldTotals.pop;
    else if (key === '국방비(10억달러)') totalBaseVal = worldTotals.def;

    // 1. 현재 연도 순위 계산용 리스트 구성
    let currentList = targetDataset.map(item => {
      let rawVal = parseFloat(item[key] || item['값']) || 0;
      if (isMultiplyTen) rawVal *= 10;

      let rawPrevVal = item['prevVal'] !== undefined ? parseFloat(item['prevVal']) : null;
      if (rawPrevVal !== null && isMultiplyTen) rawPrevVal *= 10;

      return {
        country: item['국가'] || 'N/A',
        categoryGroup: item['카테고리'] || item['국가'], // 국가명이 바뀌어도 동일 그룹으로 추적
        val: rawVal,
        prevVal: rawPrevVal
      };
    }).sort((a, b) => b.val - a.val);

    // 2. 직전 연도 순위 Map 생성
    let prevList = currentList
      .filter(item => item.prevVal !== null && !isNaN(item.prevVal))
      .map(item => ({ categoryGroup: item.categoryGroup, val: item.prevVal }))
      .sort((a, b) => b.val - a.val);

    const prevRankMap = new Map();
    prevList.forEach((item, idx) => {
      prevRankMap.set(item.categoryGroup, idx + 1);
    });

    // 3. 현재 순위 및 직전 순위 매핑
    let listData = currentList.map((item, idx) => {
      const currentRank = idx + 1;
      const prevRank = prevRankMap.get(item.categoryGroup);

      return {
        country: item.country,
        val: item.val,
        currentRank: currentRank,
        prevRank: prevRank || null,
        isWorld: false
      };
    });

    // 1인당 GDP일 경우 '전세계' 항목 추가
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

    // 4. 화면 출력
    listData.forEach((item, index) => {
      let formattedVal = "";
      if (unitType === '달러') {
        formattedVal = formatMoney(item.val);
      } else if (unitType === '명') {
        formattedVal = formatPopulation(item.val);
      } else if (unitType === '달러_직접') {
        formattedVal = `${Math.round(item.val).toLocaleString()} 달러`;
      }

      // 순위 변동 배지
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

      // 프로그레스 바 계산
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
