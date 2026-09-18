const $ = id => document.getElementById(id);
let chartInstance;
let currentView = 'stacked';

function fmt(n) {
  return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0});
}
function fmt2(n) {
  return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2});
}

function resetData() {
  $('initial').value = 10000;
  $('contribution').value = 300;
  $('contribFreq').value = 'monthly';$('rate').value = 7;
  $('compoundFreq').value = '12';$('inflation').value = 0;
  $('years').value = 25;
  $('years').dispatchEvent(new Event('input'));
}

const yearsInput = $('years');
yearsInput.addEventListener('input', () => {
  $('yearsLabel').textContent = yearsInput.value;
  update();
});

['initial', 'contribution', 'rate', 'inflation', 'contribFreq', 'compoundFreq'].forEach(id => {
  $(id).addEventListener('input', update);
});

function calculate() {
  const initial = parseFloat($('initial').value) || 0;
  const contribution = parseFloat($('contribution').value) || 0;
  const annualRate = parseFloat($('rate').value) || 0;
  const years = parseInt(yearsInput.value) || 1;
  const inflation = parseFloat($('inflation').value) || 0;
  
  const contribFreq = $('contribFreq').value;
  const compoundN = parseInt($('compoundFreq').value);

  const totalMonths = years * 12;
  const ratePerCompoundPeriod = (annualRate / 100) / compoundN;
  const monthsPerCompoundPeriod = 12 / compoundN;

  let balance = initial;
  let totalContributed = initial;
  const yearlyData = [];
  let cumContrib = initial;
  let cumGrowthTracked = 0;
  let monthsSinceCompound = 0;

  for (let m = 1; m <= totalMonths; m++) {
    if (contribFreq === 'monthly') {
      balance += contribution;
      totalContributed += contribution;
      cumContrib += contribution;
    } else if (contribFreq === 'annually' && m % 12 === 0) {
      balance += contribution;
      totalContributed += contribution;
      cumContrib += contribution;
    }

    monthsSinceCompound++;
    if (monthsSinceCompound >= monthsPerCompoundPeriod) {
      const growthThisPeriod = balance * ratePerCompoundPeriod;
      balance += growthThisPeriod;
      cumGrowthTracked += growthThisPeriod;
      monthsSinceCompound = 0;
    }

    if (m % 12 === 0) {
      yearlyData.push({
        year: m / 12,
        contributions: cumContrib,
        growth: balance - cumContrib,
        balance: balance
      });
    }
  }

  const futureValue = balance;
  const totalGrowth = futureValue - totalContributed;
  const realValue = inflation > 0 ? futureValue / Math.pow(1 + inflation / 100, years) : futureValue;

  return {futureValue, totalContributed, totalGrowth, realValue, yearlyData, years};
}

function renderResults(r) {
  $('outFuture').textContent = fmt(r.futureValue);$('outContributed').textContent = fmt(r.totalContributed);
  $('outGrowth').textContent = fmt(r.totalGrowth);$('outReal').textContent = fmt(r.realValue);
}

function renderTable(yearlyData) {
  const body = $('scheduleBody');
  body.innerHTML = '';
  yearlyData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.year}</td>
      <td>${fmt2(row.contributions)}</td>
      <td>${fmt2(row.growth)}</td>
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
    border: styles.getPropertyValue('--border').trim()
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
      x: { title: { display: true, text: xLabel || 'Year', color: colors.soft }, grid: { color: colors.border }, ticks: { color: colors.soft } },
      y: { title: { display: true, text: yLabel || '', color: colors.soft }, grid: { color: colors.border }, ticks: { color: colors.soft, callback: v => '$' + Number(v).toLocaleString() } }
    }
  };
}

function buildChartConfig(yearlyData, view) {
  const labels = yearlyData.map(r => r.year);
  const colors = getThemeColors();

  if (view === 'stacked') {
    const opts = baseOptions('Year', 'Balance ($)', colors);
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Contributions', data: yearlyData.map(r => r.contributions.toFixed(2)), backgroundColor: colors.ink, stack: 's' },
          { label: 'Growth', data: yearlyData.map(r => r.growth.toFixed(2)), backgroundColor: colors.ink + '40', stack: 's' } // 25% opacity
        ]
      },
      options: opts
    };
  }

  if (view === 'total') {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total Balance',
          data: yearlyData.map(r => r.balance.toFixed(2)),
          borderColor: colors.ink,
          backgroundColor: colors.ink + '1A', // 10% opacity
          fill: true, tension: 0.2, pointRadius: 0, borderWidth: 2.5
        }]
      },
      options: baseOptions('Year', 'Balance ($)', colors)
    };
  }

  // annual growth
  const annualGrowthAmounts = [];
  let prevBalance = 0;
  let prevContrib = 0;
  yearlyData.forEach(r => {
    const contribThisYear = r.contributions - prevContrib;
    const growthThisYear = (r.balance - prevBalance) - contribThisYear;
    annualGrowthAmounts.push(Math.max(growthThisYear, 0).toFixed(2));
    prevBalance = r.balance;
    prevContrib = r.contributions;
  });
  
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Growth Earned That Year',
        data: annualGrowthAmounts,
        backgroundColor: colors.ink + '80' // 50% opacity
      }]
    },
    options: baseOptions('Year', 'Growth ($)', colors)
  };
}

function renderChart(yearlyData) {
  if (!document.getElementById('growthChart')) return;
  const ctx = document.getElementById('growthChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, buildChartConfig(yearlyData, currentView));
}

function update() {
  const r = calculate();
  renderResults(r);
  renderTable(r.yearlyData);
  if (currentView !== 'schedule') renderChart(r.yearlyData);
}

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
      
      const titles = { stacked: 'Contributions vs. Growth', total: 'Total Balance', annual: 'Annual Growth' };
      const subs = {
        stacked: 'How your contributions and investment growth stack up year by year.',
        total: 'Total account balance over time.',
        annual: 'How much your balance grows each individual year.'
      };
      
      $('chartTitle').textContent = titles[currentView];$('chartSub').textContent = subs[currentView];
      update();
    }
  });
});

// Initialize
update();