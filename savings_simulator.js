const COLORS = ['#4f46e5', '#10b981', '#f59e0b'];
const PERIODS = [36, 60, 120]; // 3년, 5년, 10년 (개월)
const PERIOD_LABELS = ['3년 후', '5년 후', '10년 후'];

/* ── 포맷 헬퍼 ── */
function fmtFull(n) {
  return Math.round(n).toLocaleString() + '원';
}

function fmtShort(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e8) {
    const uk = Math.floor(abs / 1e8);
    const man = Math.round((abs % 1e8) / 1e4);
    return sign + uk + '억' + (man > 0 ? ' ' + man + '만' : '');
  }
  if (abs >= 1e4) return sign + Math.round(abs / 1e4).toLocaleString() + '만원';
  return sign + Math.round(abs).toLocaleString() + '원';
}

/* ── 계산 ── */

/**
 * 월 복리 적립 시리즈 계산
 * FV = P × ((1+r)^n - 1) / r  +  initial × (1+r)^n
 */
function calcSeries(monthly, initial, annualRate, months) {
  const r = annualRate / 100 / 12;
  const data = [];
  for (let m = 0; m <= months; m++) {
    let fv;
    if (r === 0) {
      fv = initial + monthly * m;
    } else {
      fv = monthly * ((Math.pow(1 + r, m) - 1) / r) + initial * Math.pow(1 + r, m);
    }
    data.push(fv);
  }
  return data;
}

/** 인플레이션 할인 계수: m개월 후의 물가 상승 배수 */
function inflFactor(inflationRate, months) {
  return Math.pow(1 + inflationRate / 100 / 12, months);
}

/** 실질 자산 시리즈: 명목 자산을 오늘 돈 가치로 환산 */
function calcRealSeries(nominalSeries, inflationRate) {
  return nominalSeries.map((v, m) => v / inflFactor(inflationRate, m));
}

/* ── 전역 상태 ── */
let _simState = null;

