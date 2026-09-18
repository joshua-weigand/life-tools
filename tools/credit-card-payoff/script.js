const $ = id => document.getElementById(id);
let chartInstance;
let currentView = 'compare';
let cardCount = 0;

const defaultCards = [
  { name: 'Card 1', balance: 4500, apr: 22.99, minPayment: 110 },
  { name: 'Card 2', balance: 2200, apr: 19.99, minPayment: 60 }
];

function fmt(n) { return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); }
function fmt2(n) { return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }); }

function addCardRow(data) {
  cardCount++;
  const id = cardCount;
  const container = $('cardsContainer');
  const row = document.createElement('div');
  row.className = 'card-row';
  row.dataset.id = id;
  
  // Styling matching the standard inputs-bar layout
  row.style.display = 'grid';
  row.style.gridTemplateColumns = 'repeat(auto-fit, minmax(160px, 1fr))';
  row.style.gap = '14px';
  row.style.padding = '18px';
  row.style.border = '1px solid var(--border)';
  row.style.borderRadius = '8px';
  row.style.position = 'relative';
  row.style.background = 'var(--paper)';

  row.innerHTML = `
    <button class="ghost remove-btn" title="Remove card" style="position: absolute; top: 12px; right: 12px; padding: 2px 8px; font-size: 16px; border: none; background: transparent; color: #9B2C2C; cursor: pointer;">&times;</button>
    <div class="field" style="margin-bottom: 0;">
      <label>Card Name</label>
      <input type="text" class="c-name" value="${data.name}">
    </div>
    <div class="field" style="margin-bottom: 0;">
      <label>Balance ($)</label>
      <input type="number" class="c-balance" value="${data.balance}" min="0" step="50">
    </div>
    <div class="field" style="margin-bottom: 0;">
      <label>APR (%)</label>
      <input type="number" class="c-apr" value="${data.apr}" min="0" max="60" step="0.1">
    </div>
    <div class="field" style="margin-bottom: 0;">
      <label>Min Payment ($)</label>
      <input type="number" class="c-min" value="${data.minPayment}" min="0" step="5">
    </div>
  `;
  container.appendChild(row);

  row.querySelector('.remove-btn').addEventListener('click', () => {
    row.remove();
    update();
  });
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', update));
}

$('addCardBtn').addEventListener('click', () => {
  addCardRow({ name: `Card ${cardCount + 1}`, balance: 1000, apr: 24.99, minPayment: 35 });
  update();
});

$('extra').addEventListener('input', update);$('strategy').addEventListener('change', update);

function resetData() {
  $('extra').value = 150;
  $('strategy').value = 'avalanche';$('cardsContainer').innerHTML = '';
  cardCount = 0;
  defaultCards.forEach(addCardRow);
  update();
}

function readCards() {
  const rows = document.querySelectorAll('.card-row');
  const cards = [];
  rows.forEach(row => {
    const name = row.querySelector('.c-name').value || 'Card';
    const balance = parseFloat(row.querySelector('.c-balance').value) || 0;
    const apr = parseFloat(row.querySelector('.c-apr').value) || 0;
    const minPayment = parseFloat(row.querySelector('.c-min').value) || 0;
    if (balance > 0) {
      cards.push({ name, balance, apr, minRatio: balance > 0 ? minPayment / balance : 0.02, id: Math.random() });
    }
  });
  return cards;
}

function orderCards(cards, strat) {
  const arr = [...cards];
  if (strat === 'avalanche') arr.sort((a, b) => b.apr - a.apr);
  else if (strat === 'snowball') arr.sort((a, b) => a.balance - b.balance);
  return arr;
}

const MAX_MONTHS = 600;
const MIN_FLOOR = 25;

