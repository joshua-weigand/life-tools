const STORAGE_KEY = 'retirementPlannerDataV6';
let chartInstance = null;

const CAP_GAINS_SHARE = 0.30;

const ORDINARY_BRACKETS = {
  single: [ [12400,0.10],[50400,0.12],[105700,0.22],[201775,0.24],[256225,0.32],[640600,0.35],[Infinity,0.37] ],
  hoh:    [ [17700,0.10],[67450,0.12],[105700,0.22],[201775,0.24],[256200,0.32],[640600,0.35],[Infinity,0.37] ],
  mfj:    [ [24800,0.10],[100800,0.12],[211400,0.22],[403550,0.24],[512450,0.32],[768700,0.35],[Infinity,0.37] ]
};
const STANDARD_DEDUCTION = { single: 16100, hoh: 24150, mfj: 32200 };
const SENIOR_EXTRA = { single: 2050, hoh: 2050, mfj: 1650 };
const OBBBA_SENIOR_DEDUCTION = 6000;
const OBBBA_PHASEOUT_START = { single: 75000, hoh: 75000, mfj: 150000 };
const CAP_GAINS_BRACKETS = {
  single: [49450, 545500],
  hoh: [66200, 579600],
  mfj: [98900, 613700]
};
const SS_PROVISIONAL_THRESHOLDS = {
  single: [25000, 34000],
  hoh: [25000, 34000],
  mfj: [32000, 44000]
};
const FILING_LABELS = { single: 'Single', hoh: 'Head of Household', mfj: 'Married Filing Jointly' };

function formatCurrency(num) {
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.round(Math.abs(num)).toLocaleString('en-US');
}

function calcTaxableSS(ss, otherIncome, filingStatus) {
  if (ss <= 0) return 0;
  const [lower, upper] = SS_PROVISIONAL_THRESHOLDS[filingStatus];
  const provisional = otherIncome + 0.5 * ss;
  if (provisional <= lower) return 0;
  const tier1 = Math.min(0.5 * (provisional - lower), 0.5 * ss);
  if (provisional <= upper) return tier1;
  const tier2 = 0.85 * (provisional - upper);
  return Math.min(0.85 * ss, tier1 + tier2);
}

function calcOrdinaryTaxByBracket(taxableIncome, filingStatus) {
  const rows = [];
  let prev = 0;
  for (const [limit, rate] of ORDINARY_BRACKETS[filingStatus]) {
    if (taxableIncome > prev) {
      const amt = Math.min(taxableIncome, limit) - prev;
      rows.push({ rate, amt, tax: amt * rate });
      prev = limit;
    } else break;
  }
  return rows;
}

function calcCapGainsTaxByBracket(ordinaryTaxableIncome, capGains, filingStatus) {
  const [zeroLimit, fifteenLimit] = CAP_GAINS_BRACKETS[filingStatus];
  const bands = [ [0, zeroLimit, 0.0], [zeroLimit, fifteenLimit, 0.15], [fifteenLimit, Infinity, 0.20] ];
  const rows = [];
  let incomeSoFar = ordinaryTaxableIncome, gainsLeft = capGains;
  for (const [lo, hi, rate] of bands) {
    if (gainsLeft <= 0) break;
    if (incomeSoFar >= hi) continue;
    const roomInBand = hi - Math.max(incomeSoFar, lo);
    const amt = Math.min(gainsLeft, roomInBand);
    if (amt > 0) {
      rows.push({ rate, amt, tax: amt * rate });
      gainsLeft -= amt;
      incomeSoFar += amt;
    }
  }
  return rows;
}

function renderBracketRows(container, rows, emptyText) {
  container.innerHTML = '';
  if (rows.length === 0) {
    container.innerHTML = `<div class="bracket-empty">${emptyText}</div>`;
    return;
  }
  const maxTax = Math.max(...rows.map(r => r.tax), 1);
  rows.forEach(r => {
    const div = document.createElement('div');
    div.className = 'bracket-row';
    const pct = Math.max(4, Math.round((r.tax / maxTax) * 100));
    div.innerHTML = `
      <div class="rate">${Math.round(r.rate * 100)}%</div>
      <div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-caption">${formatCurrency(r.amt)} taxed at this rate</div>
      </div>
      <div class="owed">${formatCurrency(r.tax)}</div>
    `;
    container.appendChild(div);
  });
}

