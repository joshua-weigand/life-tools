const $ = id => document.getElementById(id);
const fields = ['price','down','tradein','rate','fees'];
const termInput = $('term');
let chartInstance;
let currentView = 'balance'; // 'balance', 'split', 'cumulative'

function fmt(n) {
  return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0});
}
function fmt2(n) {
  return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2});
}

function resetData() {
  $('price').value = 35000;
  $('down').value = 5000;
  $('tradein').value = 0;
  $('fees').value = 0;
  $('rate').value = 6.5;
  termInput.value = 60;
  $('overrideToggle').checked = false;
  $('overrideBody').style.display = 'none';$('overridePayment').value = '';
  termInput.dispatchEvent(new Event('input'));
}

function amortizeSchedule(financed, monthlyRate, payment, capMonths) {
  let balance = financed;
  let totalInterest = 0;
  const schedule = [];
  let m = 0;
  
  while (balance > 0.005 && m < capMonths) {
    m++;
    const interestPortion = balance * monthlyRate;
    let principalPortion = payment - interestPortion;
    if (principalPortion <= 0) return null; 
    if (principalPortion >= balance) principalPortion = balance;
    
    balance = Math.max(balance - principalPortion, 0);
    totalInterest += interestPortion;
    
    schedule.push({
      month: m,
      payment: principalPortion + interestPortion,
      principal: principalPortion,
      interest: interestPortion,
      balance: balance
    });
  }
  if (balance > 0.005) return null; 
  return {schedule, totalInterest, months: m};
}

function calculate() {
  const price = parseFloat($('price').value) || 0;
  const down = parseFloat($('down').value) || 0;
  const tradein = parseFloat($('tradein').value) || 0;
  const fees = parseFloat($('fees').value) || 0;
  const rate = parseFloat($('rate').value) || 0;
  const months = parseInt(termInput.value) || 60;

  const financed = Math.max(price - down - tradein + fees, 0);
  const monthlyRate = (rate / 100) / 12;

  let payment;
  if (monthlyRate === 0) {
    payment = financed / months;
  } else {
    payment = financed * (monthlyRate * Math.pow(1+monthlyRate, months)) / (Math.pow(1+monthlyRate, months) - 1);
  }
  if (!isFinite(payment)) payment = 0;

  let balance = financed;
  let totalInterest = 0;
  const schedule = [];
  
  for (let m=1; m<=months; m++) {
    const interestPortion = balance * monthlyRate;
    let principalPortion = payment - interestPortion;
    if (m === months) principalPortion = balance;
    balance = Math.max(balance - principalPortion, 0);
    totalInterest += interestPortion;
    
    schedule.push({
      month: m, payment: principalPortion + interestPortion,
      principal: principalPortion, interest: interestPortion, balance: balance
    });
  }

  const standard = {financed, payment, totalInterest, schedule, months};
  const minPayment = financed * monthlyRate;

  let override = null;
  let overrideError = null;
  const overrideEnabled = $('overrideToggle').checked;
  
  if (overrideEnabled) {
    const overridePayment = parseFloat($('overridePayment').value) || 0;
    if (overridePayment <= 0) {
      overrideError = 'Enter a monthly payment amount.';
    } else if (monthlyRate > 0 && overridePayment <= minPayment) {
      overrideError = `Too low to ever pay off the loan — must exceed ${fmt2(minPayment)}/mo in interest.`;
    } else {
      const result = amortizeSchedule(financed, monthlyRate, overridePayment, 1200);
      if (!result) {
        overrideError = 'This payment would take longer than 100 years to pay off — try a higher amount.';
      } else {
        override = {financed, payment: overridePayment, totalInterest: result.totalInterest, schedule: result.schedule, months: result.months};
      }
    }
  }

  return {financed, monthlyRate, standard, override, overrideEnabled, overrideError, minPayment};
}

function renderResults(active) {
  $('outFinanced').textContent = fmt(active.financed);
  $('outPayment').textContent = fmt2(active.payment);$('outInterest').textContent = fmt(active.totalInterest);
}