function simulate(cardsInput, extra, order, useExtra) {
  let cards = cardsInput.map(c => ({ ...c, balance: c.balance }));
  const initialMinSum = cards.reduce((s, c) => s + Math.max(c.balance * c.minRatio, MIN_FLOOR), 0);
  const budget = useExtra ? (initialMinSum + extra) : null;

  let months = 0;
  let totalInterest = 0;
  const perCardBalanceHistory = []; 
  const totalHistory = []; 
  const payoffMonth = {}; 

  while (cards.some(c => c.balance > 0.005) && months < MAX_MONTHS) {
    months++;
    let monthInterest = 0;
    let monthPayment = 0;

    // Accrue interest
    cards.forEach(c => {
      if (c.balance > 0) {
        const interest = c.balance * (c.apr / 100) / 12;
        c.balance += interest;
        monthInterest += interest;
      }
    });

    if (!useExtra) {
      cards.forEach(c => {
        if (c.balance > 0) {
          const due = Math.min(c.balance, Math.max(c.balance * c.minRatio, MIN_FLOOR));
          c.balance -= due;
          monthPayment += due;
          if (c.balance <= 0.005 && payoffMonth[c.name] === undefined) payoffMonth[c.name] = months;
        }
      });
    } else {
      let remainingBudget = budget;
      cards.forEach(c => {
        if (c.balance > 0) {
          const due = Math.min(c.balance, Math.max(c.balance * c.minRatio, MIN_FLOOR));
          c.balance -= due;
          monthPayment += due;
          remainingBudget -= due;
        }
      });
      // Allocate remaining budget using selected strategy
      for (const target of order) {
        const c = cards.find(x => x.name === target.name);
        if (c && c.balance > 0 && remainingBudget > 0) {
          const pay = Math.min(c.balance, remainingBudget);
          c.balance -= pay;
          monthPayment += pay;
          remainingBudget -= pay;
        }
        if (remainingBudget <= 0) break;
      }
      cards.forEach(c => {
        if (c.balance <= 0.005 && payoffMonth[c.name] === undefined) payoffMonth[c.name] = months;
      });
    }

    totalInterest += monthInterest;
    const totalBalance = cards.reduce((s, c) => s + Math.max(c.balance, 0), 0);
    totalHistory.push({ month: months, totalBalance, monthInterest, monthPayment, cumInterest: totalInterest });

    const snap = {};
    cards.forEach(c => snap[c.name] = Math.max(c.balance, 0));
    perCardBalanceHistory.push(snap);
  }

  const negativeAmortization = cards.some(c => {
    const minDue = Math.max(c.balance * c.minRatio, MIN_FLOOR);
    return minDue <= c.balance * (c.apr / 100) / 12 + 0.01 && c.balance > 0;
  }) && months >= MAX_MONTHS;

  return { months, totalInterest, totalHistory, perCardBalanceHistory, payoffMonth, payoffReached: months < MAX_MONTHS, negativeAmortization };
}

function formatMonths(m) {
  if (m >= MAX_MONTHS) return `50+ yrs`;
  const y = Math.floor(m / 12);
  const rem = m % 12;
  if (y === 0) return `${m} mo`;
  if (rem === 0) return `${y} yr`;
  return `${y} yr ${rem} mo`;
}

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    ink: styles.getPropertyValue('--ink').trim() || '#1C2430',
    soft: styles.getPropertyValue('--ink-soft').trim() || '#5B6472',
    border: styles.getPropertyValue('--border').trim() || '#D8D3C7',
    palette: ['#2C3E50', '#B8860B', '#9B6B43', '#4A7C6C', '#7A8B99', '#9B2C2C'] // Sophisticated palette
  };
}

