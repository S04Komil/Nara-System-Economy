document.addEventListener("DOMContentLoaded", function() {
  const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec";

  let globalData = [];
  let worldTotals = { gdp: 0, pop: 0, def: 0, cap: 0 };

  fetch(API_URL)
    .then(response => response.json())
    .then(res => {
      document.getElementById('loading').style.display = 'none';

      let data = res.data || res;
      let sheetName = res.sheetName || (data[0] ? (data[0]['연도'] || data[0]['year']) : null);

      if (!data || data.length === 0) {
        document.getElementById('loading').innerText = '불러올 데이터가 없습니다.';
        document.getElementById('loading').style.display = 'block';
        return;
      }

      globalData = data;
      document.getElementById('dashboard').style.display = 'block';

      if (sheetName) {
        document.getElementById('data-year').innerText = `${sheetName}년 기준`;
      } else {
        document.getElementById('data-year').innerText = `최신 데이터 기준`;
      }

      calculateWorldTotals(data);
      renderMainCards(data);
      renderWorldStats();
    })
    .catch(error => {
      console.error('Error:', error);
      document.getElementById('loading').innerText = '데이터를 불러오는 데 실패했습니다.';
    });

  function calculateWorldTotals(data) {
    let gdp = 0, pop = 0, def = 0;
    data.forEach(item => {
      gdp += parseFloat(item['GDP(10억달러)']) || 0;
      pop += parseFloat(item['인구(만명)']) || 0;
      def += parseFloat(item['국방비(10억달러)']) || 0;
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
    document.getElementById('top-gdp-val').innerText = formatMoney(topGdp['GDP(10억달러)']);

    document.getElementById('top-def-country').innerText = topDef['국가'] || '-';
    document.getElementById('top-def-val').innerText = formatMoney(topDef['국방비(10억달러)']);

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

    // 기준 세계 총 값 및 최대값 설정 (바 백분율 계산용)
    let totalBaseVal = 0;
    if (key === 'GDP(10억달러)') totalBaseVal = worldTotals.gdp;
    else if (key === '인구(만명)') totalBaseVal = worldTotals.pop;
    else if (key === '국방비(10억달러)') totalBaseVal = worldTotals.def;

    let listData = globalData.map(item => ({
      country: item['국가'] || 'N/A',
      val: parseFloat(item[key]) || 0,
      isWorld: false
    }));

    // 1인당 GDP 선택 시 목록에 '전세계' 항목 추가
    if (key === '1인당GDP') {
      listData.push({
        country: '전세계',
        val: worldTotals.cap,
        isWorld: true
      });
    }

    // 값 내림차순 정렬
    listData.sort((a, b) => b.val - a.val);

    // 1인당 GDP의 바 비율 계산 기준 (최대값)
    const maxValInList = listData.length > 0 ? listData[0].val : 1;

    listData.forEach((item, index) => {
      let formattedVal = "";
      if (unitType === '달러') {
        formattedVal = formatMoney(item.val);
      } else if (unitType === '명') {
        formattedVal = formatPopulation(item.val);
      } else if (unitType === '달러_직접') {
        formattedVal = `${Math.round(item.val).toLocaleString()} 달러`;
      }

      // 프로그레스 바 백분율 계산
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
        <div>
          <span class="rank-num">${index + 1}.</span>
          <span class="rank-country">${item.country}</span>
        </div>
        <span class="rank-val">${formattedVal}</span>
      `;
      listEl.appendChild(li);
    });
  };
});