function monthsToText(months) {
  const y = Math.floor(months/12);
  const m = months % 12;
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} yr`;
  return `${y} yr ${m} mo`;
}

function renderComparison(r) {
  const card = $('compareCard');
  const warningEl = $('overrideWarning');

  if (!r.overrideEnabled) {
    card.style.display = 'none';
    warningEl.style.display = 'none';
    return;
  }
  
  if (r.overrideError) {
    card.style.display = 'none';
    warningEl.style.display = 'block';
    warningEl.textContent = r.overrideError;
    return;
  }

  card.style.display = 'block';
  warningEl.style.display = 'none';

  const std = r.standard;
  const ov = r.override;

  $('cmpStdPayment').textContent = fmt2(std.payment);
  $('cmpStdTime').textContent = monthsToText(std.months);$('cmpStdInterest').textContent = fmt(std.totalInterest);

  $('cmpNewPayment').textContent = fmt2(ov.payment);
  $('cmpNewTime').textContent = monthsToText(ov.months);$('cmpNewInterest').textContent = fmt(ov.totalInterest);

  const monthsDiff = std.months - ov.months; 
  const interestDiff = std.totalInterest - ov.totalInterest;

  if (monthsDiff > 0) $('cmpMonthsSaved').textContent = `${monthsToText(monthsDiff)} sooner`;
  else if (monthsDiff < 0) $('cmpMonthsSaved').textContent = `${monthsToText(-monthsDiff)} later`;
  else $('cmpMonthsSaved').textContent = 'the same time';

  if (interestDiff > 0) $('cmpInterestSaved').textContent = `${fmt(interestDiff)} saved`;
  else if (interestDiff < 0) $('cmpInterestSaved').textContent = `${fmt(-interestDiff)} more`;
  else $('cmpInterestSaved').textContent = 'no change';
}

function renderTable(schedule) {
  const body = $('scheduleBody');
  body.innerHTML = '';
  schedule.forEach(row => {
    const tr = document.createElement('tr');
    if (row.month % 12 === 0) tr.classList.add('depleted-row'); // reusing the bold/underline class from shared.css
    tr.innerHTML = `
      <td>${row.month}</td>
      <td>${fmt2(row.payment)}</td>
      <td>${fmt2(row.principal)}</td>
      <td>${fmt2(row.interest)}</td>
      <td>${fmt2(row.balance)}</td>
    `;
    body.appendChild(tr);
  });
}

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    ink: styles.getPropertyValue('--ink').trim(),
    soft: styles.getPropertyValue('--ink-soft').trim(),
    border: styles.getPropertyValue('--border').trim(),
    accent1: styles.getPropertyValue('--ink').trim(), 
    accent2: styles.getPropertyValue('--ink-faint').trim() 
  };
}

function buildChartConfig(schedule, view) {
  const labels = schedule.map(r => r.month);
  const colors = getThemeColors();

  const baseOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: colors.soft, font: { family: 'inherit' } } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(Number(ctx.raw))}` } }
    },
    scales: {
      x: { title: { display: true, text: 'Month', color: colors.soft }, grid: { color: colors.border }, ticks: { color: colors.soft } },
      y: { grid: { color: colors.border }, ticks: { color: colors.soft, callback: v => '$' + Number(v).toLocaleString() } }
    }
  };

  if (view === 'balance') {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Remaining Balance', data: schedule.map(r => r.balance.toFixed(2)),
          borderColor: colors.accent1, backgroundColor: colors.accent1 + '1A', // 10% opacity
          fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5
        }]
      },
      options: baseOptions
    };
  }

  if (view === 'split') {
    const stackedOptions = JSON.parse(JSON.stringify(baseOptions));
    stackedOptions.scales.x.stacked = true;
    stackedOptions.scales.y.stacked = true;
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Principal', data: schedule.map(r => r.principal.toFixed(2)), backgroundColor: colors.accent1 },
          { label: 'Interest', data: schedule.map(r => r.interest.toFixed(2)), backgroundColor: colors.accent2 }
        ]
      },
      options: stackedOptions
    };
  }

  // cumulative
  let cumPrincipal = 0, cumInterest = 0;
  const cumP = [], cumI = [];
  schedule.forEach(r => {
    cumPrincipal += r.principal;
    cumInterest += r.interest;
    cumP.push(cumPrincipal.toFixed(2));
    cumI.push(cumInterest.toFixed(2));
  });
  
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Cumulative Principal Paid', data: cumP, borderColor: colors.accent1, backgroundColor: colors.accent1 + '1A', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Cumulative Interest Paid', data: cumI, borderColor: colors.accent2, backgroundColor: colors.accent2 + '1A', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5 }
      ]
    },
    options: baseOptions
  };
}

function renderChart(schedule) {
  if (!document.getElementById('loanChart')) return;
  const ctx = document.getElementById('loanChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, buildChartConfig(schedule, currentView));
}

function update() {
  const r = calculate();
  const active = (r.overrideEnabled && r.override) ? r.override : r.standard;

  renderResults(active);
  renderTable(active.schedule);
  if (currentView !== 'schedule') renderChart(active.schedule);
  renderComparison(r);

  if ($('overrideToggle').checked) {$('overrideHint').innerHTML = `Standard payment is <strong>${fmt2(r.standard.payment)}</strong>/mo. Must exceed <strong>${fmt2(r.minPayment)}</strong>/mo to pay down the balance.`;
  }
}

// Event Listeners
fields.forEach(id => $(id).addEventListener('input', update));

termInput.addEventListener('input', () => {
  $('termLabel').textContent = termInput.value;
  update();
});

const overrideToggle = $('overrideToggle');
const overridePaymentInput = $('overridePayment');

overrideToggle.addEventListener('change', () => {
  $('overrideBody').style.display = overrideToggle.checked ? 'block' : 'none';
  if (overrideToggle.checked && (!overridePaymentInput.value || parseFloat(overridePaymentInput.value) === 0)) {
    const r = calculate();
    overridePaymentInput.value = r.standard.payment.toFixed(2);
  }
  update();
});
overridePaymentInput.addEventListener('input', update);

// View Tabs handling (using shared.css tab classes)
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
      
      const titles = { balance: 'Remaining Balance', split: 'Payment Breakdown', cumulative: 'Cumulative Paid' };
      const subs = {
        balance: 'Principal balance over the life of the loan.',
        split: 'How much of each payment goes to principal vs. interest.',
        cumulative: 'Running total of principal and interest paid to date.'
      };
      
      $('chartTitle').textContent = titles[currentView];$('chartSub').textContent = subs[currentView];
      update();
    }
  });
});

// Initialize
update();