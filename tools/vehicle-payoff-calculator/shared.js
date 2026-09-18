const $ = id => document.getElementById(id);
let chart;

function fmt(n){ return n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}); }
function fmt2(n){ return n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}); }

function resetData() {
  $('balance').value = 24000;
  $('rate').value = 6.5;
  $('payment').value = 520;
  $('extraMonthly').value = 150;
  $('extraLump').value = 0;
  update();
}

['balance','rate','payment','extraMonthly','extraLump'].forEach(id=>{
  $(id).addEventListener('input', update);
});

function simulateLoan(balance, rate, regularPayment, extraMonthly, extraLump) {
  const monthlyRate = (rate / 100) / 12;
  let currentBalanceOriginal = balance;
  let currentBalanceAccelerated = Math.max(0, balance - extraLump);
  
  let originalMonths = 0;
  let originalTotalInterest = 0;
  let acceleratedMonths = 0;
  let acceleratedTotalInterest = 0;
  
  const schedule = [];
  
  // Safety check for non-terminating loans
  const minInterest = balance * monthlyRate;
  if (regularPayment <= minInterest && balance > 0) {
    return { error: "Monthly payment is too low to cover accruing interest." };
  }

  // Simulate original schedule
  let simBalOrig = balance;
  while (simBalOrig > 0 && originalMonths < 600) {
    originalMonths++;
    const interest = simBalOrig * monthlyRate;
    originalTotalInterest += interest;
    let principal = regularPayment - interest;
    if (simBalOrig <= principal) {
      principal = simBalOrig;
      simBalOrig = 0;
    } else {
      simBalOrig -= principal;
    }
  }

  // Simulate accelerated schedule
  let simBalAccel = Math.max(0, balance - extraLump);
  if (extraLump > 0) {
    acceleratedTotalInterest += 0; // Lump sum applied immediately
  }

  while (simBalAccel > 0 && acceleratedMonths < 600) {
    acceleratedMonths++;
    const interest = simBalAccel * monthlyRate;
    acceleratedTotalInterest += interest;
    
    let totalPmnt = regularPayment + extraMonthly;
    let principal = totalPmnt - interest;
    
    if (simBalAccel <= principal) {
      principal = simBalAccel;
      totalPmnt = principal + interest;
      simBalAccel = 0;
    } else {
      simBalAccel -= principal;
    }

    if (acceleratedMonths <= 120) { // Keep table manageable or show full schedule
      schedule.push({
        month: acceleratedMonths,
        payment: totalPmnt,
        principal: principal,
        interest: interest,
        balance: simBalAccel
      });
    }
  }

  return {
    originalMonths,
    originalTotalInterest,
    acceleratedMonths,
    acceleratedTotalInterest,
    interestSaved: originalTotalInterest - acceleratedTotalInterest,
    timeSavedMonths: originalMonths - acceleratedMonths,
    schedule
  };
}

function renderVerdict(res) {
  const headline = $('verdictHeadline');
  const sub = $('verdictSub');

  if (res.error) {
    headline.textContent = "Payment Too Low";
    sub.textContent = res.error;
    return;
  }

  if (res.timeSavedMonths > 0) {
    const yrs = Math.floor(res.timeSavedMonths / 12);
    const mos = res.timeSavedMonths % 12;
    const timeStr = yrs > 0 ? `${yrs} yr ${mos} mo` : `${mos} months`;
    headline.innerHTML = `Save <span style="color:var(--good);">${fmt(res.interestSaved)}</span> in Interest`;
    sub.textContent = `You will pay off your car ${timeStr} faster than scheduled.`;
  } else {
    headline.textContent = "No Acceleration Applied";
    sub.textContent = "Add an extra monthly payment or lump sum to see savings.";
  }
}