function baseOptions(xLabel, yLabel, colors) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: colors.soft, font: { family: 'inherit' } } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(Number(ctx.raw))}` } }
    },
    scales: {
      x: { title: { display: true, text: xLabel || 'Month', color: colors.soft }, grid: { color: colors.border }, ticks: { color: colors.soft, maxTicksLimit: 12 } },
      y: { title: { display: true, text: yLabel || '', color: colors.soft }, grid: { color: colors.border }, ticks: { color: colors.soft, callback: v => '$' + Number(v).toLocaleString() } }
    }
  };
}

function renderChart(strategyResult, minOnlyResult, order) {
  if (!document.getElementById('payoffChart')) return;
  const ctx = document.getElementById('payoffChart').getContext('2d');
  const colors = getThemeColors();
  let cfg;

  if (currentView === 'compare') {
    const maxLen = Math.max(strategyResult.totalHistory.length, minOnlyResult.totalHistory.length);
    const labels = Array.from({ length: maxLen }, (_, i) => i + 1);
    cfg = {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Your Plan', data: strategyResult.totalHistory.map(r => r.totalBalance.toFixed(2)), borderColor: colors.ink, backgroundColor: colors.ink + '15', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5 },
          { label: 'Minimums Only', data: minOnlyResult.totalHistory.map(r => r.totalBalance.toFixed(2)), borderColor: '#9B6B43', backgroundColor: 'rgba(155,107,67,0.1)', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5 }
        ]
      },
      options: baseOptions('Month', 'Total Balance ($)', colors)
    };
  } else if (currentView === 'bycard') {
    const labels = strategyResult.perCardBalanceHistory.map((_, i) => i + 1);
    const names = order.map(c => c.name);
    cfg = {
      type: 'line',
      data: {
        labels,
        datasets: names.map((name, i) => ({
          label: name,
          data: strategyResult.perCardBalanceHistory.map(snap => (snap[name] || 0).toFixed(2)),
          borderColor: colors.palette[i % colors.palette.length],
          backgroundColor: 'transparent',
          tension: 0.15, pointRadius: 0, borderWidth: 2.5
        }))
      },
      options: baseOptions('Month', 'Balance ($)', colors)
    };
  } else {
    const maxLen = Math.max(strategyResult.totalHistory.length, minOnlyResult.totalHistory.length);
    const labels = Array.from({ length: maxLen }, (_, i) => i + 1);
    cfg = {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Interest — Your Plan', data: strategyResult.totalHistory.map(r => r.cumInterest.toFixed(2)), borderColor: colors.ink, backgroundColor: colors.ink + '15', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5 },
          { label: 'Interest — Minimum Only', data: minOnlyResult.totalHistory.map(r => r.cumInterest.toFixed(2)), borderColor: '#9B6B43', backgroundColor: 'rgba(155,107,67,0.1)', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5 }
        ]
      },
      options: baseOptions('Month', 'Cumulative Interest ($)', colors)
    };
  }

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, cfg);
}

function update() {
  const cards = readCards();
  const extra = parseFloat($('extra').value) || 0;
  const strategy = $('strategy').value;

  if (cards.length === 0) {
    $('verdictHeadline').textContent = 'Add a card to get started';
    $('verdictSub').textContent = '';$('verdictWarn').style.display = 'none';
    $('outStrategyTime').textContent = '—';$('outMinTime').textContent = '—';
    $('outStrategyDetail').textContent = '';$('outMinDetail').textContent = '';
    $('payoffOrderList').innerHTML = '';$('scheduleBody').innerHTML = '';
    if (chartInstance) chartInstance.destroy();
    return;
  }

  const order = orderCards(cards, strategy);
  const strategyResult = simulate(cards, extra, order, true);
  const minOnlyResult = simulate(cards, 0, order, false);

  if (strategyResult.payoffReached) {
    const savedInterest = minOnlyResult.totalInterest - strategyResult.totalInterest;
    const savedTime = minOnlyResult.months - strategyResult.months;
    $('verdictHeadline').innerHTML = `Debt-free in <span style="color: #3F6B4E;">${formatMonths(strategyResult.months)}</span>`;
    
    if (minOnlyResult.payoffReached && savedInterest > 0) {
      $('verdictSub').textContent = `Your plan saves ${fmt(savedInterest)} in interest and ${formatMonths(savedTime)} vs. minimum payments only.`;
    } else {
      $('verdictSub').textContent = `Total interest paid under your plan: ${fmt(strategyResult.totalInterest)}`;
    }
    $('verdictWarn').style.display = 'none';
  } else {
    $('verdictHeadline').textContent = `Not debt-free within 50 years`;
    $('verdictSub').textContent = `Increase your extra payment to make real progress.`;
    $('verdictWarn').style.display = 'block';$('verdictWarn').textContent = 'Your current payment plan is too small to overcome compound interest.';
  }

  $('outStrategyTime').textContent = formatMonths(strategyResult.months);$('outStrategyDetail').textContent = `Total interest: ${fmt(strategyResult.totalInterest)}`;

  if (minOnlyResult.negativeAmortization) {
    $('outMinTime').textContent = 'Never';$('outMinDetail').textContent = 'Minimum payments do not cover interest.';
  } else {
    $('outMinTime').textContent = formatMonths(minOnlyResult.months);$('outMinDetail').textContent = `Total interest: ${fmt(minOnlyResult.totalInterest)}`;
  }

  const listEl = $('payoffOrderList');
  listEl.innerHTML = '';
  const sortedByPayoff = [...order].sort((a, b) => (strategyResult.payoffMonth[a.name] ?? 999999) - (strategyResult.payoffMonth[b.name] ?? 999999));
  
  sortedByPayoff.forEach(c => {
    const li = document.createElement('li');
    const m = strategyResult.payoffMonth[c.name];
    li.innerHTML = `<strong>${c.name}</strong> — ${c.apr.toFixed(2)}% APR, ${fmt(c.balance)} balance — paid off <em>${m ? 'month ' + m : 'never'}</em>`;
    listEl.appendChild(li);
  });

  const body = $('scheduleBody');
  body.innerHTML = '';
  strategyResult.totalHistory.forEach(row => {
    if (row.month <= 24 || row.month % 12 === 0 || row.month === strategyResult.months) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.month}</td><td>${fmt2(row.monthPayment)}</td><td>${fmt2(row.monthInterest)}</td><td>${fmt2(row.totalBalance)}</td>`;
      body.appendChild(tr);
    }
  });

  if (currentView !== 'schedule') renderChart(strategyResult, minOnlyResult, order);
}

// View Tabs handling
document.querySelectorAll('.view-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const view = btn.dataset.view;
    if (view === 'schedule') {
      document.getElementById('panel-chart').classList.remove('active');
      document.getElementById('panel-schedule').classList.add('active');
    } else {
      currentView = view;
      document.getElementById('panel-schedule').classList.remove('active');
      document.getElementById('panel-chart').classList.add('active');
      
      const titles = { compare: 'Your Plan vs. Minimums Only', bycard: 'Balance by Card (Your Plan)', interest: 'Cumulative Interest Paid' };
      const subs = {
        compare: 'Total balance across all cards under each approach.',
        bycard: 'Balance of each individual card over time, under your plan.',
        interest: 'Cumulative interest paid under each approach.'
      };
      
      $('chartTitle').textContent = titles[currentView];$('chartSub').textContent = subs[currentView];
      update();
    }
  });
});

// Initialize
defaultCards.forEach(addCardRow);
update();