document.addEventListener("DOMContentLoaded", function() {
  const API_URL = "https://script.google.com/macros/s/AKfycbwzCrizZQcL3x4aL_0qLm3JfprRCvqoHro5agto1ish_FjAGjPeeWn_-dC6DW1zN9Cl/exec";

  let globalData = [];

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

      // 시트 이름(연도) 반영
      if (sheetName) {
        document.getElementById('data-year').innerText = `${sheetName}년 기준`;
      } else {
        document.getElementById('data-year').innerText = `최신 데이터 기준`;
      }

      renderMainCards(data);
      renderWorldStats(data);
    })
    .catch(error => {
      console.error('Error:', error);
      document.getElementById('loading').innerText = '데이터를 불러오는 데 실패했습니다.';
    });

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

  function renderWorldStats(data) {
    if (!data || data.length === 0) return;

    let totalGdp = 0;
    let totalPop = 0;
    let totalDef = 0;

    data.forEach(item => {
      totalGdp += parseFloat(item['GDP(10억달러)']) || 0;
      totalPop += parseFloat(item['인구(만명)']) || 0;
      totalDef += parseFloat(item['국방비(10억달러)']) || 0;
    });

    document.getElementById('world-gdp').innerText = formatMoney(totalGdp);
    document.getElementById('world-pop').innerText = formatPopulation(totalPop);
    document.getElementById('world-def').innerText = formatMoney(totalDef);

    if (totalPop > 0) {
      let perCapitaGdp = (totalGdp / totalPop) * 100000;
      document.getElementById('world-cap').innerText = `${Math.round(perCapitaGdp).toLocaleString()} 달러`;
    } else {
      document.getElementById('world-cap').innerText = '-';
    }
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
    if(navBtnId) {
      document.getElementById(navBtnId).classList.add('active');
    }

    const listEl = document.getElementById('rank-list');
    listEl.innerHTML = '';

    // 상위 10개만 자르던 .slice(0, 10)을 제거하여 전체 순위 표시
    const sortedData = [...globalData]
      .sort((a, b) => (parseFloat(b[key]) || 0) - (parseFloat(a[key]) || 0));

    sortedData.forEach((item, index) => {
      const rawVal = parseFloat(item[key]) || 0;
      let formattedVal = "";

      if (unitType === '달러') {
        formattedVal = formatMoney(rawVal);
      } else if (unitType === '명') {
        formattedVal = formatPopulation(rawVal);
      } else if (unitType === '달러_직접') {
        formattedVal = `${Math.round(rawVal).toLocaleString()} 달러`;
      }

      const li = document.createElement('li');
      li.className = 'rank-item';
      li.innerHTML = `
        <span class="rank-num">${index + 1}.</span>
        <span class="rank-country">${item['국가'] || 'N/A'}</span>
        <span class="rank-val">${formattedVal}</span>
      `;
      listEl.appendChild(li);
    });
  };
});