function renderReferenceBrackets(filingStatus) {
  document.getElementById('refOrdinaryCaption').innerText = '2026 Ordinary Income Brackets — ' + FILING_LABELS[filingStatus];
  document.getElementById('refCapGainsCaption').innerText = '2026 Long-Term Capital Gains Brackets — ' + FILING_LABELS[filingStatus];

  const ordinaryBody = document.querySelector('#refOrdinaryTable tbody');
  ordinaryBody.innerHTML = '';
  let prev = 0;
  ORDINARY_BRACKETS[filingStatus].forEach(([limit, rate]) => {
    const rangeText = limit === Infinity ? `${formatCurrency(prev + 1)}+` : `${formatCurrency(prev + (prev===0?0:1))} – ${formatCurrency(limit)}`;
    ordinaryBody.innerHTML += `<tr><td>${Math.round(rate*100)}%</td><td>${rangeText}</td></tr>`;
    prev = limit;
  });

  const [zeroLimit, fifteenLimit] = CAP_GAINS_BRACKETS[filingStatus];
  const capBody = document.querySelector('#refCapGainsTable tbody');
  capBody.innerHTML = `
    <tr><td>0%</td><td>${formatCurrency(0)}</td></tr>
    <tr><td>15%</td><td>${formatCurrency(zeroLimit)}</td></tr>
    <tr><td>20%</td><td>${formatCurrency(fifteenLimit)}</td></tr>
  `;
}

function switchViewTab(view) {
  document.querySelectorAll('.view-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view-panel').forEach(p => p.classList.toggle('active', p.id === 'view-' + view));
  if (view === 'balance') {
    calculate();
  }
}

function openModal() { document.getElementById('settingsModal').showModal(); }
function closeModal() { document.getElementById('settingsModal').close(); }
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
}

function fieldIds() { return ['balance', 'growthRate', 'age', 'ss', 'filingStatus', 'withdrawalRate', 'additionalIncome']; }

function saveData() {
  try {
    const data = {};
    fieldIds().forEach(id => data[id] = document.getElementById(id).value);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { console.error('Could not save data', e); }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    fieldIds().forEach(id => { if (data[id] !== undefined) document.getElementById(id).value = data[id]; });
  } catch (e) { console.error('Could not load saved data', e); }
}

function resetData() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  document.getElementById('balance').value = 500000;
  document.getElementById('withdrawalRate').value = 4;
  document.getElementById('age').value = 65;
  document.getElementById('ss').value = 24000;
  document.getElementById('filingStatus').value = 'single';
  document.getElementById('growthRate').value = 6;
  document.getElementById('additionalIncome').value = 0;
  calculate();
}