/* ── 메인 시뮬레이션 ── */
function simulate() {
  const monthly   = parseFloat(document.getElementById('monthly').value)   || 0;
  const initial   = parseFloat(document.getElementById('initial').value)   || 0;
  const inflation = parseFloat(document.getElementById('inflation').value) ?? 2.5;
  const rates = [
    parseFloat(document.getElementById('rate1').value),
    parseFloat(document.getElementById('rate2').value),
    parseFloat(document.getElementById('rate3').value),
  ].filter(r => !isNaN(r) && r >= 0);

  if (rates.length === 0) return;

  const MAX_MONTHS = 120;
  const seriesList     = rates.map(r => calcSeries(monthly, initial, r, MAX_MONTHS));
  const realSeriesList = seriesList.map(s => calcRealSeries(s, inflation));

  _simState = { monthly, initial, inflation, rates, seriesList, realSeriesList, MAX_MONTHS };

  renderSummary(rates, seriesList, monthly, initial, MAX_MONTHS);
  renderInflCard(rates, seriesList, realSeriesList, monthly, initial, inflation, 0);
  renderTable(rates, seriesList, monthly, initial);
  renderChart(rates, seriesList, realSeriesList, inflation, MAX_MONTHS);

  ['summaryCard', 'inflCard', 'chartCard', 'tableCard'].forEach(id => {
    document.getElementById(id).classList.remove('hidden');
  });

  document.getElementById('summaryCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── 요약 카드 렌더링 ── */
function renderSummary(rates, seriesList, monthly, initial, months) {
  const principal = initial + monthly * months;
  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = '';

  const pc = document.createElement('div');
  pc.className = 'summary-item';
  pc.innerHTML = `
    <div class="s-label">10년간 납입 원금</div>
    <div class="s-val">${fmtShort(principal)}</div>
    <div class="s-sub">초기 ${fmtShort(initial)} + 월 ${fmtShort(monthly)} × 120개월</div>
  `;
  grid.appendChild(pc);

  rates.forEach((rate, i) => {
    const fv     = seriesList[i][months];
    const profit = fv - principal;
    const el = document.createElement('div');
    el.className = 'summary-item';
    el.style.background = COLORS[i] + '18';
    el.innerHTML = `
      <div class="s-label" style="color:${COLORS[i]}">
        <span class="rate-dot" style="background:${COLORS[i]}"></span>연 ${rate}% 수익률
      </div>
      <div class="s-val">${fmtShort(fv)}</div>
      <div class="s-sub" style="color:#10b981;font-weight:600">+${fmtShort(profit)} 수익</div>
    `;
    grid.appendChild(el);
  });
}

/* ── 인플레이션 분석 카드 렌더링 ── */
function renderInflCard(rates, seriesList, realSeriesList, monthly, initial, inflation, periodIdx) {
  const tabsEl = document.getElementById('inflTabs');
  tabsEl.innerHTML = PERIOD_LABELS.map((label, i) => `
    <button class="tab-btn ${i === periodIdx ? 'active' : ''}" onclick="switchInflPeriod(${i})">${label}</button>
  `).join('');

  const months    = PERIODS[periodIdx];
  const principal = initial + monthly * months;

  const grid = document.getElementById('inflGrid');
  grid.innerHTML = '';

  rates.forEach((rate, i) => {
    const nomFV      = seriesList[i][months];
    const realFV     = realSeriesList[i][months];
    const realProfit = realFV - principal;
    const nomProfit  = nomFV - principal;
    const isGain     = realProfit >= 0;
    const realRate   = rate - inflation;

    const card = document.createElement('div');
    card.className = 'infl-card';
    card.style.borderColor = COLORS[i] + '66';
    card.innerHTML = `
      <div class="infl-card-header">
        <span class="rate-label" style="color:${COLORS[i]}">
          <span class="rate-dot" style="background:${COLORS[i]}"></span>연 ${rate}% 수익률
        </span>
        <span class="badge ${isGain ? 'badge-gain' : 'badge-loss'}">
          ${isGain ? '▲ 실질 이득' : '▼ 실질 손해'}
        </span>
      </div>
      <div class="infl-row">
        <span class="r-label">납입 원금</span>
        <span class="r-val">${fmtFull(principal)}</span>
      </div>
      <div class="infl-row">
        <span class="r-label">명목 자산 (장부상)</span>
        <span class="r-val" style="color:${COLORS[i]}">${fmtFull(nomFV)}</span>
      </div>
      <div class="infl-row">
        <span class="r-label">명목 수익</span>
        <span class="r-val profit">+${fmtFull(nomProfit)}</span>
      </div>
      <hr class="infl-divider"/>
      <div class="infl-row">
        <span class="r-label">물가 상승 배수</span>
        <span class="r-val">×${inflFactor(inflation, months).toFixed(3)}</span>
      </div>
      <div class="infl-row">
        <span class="r-label">실질 자산 (오늘 가치)</span>
        <span class="r-val">${fmtFull(realFV)}</span>
      </div>
      <hr class="infl-divider"/>
      <div class="infl-row highlight">
        <span class="r-label">실질 이득 / 손해</span>
        <span class="r-val ${isGain ? 'gain-val' : 'loss-val'}">
          ${isGain ? '+' : ''}${fmtFull(realProfit)}
        </span>
      </div>
      <div class="infl-row" style="margin-top:-4px;">
        <span class="r-label" style="font-size:0.76rem;">실질 수익률 (근사)</span>
        <span class="r-val" style="font-size:0.82rem;color:${realRate >= 0 ? '#15803d' : '#b91c1c'}">
          연 ${realRate.toFixed(1)}% (${rate}% − ${inflation}%)
        </span>
      </div>
    `;
    grid.appendChild(card);
  });

  document.getElementById('inflNote').innerHTML =
    `* 실질 자산 = 명목 자산 ÷ (1 + ${inflation}%/12)<sup>${months}</sup> &nbsp;|&nbsp; 실질 이득/손해 = 실질 자산 − 납입 원금`;
}

function switchInflPeriod(idx) {
  if (!_simState) return;
  const { rates, seriesList, realSeriesList, monthly, initial, inflation } = _simState;
  renderInflCard(rates, seriesList, realSeriesList, monthly, initial, inflation, idx);
}

/* ── 기간별 테이블 렌더링 ── */
function renderTable(rates, seriesList, monthly, initial) {
  const head = document.getElementById('tableHead');
  const body = document.getElementById('tableBody');

  head.innerHTML = '<th>기간</th><th>납입 원금</th>' +
    rates.map((r, i) =>
      `<th><span class="rate-dot" style="background:${COLORS[i]}"></span>연 ${r}%</th>`
    ).join('');

  body.innerHTML = '';

  PERIODS.forEach((months, pi) => {
    const principal = initial + monthly * months;
    const tr = document.createElement('tr');
    let html = `<td>${PERIOD_LABELS[pi]}</td><td>${fmtFull(principal)}</td>`;

    rates.forEach((rate, i) => {
      const fv     = seriesList[i][months];
      const profit = fv - principal;
      html += `
        <td>
          <span class="val-main" style="color:${COLORS[i]}">${fmtFull(fv)}</span>
          <span class="val-sub profit">+${fmtShort(profit)}</span>
        </td>`;
    });

    tr.innerHTML = html;
    body.appendChild(tr);
  });
}

/* ── Canvas 차트 렌더링 ── */
function renderChart(rates, seriesList, realSeriesList, inflation, maxMonths) {
  const canvas = document.getElementById('chartCanvas');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 800;
  const H = 340;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const PAD   = { top: 20, right: 30, bottom: 48, left: 80 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top  - PAD.bottom;

  const allVals = seriesList.flatMap(s => s);
  const maxVal  = Math.max(...allVals) * 1.05;

  function xPos(month) { return PAD.left + (month / maxMonths) * plotW; }
  function yPos(val)   { return PAD.top + plotH - (val / maxVal) * plotH; }

  // 배경
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Y축 그리드 & 눈금
  const yTicks = 5;
  ctx.font      = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= yTicks; i++) {
    const val = (maxVal / yTicks) * i;
    const y   = yPos(val);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(fmtShort(val), PAD.left - 8, y + 4);
  }

  // X축 눈금 (연 단위)
  ctx.textAlign = 'center';
  for (let m = 0; m <= maxMonths; m += 12) {
    const x = xPos(m);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top + plotH);
    ctx.lineTo(x, PAD.top + plotH + 5);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(m / 12 + '년', x, PAD.top + plotH + 18);
  }

  // 3년/5년/10년 세로 마커
  PERIODS.forEach((m, pi) => {
    const x = xPos(m);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#c7d2fe';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, PAD.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#6366f1';
    ctx.font      = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(PERIOD_LABELS[pi], x, PAD.top - 6);
  });

  // 납입 원금 기준선 (점선)
  const monthly = parseFloat(document.getElementById('monthly').value) || 0;
  const initial = parseFloat(document.getElementById('initial').value) || 0;
  ctx.beginPath();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth   = 1.5;
  ctx.moveTo(xPos(0),         yPos(initial));
  ctx.lineTo(xPos(maxMonths), yPos(initial + monthly * maxMonths));
  ctx.stroke();
  ctx.setLineDash([]);

  // 명목 자산 라인
  rates.forEach((rate, i) => {
    const series = seriesList[i];
    ctx.beginPath();
    ctx.moveTo(xPos(0), yPos(series[0]));
    for (let m = 1; m <= maxMonths; m++) {
      ctx.lineTo(xPos(m), yPos(series[m]));
    }
    ctx.strokeStyle = COLORS[i];
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // 기간 포인트 점
    PERIODS.forEach(m => {
      ctx.beginPath();
      ctx.arc(xPos(m), yPos(series[m]), 5, 0, Math.PI * 2);
      ctx.fillStyle   = COLORS[i];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2;
      ctx.stroke();
    });
  });

  // 실질 자산 점선 라인
  realSeriesList.forEach((realSeries, i) => {
    ctx.beginPath();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle  = COLORS[i];
    ctx.lineWidth    = 1.5;
    ctx.globalAlpha  = 0.5;
    ctx.moveTo(xPos(0), yPos(realSeries[0]));
    for (let m = 1; m <= maxMonths; m++) {
      ctx.lineTo(xPos(m), yPos(realSeries[m]));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });

  // 범례
  const legendEl = document.getElementById('legend');
  legendEl.innerHTML = rates.map((r, i) => `
    <div class="legend-item">
      <div class="legend-line" style="background:${COLORS[i]}"></div>
      <span>연 ${r}% (명목)</span>
    </div>
    <div class="legend-item">
      <div class="legend-line" style="background:${COLORS[i]};opacity:0.45;"></div>
      <span style="color:${COLORS[i]};opacity:0.7;">연 ${r}% (실질)</span>
    </div>
  `).join('') + `
    <div class="legend-item">
      <div class="legend-line" style="background:#94a3b8;"></div>
      <span style="color:#94a3b8">납입 원금</span>
    </div>
  `;
}

/* ── 이벤트 바인딩 ── */
document.querySelectorAll('input').forEach(inp => {
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') simulate(); });
});

window.addEventListener('load', () => simulate());

window.addEventListener('resize', () => {
  if (_simState && !document.getElementById('tableCard').classList.contains('hidden')) {
    const { rates, seriesList, realSeriesList, inflation, MAX_MONTHS } = _simState;
    renderChart(rates, seriesList, realSeriesList, inflation, MAX_MONTHS);
  }
});