function renderResults(res) {
  if (res.error) {
    $('outNewTime').textContent = '—';
    $('outInterestSaved').textContent = '—';$('outTimeSaved').textContent = '—';
    return;
  }

  const yrs = Math.floor(res.acceleratedMonths / 12);
  const mos = res.acceleratedMonths % 12;
  $('outNewTime').textContent = yrs > 0 ? `${yrs}y ${mos}m` : `${mos} mos`;
  $('outInterestSaved').textContent = fmt(res.interestSaved);
  
  const savedYrs = Math.floor(res.timeSavedMonths / 12);
  const savedMos = res.timeSavedMonths % 12;
  $('outTimeSaved').textContent = savedYrs > 0 ? `${savedYrs}y ${savedMos}m` : `${savedMos} mos`;
}

function renderTable(schedule) {
  const body = $('scheduleBody');
  body.innerHTML = '';
  schedule.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>Month ${row.month}</td>
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
    ink: styles.getPropertyValue('--ink').trim() || '#1C2430',
    soft: styles.getPropertyValue('--ink-soft').trim() || '#5B6472',
    border: styles.getPropertyValue('--border').trim() || '#D8D3C7',
    buy: styles.getPropertyValue('--buy').trim() || '#2C3E50',
    rent: styles.getPropertyValue('--rent').trim() || '#9B6B43'
  };
}

function renderChart(balance, rate, regularPayment, extraMonthly, extraLump) {
  if (!document.getElementById('payoffChart')) return;
  const colors = getThemeColors();
  
  // Generate comparison data arrays month by month
  const monthlyRate = (rate / 100) / 12;
  let balOrig = balance;
  let balAccel = Math.max(0, balance - extraLump);
  
  const origBalances = [balOrig];
  const accelBalances = [balAccel];
  const labels = ['Start'];

  let m = 0;
  while ((balOrig > 0 || balAccel > 0) && m < 360) {
    m++;
    // Original
    if (balOrig > 0) {
      const intOrig = balOrig * monthlyRate;
      let prinOrig = regularPayment - intOrig;
      if (balOrig <= prinOrig) balOrig = 0;
      else balOrig -= prinOrig;
    }
    // Accelerated
    if (balAccel > 0) {
      const intAccel = balAccel * monthlyRate;
      let prinAccel = (regularPayment + extraMonthly) - intAccel;
      if (balAccel <= prinAccel) balAccel = 0;
      else balAccel -= prinAccel;
    }

    if (m % 3 === 0 || balOrig === 0 && balAccel === 0) {
      labels.push(`M${m}`);
      origBalances.push(Math.max(0, balOrig).toFixed(2));
      accelBalances.push(Math.max(0, balAccel).toFixed(2));
    }
    if (balOrig <= 0 && balAccel <= 0) break;
  }

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Original Schedule', data: origBalances, borderColor: colors.buy, backgroundColor: colors.buy + '12', fill: false, tension: 0.2, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Accelerated Payoff', data: accelBalances, borderColor: colors.rent, backgroundColor: colors.rent + '15', fill: false, tension: 0.2, pointRadius: 0, borderWidth: 2.5 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: colors.soft, font: { family: 'inherit' } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}` } }
      },
      scales: {
        x: { title: { display: true, text: 'Timeline', color: colors.soft }, grid: { color: colors.border }, ticks: { color: colors.soft } },
        y: { title: { display: true, text: 'Remaining Balance ($)', color: colors.soft }, grid: { color: colors.border }, ticks: { color: colors.soft, callback: v => '$' + Number(v).toLocaleString() } }
      }
    }
  };

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('payoffChart').getContext('2d'), cfg);
}

function update() {
  const balance = parseFloat($('balance').value) || 0;
  const rate = parseFloat($('rate').value) || 0;
  const payment = parseFloat($('payment').value) || 0;
  const extraMonthly = parseFloat($('extraMonthly').value) || 0;
  const extraLump = parseFloat($('extraLump').value) || 0;

  const res = simulateLoan(balance, rate, payment, extraMonthly, extraLump);
  renderVerdict(res);
  renderResults(res);
  if (!res.error) {
    renderTable(res.schedule);
  } else {
    $('scheduleBody').innerHTML = '';
  }
  renderChart(balance, rate, payment, extraMonthly, extraLump);
}

update();