function calculate() {
  const balance = parseFloat(document.getElementById('balance').value) || 0;
  const growthRate = (parseFloat(document.getElementById('growthRate').value) || 0) / 100;
  const age = parseFloat(document.getElementById('age').value) || 0;
  const ss = parseFloat(document.getElementById('ss').value) || 0;
  const filingStatus = document.getElementById('filingStatus').value;
  const withdrawalRate = (parseFloat(document.getElementById('withdrawalRate').value) || 0) / 100;
  const additionalIncome = parseFloat(document.getElementById('additionalIncome').value) || 0;
  saveData();

  document.getElementById('noteRate').innerText = (withdrawalRate * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  document.getElementById('noteGrowth').innerText = (growthRate * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  document.getElementById('noteFiling').innerText = FILING_LABELS[filingStatus];
  renderReferenceBrackets(filingStatus);

  const withdrawal = balance * withdrawalRate;
  const capGains = withdrawal * CAP_GAINS_SHARE;
  const otherOrdinaryIncome = (withdrawal - capGains) + additionalIncome;

  const taxableSS = calcTaxableSS(ss, otherOrdinaryIncome + capGains, filingStatus);
  const ordinaryWithdrawal = otherOrdinaryIncome + taxableSS;
  const totalIncome = withdrawal + additionalIncome + ss;

  document.getElementById('ssNote').innerText = ss > 0
    ? `${formatCurrency(taxableSS)} of your ${formatCurrency(ss)} Social Security is taxable this year, based on your total income.`
    : 'No Social Security entered.';

  document.getElementById('bracketSub').innerText =
    `What you'd owe this year, bracket by bracket — based on ${formatCurrency(totalIncome)} total annual income.`;

  const isSenior = age >= 65;
  let deduction = STANDARD_DEDUCTION[filingStatus];
  if (isSenior) {
    const approxAGI = ordinaryWithdrawal + capGains;
    const phaseoutStart = OBBBA_PHASEOUT_START[filingStatus];
    const obbba = Math.max(0, OBBBA_SENIOR_DEDUCTION - Math.max(0, (approxAGI - phaseoutStart) * 0.06));
    deduction += SENIOR_EXTRA[filingStatus] + obbba;
  }

  const ordinaryTaxableIncome = Math.max(0, ordinaryWithdrawal - deduction);
  const ordinaryRows = calcOrdinaryTaxByBracket(ordinaryTaxableIncome, filingStatus);
  const capGainsRows = calcCapGainsTaxByBracket(ordinaryTaxableIncome, capGains, filingStatus);

  const ordinaryTax = ordinaryRows.reduce((t, r) => t + r.tax, 0);
  const capGainsTax = capGainsRows.reduce((t, r) => t + r.tax, 0);
  const totalTax = ordinaryTax + capGainsTax;
  const netIncome = totalIncome - totalTax;

  renderBracketRows(document.getElementById('ordinaryBrackets'), ordinaryRows, 'No ordinary income tax owed — fully covered by the standard deduction.');
  renderBracketRows(document.getElementById('capGainsBrackets'), capGainsRows, 'No capital gains tax owed at this income level.');
  document.getElementById('resTotalTax').innerText = formatCurrency(totalTax);

  // --- Hero ---
  document.getElementById('heroMonthly').innerText = formatCurrency(netIncome / 12) + '/mo';
  document.getElementById('heroMonthlySub').innerText =
    formatCurrency(totalIncome) + '/yr total income, ' + formatCurrency(totalTax) + '/yr estimated tax';

  // --- 30-year projection ---
  const years = 30;
  const ages = [], startBalances = [], withdrawals = [], growths = [], endBalances = [];
  let currentBalance = balance;
  let depletionAge = null;

  for (let yr = 1; yr <= years; yr++) {
    const start = currentBalance;
    const actualWithdrawal = Math.min(start, withdrawal);
    const growth = (start - actualWithdrawal) * growthRate;
    const end = Math.max(0, start - actualWithdrawal + growth);
    const currentAge = age + yr;

    ages.push(currentAge);
    startBalances.push(start); withdrawals.push(actualWithdrawal); growths.push(growth); endBalances.push(end);

    if (depletionAge === null && end <= 0 && start > 0) depletionAge = currentAge;
    currentBalance = end;
  }

  const heroLongevity = document.getElementById('heroLongevity');
  const heroLongevitySub = document.getElementById('heroLongevitySub');
  if (depletionAge !== null) {
    heroLongevity.innerText = 'Age ' + depletionAge;
    heroLongevitySub.innerText = (depletionAge - age) + ' years from now, at this withdrawal rate';
  } else {
    heroLongevity.innerText = '30+ years';
    heroLongevitySub.innerText = 'projected to outlast this 30-year window';
  }

  // --- Table ---
  const tbody = document.getElementById('projectionBody');
  tbody.innerHTML = '';
  for (let i = 0; i < years; i++) {
    const row = document.createElement('tr');
    if (endBalances[i] <= 0 && startBalances[i] > 0) row.classList.add('depleted-row');
    row.innerHTML = `<td>Age ${ages[i]}</td><td>${formatCurrency(startBalances[i])}</td><td>${formatCurrency(withdrawals[i])}</td><td>${formatCurrency(growths[i])}</td><td>${formatCurrency(endBalances[i])}</td>`;
    tbody.appendChild(row);
  }

  renderChart(ages, endBalances);
}

function renderChart(ages, endBalances) {
  const canvas = document.getElementById('burndownChart');
  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<p class="hint">Chart library failed to load — check your connection and reload.</p>';
    return;
  }
  const ctx = canvas.getContext('2d');
  const labels = ages.map(a => 'Age ' + a);
  const styles = getComputedStyle(document.documentElement);
  const inkColor = styles.getPropertyValue('--ink').trim();
  const softColor = styles.getPropertyValue('--ink-soft').trim();
  const borderColor = styles.getPropertyValue('--border').trim();

  const gradient = ctx.createLinearGradient(0, 0, 0, 380);
  gradient.addColorStop(0, softColor + '3a');
  gradient.addColorStop(1, softColor + '05');

  try {
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{
        label: 'Balance', data: endBalances, borderColor: inkColor, backgroundColor: gradient,
        fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2.5
      }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => formatCurrency(item.parsed.y) } } },
        scales: {
          x: { ticks: { color: softColor, maxTicksLimit: 10 }, grid: { color: borderColor } },
          y: { ticks: { color: softColor, callback: (v) => '$' + (v / 1000) + 'k' }, grid: { color: borderColor } }
        }
      }
    });
  } catch (e) {
    console.error('Chart render failed', e);
  }
}

loadData();
calculate();