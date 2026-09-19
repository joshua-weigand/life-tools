(function(){
  "use strict";

  const STORAGE_KEY = "ledger_expenses_v1";
  const CATEGORY_COLORS = {
    Food: "#1F6F5C", Transport: "#B98B2E", Housing: "#A5432B",
    Utilities: "#4A6FA5", Entertainment: "#7A5CA0", Health: "#3F8F7A",
    Shopping: "#C46B3B", Other: "#767267"
  };

  let expenses = loadExpenses();
  let activeFilter = "All";
  let activeTypeFilter = "All";
  let searchQuery = "";
  let editingId = null;
  let selectionMode = false;
  let selectedIds = new Set();

  const now = new Date();
  let selectedYear = now.getFullYear();
  let selectedMonth = now.getMonth() + 1; // 1-12, or "all"

  function pad2(n){ return String(n).padStart(2, "0"); }

  function isCurrentPeriod(){
    if (selectedMonth === "all") {
      return selectedYear === now.getFullYear();
    }
    return selectedYear === now.getFullYear() && selectedMonth === (now.getMonth() + 1);
  }

  function daysInMonth(year, month){
    return new Date(year, month, 0).getDate();
  }

  function monthName(month, format){
    if (month === "all") return "All Months";
    return new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: format || "long" });
  }

  const TXN_TYPES = ["Sale", "Return", "Payment"];

  function normalizeType(t){
    const s = String(t || "").trim().toLowerCase();
    if(s === "return" || s === "refund" || s === "credit") return "Return";
    if(s === "payment" || s.includes("payment")) return "Payment";
    return "Sale";
  }

  function loadExpenses(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return data.map(e => ({ ...e, type: TXN_TYPES.includes(e.type) ? e.type : "Sale" }));
    }catch(e){
      console.error("Failed to load expenses", e);
      return [];
    }
  }

  function signedAmount(e){
    if(e.type === "Return") return -e.amount;
    if(e.type === "Payment") return 0;
    return e.amount;
  }

  function saveExpenses(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    }catch(e){
      console.error("Failed to save expenses", e);
      showToast("Couldn't save — storage may be full");
    }
  }

  function uid(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  function fmtMoney(n){
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function todayISO(){
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off*60000).toISOString().slice(0,10);
  }

  function monthKey(dateStr){
    return dateStr.slice(0,7); // YYYY-MM
  }

  function showToast(msg){
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(()=> t.classList.remove("show"), 2200);
  }

  function matchesActiveFilters(e){
    return (activeFilter === "All" || e.category === activeFilter)
      && (activeTypeFilter === "All" || e.type === activeTypeFilter);
  }

  function getFilteredExpensesForPeriod(year, month) {
    if (month === "all") {
      return expenses.filter(e => e.date.startsWith(`${year}-`));
    } else {
      const targetKey = `${year}-${pad2(month)}`;
      return expenses.filter(e => monthKey(e.date) === targetKey);
    }
  }

  function render(){
    renderHeader();
    renderChart();
    renderFilters();
    renderTypeFilters();
    renderTransactions();
  }

  function renderHeader(){
    if (selectedMonth === "all") {
      document.getElementById("total-label").textContent = `Spent in ${selectedYear}`;
    } else {
      document.getElementById("total-label").textContent = `Spent in ${monthName(selectedMonth)} ${selectedYear}`;
    }

    let total = 0;
    let currentExpenses = [];
    let monthsCount = 12;
    let pctCurrentBasis = 0;
    let pctPriorBasis = 0;

    if (selectedMonth === "all") {
      const maxMonth = (selectedYear === now.getFullYear()) ? (now.getMonth() + 1) : 12;
      const currentMonthsWithData = new Set();
      const priorMonthsWithData = new Set();
      
      expenses.forEach(e => {
        const y = Number(e.date.slice(0, 4));
        const m = Number(e.date.slice(5, 7));
        if (y === selectedYear && m <= maxMonth) currentMonthsWithData.add(m);
        if (y === (selectedYear - 1)) priorMonthsWithData.add(m);
      });

      const matchingMonths = new Set([...currentMonthsWithData].filter(m => priorMonthsWithData.has(m)));
      monthsCount = currentMonthsWithData.size;

      currentExpenses = expenses.filter(e => {
        if (!e.date.startsWith(`${selectedYear}-`)) return false;
        const m = Number(e.date.slice(5, 7));
        return m <= maxMonth && matchesActiveFilters(e);
      });
      total = currentExpenses.reduce((s,e)=> s + signedAmount(e), 0);

      pctCurrentBasis = expenses
        .filter(e => e.date.startsWith(`${selectedYear}-`) && matchingMonths.has(Number(e.date.slice(5, 7))) && matchesActiveFilters(e))
        .reduce((s,e)=> s + signedAmount(e), 0);

      pctPriorBasis = expenses
        .filter(e => e.date.startsWith(`${selectedYear - 1}-`) && matchingMonths.has(Number(e.date.slice(5, 7))) && matchesActiveFilters(e))
        .reduce((s,e)=> s + signedAmount(e), 0);

    } else {
      currentExpenses = getFilteredExpensesForPeriod(selectedYear, selectedMonth).filter(matchesActiveFilters);
      total = currentExpenses.reduce((s,e)=> s + signedAmount(e), 0);
      const priorExpenses = getFilteredExpensesForPeriod(selectedYear - 1, selectedMonth).filter(matchesActiveFilters);
      
      pctCurrentBasis = total;
      pctPriorBasis = priorExpenses.reduce((s,e)=> s + signedAmount(e), 0);
    }

    let pctBadgeHtml = "";
    if (pctPriorBasis > 0) {
      const diffPct = ((pctCurrentBasis - pctPriorBasis) / pctPriorBasis) * 100;
      if (diffPct > 0) {
        pctBadgeHtml = `<span class="pct-badge up" title="Increase compared to last year's matching periods">↑ +${diffPct.toFixed(1)}%</span>`;
      } else if (diffPct < 0) {
        pctBadgeHtml = `<span class="pct-badge down" title="Decrease compared to last year's matching periods">↓ ${diffPct.toFixed(1)}%</span>`;
      } else {
        pctBadgeHtml = `<span class="pct-badge neutral">0.0%</span>`;
      }
    } else if (total > 0) {
      pctBadgeHtml = `<span class="pct-badge up" title="New spending timeline baseline">↑ +100%</span>`;
    }

    document.getElementById("tape-total").innerHTML = `${fmtMoney(total)} ${pctBadgeHtml}`;

    if (selectedMonth === "all") {
      document.getElementById("stat-avg-label").textContent = "Avg / month";
      document.getElementById("stat-avg").textContent = fmtMoney(monthsCount ? total/monthsCount : 0);
    } else {
      document.getElementById("stat-avg-label").textContent = "Avg / day";
      const divisor = isCurrentPeriod() ? now.getDate() : daysInMonth(selectedYear, selectedMonth);
      document.getElementById("stat-avg").textContent = fmtMoney(divisor ? total/divisor : 0);
    }

    document.getElementById("stat-count").textContent = currentExpenses.length;

    const byCat = {};
    currentExpenses.filter(e => e.type !== "Payment").forEach(e => byCat[e.category] = (byCat[e.category]||0) + signedAmount(e));
    const top = Object.entries(byCat).sort((a,b)=> b[1]-a[1])[0];
    document.getElementById("stat-top").textContent = top ? top[0] : "—";
  }

  function renderChart() {
    if (selectedMonth === "all") renderYearlyChart();
    else renderDailyChart();
  }

  function renderDailyChart(){
    const wrap = document.getElementById("daily-chart-wrap");
    const key = `${selectedYear}-${pad2(selectedMonth)}`;
    const nDays = daysInMonth(selectedYear, selectedMonth);
    const monthExpenses = expenses.filter(e => monthKey(e.date) === key && matchesActiveFilters(e));

    const dailyTotals = new Array(nDays + 1).fill(0);
    monthExpenses.forEach(e => {
      const day = Number(e.date.slice(8, 10));
      if(day >= 1 && day <= nDays) dailyTotals[day] += signedAmount(e);
    });
    for(let d = 1; d <= nDays; d++) dailyTotals[d] = Math.abs(dailyTotals[d]);

    const priorYear = selectedYear - 1;
    const priorKey = `${priorYear}-${pad2(selectedMonth)}`;
    const nDaysPrior = daysInMonth(priorYear, selectedMonth);
    const priorExpenses = expenses.filter(e => monthKey(e.date) === priorKey && matchesActiveFilters(e));
    const hasPriorData = priorExpenses.length > 0;

    const priorTotals = new Array(nDaysPrior + 1).fill(0);
    priorExpenses.forEach(e => {
      const day = Number(e.date.slice(8, 10));
      if(day >= 1 && day <= nDaysPrior) priorTotals[day] += signedAmount(e);
    });
    for(let d = 1; d <= nDaysPrior; d++) priorTotals[d] = Math.abs(priorTotals[d]);

    const W = 1000, H = 180, padL = 8, padR = 8, padTop = 14, padBottom = 22;
    const max = Math.max(...dailyTotals.slice(1), ...priorTotals.slice(1), 1);
    const usableW = W - padL - padR;
    const usableH = H - padTop - padBottom;
    const stepX = nDays > 1 ? usableW / (nDays - 1) : 0;
    const stepXPrior = nDaysPrior > 1 ? usableW / (nDaysPrior - 1) : 0;

    const points = [];
    for(let d = 1; d <= nDays; d++){
      const x = padL + stepX * (d - 1);
      const y = padTop + usableH - (dailyTotals[d] / max) * usableH;
      points.push({ x, y, val: dailyTotals[d], day: d });
    }

    const priorPoints = [];
    for(let d = 1; d <= nDaysPrior; d++){
      const x = padL + stepXPrior * (d - 1);
      const y = padTop + usableH - (priorTotals[d] / max) * usableH;
      priorPoints.push({ x, y, val: priorTotals[d], day: d });
    }

    const linePath = points.map((p,i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${points[points.length-1].x.toFixed(1)},${padTop+usableH} L${points[0].x.toFixed(1)},${padTop+usableH} Z`;
    const priorLinePath = priorPoints.map((p,i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    const labelStep = Math.ceil(nDays / 8);
    let labels = "";
    for(let d = 1; d <= nDays; d += labelStep){
      const x = padL + stepX * (d - 1);
      labels += `<text class="daily-axis-label" x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle">${d}</text>`;
    }

    const dots = points.map(p => {
      const cls = p.val > 0 ? "daily-dot" : "daily-dot zero";
      const r = p.val > 0 ? 3 : 1.5;
      return `<circle class="${cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}"><title>Day ${p.day}: ${fmtMoney(p.val)}</title></circle>`;
    }).join("");

    const priorDots = priorPoints
      .filter(p => p.val > 0)
      .map(p => `<circle class="daily-dot-prior" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2"><title>${monthName(selectedMonth, "short")} ${p.day}, ${priorYear}: ${fmtMoney(p.val)}</title></circle>`)
      .join("");

    const legend = `
      <div class="daily-legend">
        <span class="legend-item"><span class="legend-swatch current"></span>${monthName(selectedMonth, "short")} ${selectedYear} ${activeFilter !== "All" ? `(${activeFilter})` : ''}</span>
        <span class="legend-item"><span class="legend-swatch prior"></span>${monthName(selectedMonth, "short")} ${priorYear}${hasPriorData ? "" : " (no data)"}</span>
      </div>
    `;

    wrap.innerHTML = `
      ${legend}
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily spending">
        <defs>
          <linearGradient id="dailyAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.28"></stop>
            <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <path class="daily-line-prior" d="${priorLinePath}"></path>
        <path class="daily-area" d="${areaPath}"></path>
        <path class="daily-line" d="${linePath}"></path>
        ${priorDots}
        ${dots}
        ${labels}
      </svg>
    `;
  }

  function renderYearlyChart() {
    const wrap = document.getElementById("daily-chart-wrap");
    const yearlyExpenses = expenses.filter(e => e.date.startsWith(`${selectedYear}-`) && matchesActiveFilters(e));

    const monthlyTotals = new Array(13).fill(0);
    yearlyExpenses.forEach(e => {
      const m = Number(e.date.slice(5, 7));
      if (m >= 1 && m <= 12) monthlyTotals[m] += signedAmount(e);
    });
    for(let m = 1; m <= 12; m++) monthlyTotals[m] = Math.abs(monthlyTotals[m]);

    const priorYear = selectedYear - 1;
    const priorExpenses = expenses.filter(e => e.date.startsWith(`${priorYear}-`) && matchesActiveFilters(e));
    const hasPriorData = priorExpenses.length > 0;

    const priorMonthlyTotals = new Array(13).fill(0);
    priorExpenses.forEach(e => {
      const m = Number(e.date.slice(5, 7));
      if (m >= 1 && m <= 12) priorMonthlyTotals[m] += signedAmount(e);
    });
    for(let m = 1; m <= 12; m++) priorMonthlyTotals[m] = Math.abs(priorMonthlyTotals[m]);

    const W = 1000, H = 180, padL = 20, padR = 20, padTop = 14, padBottom = 22;
    const max = Math.max(...monthlyTotals.slice(1), ...priorMonthlyTotals.slice(1), 1);
    const usableW = W - padL - padR;
    const usableH = H - padTop - padBottom;
    const stepX = usableW / 11;

    const points = [];
    for (let m = 1; m <= 12; m++) {
      const x = padL + stepX * (m - 1);
      const y = padTop + usableH - (monthlyTotals[m] / max) * usableH;
      points.push({ x, y, val: monthlyTotals[m], month: m });
    }

    const priorPoints = [];
    for (let m = 1; m <= 12; m++) {
      const x = padL + stepX * (m - 1);
      const y = padTop + usableH - (priorMonthlyTotals[m] / max) * usableH;
      priorPoints.push({ x, y, val: priorMonthlyTotals[m], month: m });
    }

    const linePath = points.map((p,i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${points[points.length-1].x.toFixed(1)},${padTop+usableH} L${points[0].x.toFixed(1)},${padTop+usableH} Z`;
    const priorLinePath = priorPoints.map((p,i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    let labels = "";
    for (let m = 1; m <= 12; m++) {
      const x = padL + stepX * (m - 1);
      const name = monthName(m, "short");
      labels += `<text class="daily-axis-label" x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle">${name}</text>`;
    }

    const dots = points.map(p => {
      const cls = p.val > 0 ? "daily-dot" : "daily-dot zero";
      const r = p.val > 0 ? 3.5 : 1.5;
      return `<circle class="${cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}"><title>${monthName(p.month)}: ${fmtMoney(p.val)}</title></circle>`;
    }).join("");

    const priorDots = priorPoints
      .filter(p => p.val > 0)
      .map(p => `<circle class="daily-dot-prior" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2"><title>${monthName(p.month)} ${priorYear}: ${fmtMoney(p.val)}</title></circle>`)
      .join("");

    const legend = `
      <div class="daily-legend">
        <span class="legend-item"><span class="legend-swatch current"></span>Full Year ${selectedYear} ${activeFilter !== "All" ? `(${activeFilter})` : ''}</span>
        <span class="legend-item"><span class="legend-swatch prior"></span>Full Year ${priorYear}${hasPriorData ? "" : " (no data)"}</span>
      </div>
    `;

    wrap.innerHTML = `
      ${legend}
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Yearly spending timeline">
        <defs>
          <linearGradient id="dailyAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.28"></stop>
            <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <path class="daily-line-prior" d="${priorLinePath}"></path>
        <path class="daily-area" d="${areaPath}"></path>
        <path class="daily-line" d="${linePath}"></path>
        ${priorDots}
        ${dots}
        ${labels}
      </svg>
    `;
  }

  function initPeriodPicker(){
    const monthSelect = document.getElementById("period-month");
    monthSelect.innerHTML = "";
    
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All Months";
    monthSelect.appendChild(allOpt);

    for(let m = 1; m <= 12; m++){
      const opt = document.createElement("option");
      opt.value = String(m);
      opt.textContent = monthName(m, "long");
      monthSelect.appendChild(opt);
    }

    populateYearOptions();
    syncPeriodPicker();

    monthSelect.addEventListener("change", () => {
      selectedMonth = monthSelect.value === "all" ? "all" : Number(monthSelect.value);
      render();
    });
    document.getElementById("period-year").addEventListener("change", () => {
      selectedYear = Number(document.getElementById("period-year").value);
      render();
    });
    document.getElementById("period-prev").addEventListener("click", () => shiftPeriod(-1));
    document.getElementById("period-next").addEventListener("click", () => shiftPeriod(1));
  }

  function populateYearOptions(){
    const yearSelect = document.getElementById("period-year");
    const years = new Set(expenses.map(e => Number(e.date.slice(0,4))));
    years.add(now.getFullYear());
    const sortedYears = [...years].sort((a,b)=> a - b);
    yearSelect.innerHTML = "";
    sortedYears.forEach(y => {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      yearSelect.appendChild(opt);
    });
  }

  function syncPeriodPicker(){
    document.getElementById("period-month").value = String(selectedMonth);
    const yearSelect = document.getElementById("period-year");
    if(![...yearSelect.options].some(o => o.value === String(selectedYear))){
      const opt = document.createElement("option");
      opt.value = String(selectedYear); opt.textContent = String(selectedYear);
      yearSelect.appendChild(opt);
      yearSelect.innerHTML = [...yearSelect.options].sort((a,b)=> a.value - b.value)
        .map(o => o.outerHTML).join("");
    }
    yearSelect.value = String(selectedYear);
  }

  function shiftPeriod(delta){
    if (selectedMonth === "all") {
      selectedYear += delta;
    } else {
      selectedMonth += delta;
      if(selectedMonth > 12){ selectedMonth = 1; selectedYear++; }
      if(selectedMonth < 1){ selectedMonth = 12; selectedYear--; }
    }
    syncPeriodPicker();
    render();
  }

  function renderFilters(){
    const filteredByPeriod = getFilteredExpensesForPeriod(selectedYear, selectedMonth)
      .filter(e => activeTypeFilter === "All" || e.type === activeTypeFilter);
    const cats = ["All", ...new Set(filteredByPeriod.map(e=>e.category))];
    const wrap = document.getElementById("cat-filters");
    wrap.innerHTML = "";
    cats.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "tab" + (c === activeFilter ? " active" : "");
      btn.textContent = c;
      btn.type = "button";
      btn.addEventListener("click", () => { activeFilter = c; render(); });
      wrap.appendChild(btn);
    });
  }

  function renderTypeFilters(){
    const filteredByPeriod = getFilteredExpensesForPeriod(selectedYear, selectedMonth)
      .filter(e => activeFilter === "All" || e.category === activeFilter);
    const types = ["All", ...TXN_TYPES.filter(t => filteredByPeriod.some(e => e.type === t))];
    const sel = document.getElementById("type-filter-select");
    sel.innerHTML = "";
    types.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t === "All" ? "All types" : t;
      sel.appendChild(opt);
    });
    sel.value = types.includes(activeTypeFilter) ? activeTypeFilter : "All";
    if(!types.includes(activeTypeFilter)) activeTypeFilter = "All";
  }

  function renderTransactions(){
    const list = document.getElementById("txn-list");
    list.innerHTML = "";

    const q = searchQuery.trim().toLowerCase();
    const filtered = getFilteredExpensesForPeriod(selectedYear, selectedMonth)
      .filter(matchesActiveFilters)
      .filter(e => !q || (e.note || "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      .sort((a,b)=> b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    if(filtered.length === 0){
      let msg;
      if(expenses.length === 0){
        msg = `No expenses yet — tap "+ Add expense" above to log your first one.`;
      } else if(q){
        msg = `No transactions match "${escapeHtml(searchQuery.trim())}"${activeFilter !== "All" ? ` in ${escapeHtml(activeFilter)}` : ""}${activeTypeFilter !== "All" ? ` (${escapeHtml(activeTypeFilter)})` : ""}.`;
      } else {
        const timeFrame = selectedMonth === "all" ? `${selectedYear}` : `${monthName(selectedMonth)} ${selectedYear}`;
        msg = `No expenses in ${timeFrame}${activeFilter !== "All" ? ` for ${escapeHtml(activeFilter)}` : ""}${activeTypeFilter !== "All" ? ` (${escapeHtml(activeTypeFilter)})` : ""}.`;
      }
      list.innerHTML = `<div class="empty">${msg}</div>`;
      if(selectionMode) updateBulkBar([]);
      return;
    }

    const groups = {};
    filtered.forEach(e => {
      groups[e.date] = groups[e.date] || [];
      groups[e.date].push(e);
    });

    Object.keys(groups).sort().reverse().forEach(date => {
      const groupEl = document.createElement("div");
      groupEl.className = "day-group";

      const label = document.createElement("div");
      label.className = "day-label";
      label.textContent = new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      groupEl.appendChild(label);

      groups[date].forEach(e => {
        const row = document.createElement("div");
        row.className = "txn";
        const checkboxHtml = selectionMode
          ? `<input type="checkbox" class="txn-check" data-id="${e.id}" ${selectedIds.has(e.id) ? "checked" : ""}>`
          : "";
        const actionsHtml = selectionMode
          ? `
          <button class="txn-edit" title="Edit" aria-label="Edit expense" data-id="${e.id}">✎</button>
          <button class="txn-del" title="Delete" aria-label="Delete expense" data-id="${e.id}">✕</button>
        `
          : "";
        const isCredit = e.type === "Return" || e.type === "Payment";
        const signedLabel = (isCredit ? "+" : "-") + fmtMoney(e.amount).slice(1);
        row.innerHTML = `
          ${checkboxHtml}
          <span class="txn-cat" style="background:${CATEGORY_COLORS[e.category] || '#767267'}22; color:${CATEGORY_COLORS[e.category] || '#767267'}">${escapeHtml(e.category)}</span>
          <span class="txn-type type-${e.type.toLowerCase()}">${escapeHtml(e.type)}</span>
          <span class="txn-note">${escapeHtml(e.note || "")}</span>
          <span class="txn-amt num${isCredit ? " credit" : ""}">${signedLabel}</span>
          ${actionsHtml}
        `;
        groupEl.appendChild(row);
      });

      list.appendChild(groupEl);
    });

    if(selectionMode){
      list.querySelectorAll(".txn-check").forEach(cb => {
        cb.addEventListener("change", () => {
          if(cb.checked) selectedIds.add(cb.dataset.id);
          else selectedIds.delete(cb.dataset.id);
          updateBulkBar(filtered.map(e => e.id));
        });
      });
      updateBulkBar(filtered.map(e => e.id));
    }

    list.querySelectorAll(".txn-del").forEach(btn => {
      btn.addEventListener("click", () => {
        expenses = expenses.filter(e => e.id !== btn.dataset.id);
        saveExpenses();
        render();
      });
    });

    list.querySelectorAll(".txn-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const expense = expenses.find(e => e.id === btn.dataset.id);
        if(expense) openEditModal(expense);
      });
    });
  }

  function toggleSelectionMode(){
    selectionMode = !selectionMode;
    selectedIds.clear();
    document.getElementById("select-mode-btn").textContent = selectionMode ? "Done" : "Edit";
    document.getElementById("bulk-bar").classList.toggle("show", selectionMode);
    renderTransactions();
  }

  function exitSelectionMode(){
    selectionMode = false;
    selectedIds.clear();
    document.getElementById("select-mode-btn").textContent = "Edit";
    document.getElementById("bulk-bar").classList.remove("show");
    renderTransactions();
  }

  function updateBulkBar(visibleIds){
    const count = selectedIds.size;
    document.getElementById("bulk-count").textContent = `${count} selected`;
    document.getElementById("bulk-edit-btn").disabled = count === 0;
    document.getElementById("bulk-delete-btn").disabled = count === 0;
    const allSelectAll = document.getElementById("bulk-select-all");
    const allChecked = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    allSelectAll.checked = allChecked;
    allSelectAll.dataset.visibleIds = JSON.stringify(visibleIds);
  }

  function bulkDeleteSelected(){
    const count = selectedIds.size;
    if(count === 0) return;
    if(confirm(`Delete ${count} selected transaction${count === 1 ? "" : "s"}? This can't be undone.`)){
      expenses = expenses.filter(e => !selectedIds.has(e.id));
      saveExpenses();
      exitSelectionMode();
      render();
      showToast(`Deleted ${count} transaction${count === 1 ? "" : "s"}`);
    }
  }

  function openBulkEditModal(){
    if(selectedIds.size === 0) return;
    document.getElementById("bulk-edit-title").textContent = `Edit ${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"}`;
    ["category", "date", "type", "note"].forEach(field => {
      document.getElementById(`bulk-use-${field}`).checked = false;
      document.getElementById(`bulk-row-${field}`).classList.add("disabled");
    });
    document.getElementById("bulk-category").value = "Food";
    document.getElementById("bulk-date").value = todayISO();
    document.getElementById("bulk-type").value = "Sale";
    document.getElementById("bulk-note").value = "";
    document.getElementById("bulk-edit-modal-overlay").classList.add("show");
  }

  function closeBulkEditModal(){
    document.getElementById("bulk-edit-modal-overlay").classList.remove("show");
  }

  function confirmBulkEdit(){
    const useCategory = document.getElementById("bulk-use-category").checked;
    const useDate = document.getElementById("bulk-use-date").checked;
    const useType = document.getElementById("bulk-use-type").checked;
    const useNote = document.getElementById("bulk-use-note").checked;

    if(!useCategory && !useDate && !useType && !useNote){
      showToast("Check at least one field to update");
      return;
    }

    const category = document.getElementById("bulk-category").value;
    const date = document.getElementById("bulk-date").value || todayISO();
    const type = document.getElementById("bulk-type").value;
    const note = document.getElementById("bulk-note").value.trim();

    const count = selectedIds.size;
    expenses = expenses.map(e => {
      if(!selectedIds.has(e.id)) return e;
      const updated = { ...e };
      if(useCategory) updated.category = category;
      if(useDate) updated.date = date;
      if(useType) updated.type = type;
      if(useNote) updated.note = note;
      return updated;
    });

    saveExpenses();
    closeBulkEditModal();
    exitSelectionMode();
    populateYearOptions();
    syncPeriodPicker();
    render();
    showToast(`Updated ${count} transaction${count === 1 ? "" : "s"}`);
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function openAddModal(){
    editingId = null;
    document.getElementById("add-modal-title").textContent = "Add an expense";
    document.getElementById("add-btn").textContent = "Add expense";
    document.getElementById("f-date").value = todayISO();
    document.getElementById("f-amount").value = "";
    document.getElementById("f-category").value = "Food";
    document.getElementById("f-type").value = "Sale";
    document.getElementById("f-note").value = "";
    document.getElementById("add-modal-overlay").classList.add("show");
    document.getElementById("f-amount").focus();
  }

  function openEditModal(expense){
    editingId = expense.id;
    document.getElementById("add-modal-title").textContent = "Edit expense";
    document.getElementById("add-btn").textContent = "Save changes";
    document.getElementById("f-date").value = expense.date;
    document.getElementById("f-amount").value = expense.amount;
    document.getElementById("f-category").value = expense.category;
    document.getElementById("f-type").value = TXN_TYPES.includes(expense.type) ? expense.type : "Sale";
    document.getElementById("f-note").value = expense.note || "";
    document.getElementById("add-modal-overlay").classList.add("show");
    document.getElementById("f-amount").focus();
  }

  function closeAddModal(){
    document.getElementById("add-modal-overlay").classList.remove("show");
    editingId = null;
  }

  function addExpense(){
    const date = document.getElementById("f-date").value || todayISO();
    const amount = parseFloat(document.getElementById("f-amount").value);
    const category = document.getElementById("f-category").value;
    const type = document.getElementById("f-type").value;
    const note = document.getElementById("f-note").value.trim();

    if(!amount || amount <= 0){
      showToast("Enter an amount greater than 0");
      return;
    }

    const wasEditing = !!editingId;

    if(wasEditing){
      const idx = expenses.findIndex(e => e.id === editingId);
      if(idx !== -1){
        expenses[idx] = { ...expenses[idx], date, amount, category, type, note };
      }
    } else {
      expenses.push({ id: uid(), date, amount, category, type, note });
    }
    saveExpenses();

    document.getElementById("f-amount").value = "";
    document.getElementById("f-note").value = "";

    closeAddModal();
    populateYearOptions();
    syncPeriodPicker();
    render();
    const addedKey = monthKey(date);
    const targetMonth = Number(addedKey.slice(5,7));
    const targetYear = addedKey.slice(0,4);

    const isVisibleNow = (selectedMonth === "all" && String(selectedYear) === String(targetYear)) || (selectedMonth === targetMonth && String(selectedYear) === String(targetYear));
    if(wasEditing){
      showToast(isVisibleNow ? "Changes saved" : `Saved — moved to ${monthName(targetMonth)} ${targetYear}`);
    } else {
      showToast(isVisibleNow ? "Added" : `Added to ${monthName(targetMonth)} ${targetYear}`);
    }
  }

  function exportJSON(){
    const blob = new Blob([JSON.stringify(expenses, null, 2)], { type: "application/json" });
    downloadBlob(blob, `ledger-backup-${todayISO()}.json`);
    showToast("Exported JSON");
  }

  function exportCSV(){
    const header = "date,amount,category,type,note";
    const rows = expenses.map(e => [e.date, e.amount, e.category, e.type || "Sale", (e.note||"").replace(/"/g,'""')]
      .map(v => `"${v}"`).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    downloadBlob(blob, `ledger-export-${todayISO()}.csv`);
    showToast("Exported CSV");
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function importJSON(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        if(!Array.isArray(data)) throw new Error("Not a valid backup file");
        const valid = data.filter(e => e && typeof e.amount === "number" && e.date && e.category)
          .map(e => ({ id: e.id || uid(), date: e.date, amount: e.amount, category: e.category, type: TXN_TYPES.includes(e.type) ? e.type : "Sale", note: e.note || "" }));
        expenses = expenses.concat(valid);
        saveExpenses();
        populateYearOptions();
        syncPeriodPicker();
        render();
        renderStorageStats();
        showToast(`Imported ${valid.length} expense(s)`);
      }catch(e){
        showToast("Couldn't read that file");
        console.error(e);
      }
    };
    reader.readAsText(file);
  }

  let csvParsed = null;

  function parseCSV(text){
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for(let i = 0; i < text.length; i++){
      const c = text[i], next = text[i+1];
      if(inQuotes){
        if(c === '"' && next === '"'){ field += '"'; i++; }
        else if(c === '"'){ inQuotes = false; }
        else{ field += c; }
      } else {
        if(c === '"'){ inQuotes = true; }
        else if(c === ','){ row.push(field); field = ""; }
        else if(c === '\r'){ /* skip */ }
        else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ""; }
        else{ field += c; }
      }
    }
    if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
    const cleaned = rows.filter(r => !(r.length === 1 && r[0].trim() === ""));
    if(cleaned.length === 0) return { headers: [], rows: [] };
    return { headers: cleaned[0].map(h => h.trim()), rows: cleaned.slice(1) };
  }

  function guessColumn(headers, candidates){
    const lower = headers.map(h => h.toLowerCase());
    for(const cand of candidates){
      const idx = lower.findIndex(h => h === cand);
      if(idx !== -1) return idx;
    }
    for(const cand of candidates){
      const idx = lower.findIndex(h => h.includes(cand));
      if(idx !== -1) return idx;
    }
    return -1;
  }

  function populateMapSelect(selectEl, headers, guessedIdx, allowNone){
    selectEl.innerHTML = "";
    if(allowNone){
      const opt = document.createElement("option");
      opt.value = "-1"; opt.textContent = "— none —";
      selectEl.appendChild(opt);
    }
    headers.forEach((h, i) => {
      const opt = document.createElement("option");
      opt.value = String(i); opt.textContent = h || `Column ${i+1}`;
      selectEl.appendChild(opt);
    });
    if(guessedIdx !== -1) selectEl.value = String(guessedIdx);
  }

  function renderCsvPreview(headers, rows){
    const table = document.getElementById("csv-preview-table");
    const previewRows = rows.slice(0, 6);
    let html = "<thead><tr>" + headers.map(h => `<th>${escapeHtml(h)}</th>`).join("") + "</tr></thead><tbody>";
    previewRows.forEach(r => {
      html += "<tr>" + headers.map((_, i) => `<td>${escapeHtml(r[i] ?? "")}</td>`).join("") + "</tr>";
    });
    html += "</tbody>";
    table.innerHTML = html;
  }

  function updateCsvNegateVisibility(){
    const typeMapped = Number(document.getElementById("map-type").value) !== -1;
    document.getElementById("map-negate-row").style.display = typeMapped ? "none" : "flex";
    document.getElementById("map-skip-negative-row").style.display = typeMapped ? "none" : "flex";
    document.getElementById("map-type-note").style.display = typeMapped ? "block" : "none";
  }

  function openCsvModal(filename, headers, rows){
    document.getElementById("csv-filename").textContent = filename;
    const dateGuess = guessColumn(headers, ["transaction date", "date", "posted date"]);
    const amountGuess = guessColumn(headers, ["amount", "debit", "cost", "price", "value"]);
    const categoryGuess = guessColumn(headers, ["category", "tag"]);
    const typeGuess = guessColumn(headers, ["type"]);
    const noteGuess = guessColumn(headers, ["description", "note", "memo", "merchant", "payee"]);

    populateMapSelect(document.getElementById("map-date"), headers, dateGuess, false);
    populateMapSelect(document.getElementById("map-amount"), headers, amountGuess, false);
    populateMapSelect(document.getElementById("map-category"), headers, categoryGuess, true);
    populateMapSelect(document.getElementById("map-type"), headers, typeGuess, true);
    populateMapSelect(document.getElementById("map-note"), headers, noteGuess, true);

    document.getElementById("map-negate").checked = false;
    document.getElementById("map-skip-negative").checked = true;
    updateCsvNegateVisibility();
    renderCsvPreview(headers, rows);
    document.getElementById("csv-row-count").textContent = `${rows.length} row(s) detected`;
    document.getElementById("csv-modal-overlay").classList.add("show");
  }

  function closeCsvModal(){
    document.getElementById("csv-modal-overlay").classList.remove("show");
    csvParsed = null;
  }

  function parseFlexibleDate(raw){
    const s = (raw || "").trim();
    if(!s) return null;
    let d = new Date(s);
    if(!isNaN(d)) return d.toISOString().slice(0,10);
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){
      let [, a, b, y] = m;
      if(y.length === 2) y = (Number(y) < 70 ? "20" : "19") + y;
      let month = Number(a), day = Number(b);
      if(month > 12 && day <= 12){ [month, day] = [day, month]; }
      d = new Date(Number(y), month - 1, day);
      if(!isNaN(d)) return d.toISOString().slice(0,10);
    }
    return null;
  }

  function parseFlexibleAmount(raw){
    if(raw === undefined || raw === null) return NaN;
    let s = String(raw).trim();
    let negative = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, "");
    s = s.replace(/[^0-9.\-]/g, "");
    let val = parseFloat(s);
    if(isNaN(val)) return NaN;
    if(negative) val = -Math.abs(val);
    return val;
  }

  function confirmCsvImport(){
    if(!csvParsed) return;
    const { headers, rows } = csvParsed;

    const dateIdx = Number(document.getElementById("map-date").value);
    const amountIdx = Number(document.getElementById("map-amount").value);
    const categoryIdx = Number(document.getElementById("map-category").value);
    const typeIdx = Number(document.getElementById("map-type").value);
    const noteIdx = Number(document.getElementById("map-note").value);
    const negate = document.getElementById("map-negate").checked;
    const skipNegative = document.getElementById("map-skip-negative").checked;

    let added = 0, skipped = 0;
    const imported = [];

    rows.forEach(r => {
      const dateVal = parseFlexibleDate(r[dateIdx]);
      let amountVal = parseFlexibleAmount(r[amountIdx]);
      if(dateVal === null || isNaN(amountVal)){ skipped++; return; }

      const type = typeIdx !== -1 ? normalizeType(r[typeIdx]) : "Sale";

      if(typeIdx === -1){
        if(negate) amountVal = -amountVal;
        if(skipNegative && amountVal <= 0){ skipped++; return; }
      }
      amountVal = Math.abs(amountVal);

      const category = categoryIdx !== -1 ? (r[categoryIdx] || "Other").trim() || "Other" : "Other";
      const note = noteIdx !== -1 ? (r[noteIdx] || "").trim() : "";

      imported.push({ id: uid(), date: dateVal, amount: amountVal, category, type, note });
      added++;
    });

    expenses = expenses.concat(imported);
    saveExpenses();
    populateYearOptions();
    syncPeriodPicker();
    render();
    renderStorageStats();
    closeCsvModal();
    showToast(`Imported ${added} expense(s)${skipped ? `, skipped ${skipped}` : ""}`);
  }

  function handleCsvFile(file){
    const reader = new FileReader();
    reader.onload = () => {
      const { headers, rows } = parseCSV(reader.result);
      if(headers.length === 0){
        showToast("Couldn't find any rows in that file");
        return;
      }
      csvParsed = { headers, rows };
      openCsvModal(file.name, headers, rows);
    };
    reader.onerror = () => showToast("Couldn't read that file");
    reader.readAsText(file);
  }

  const STORAGE_ESTIMATE_CAP = 5 * 1024 * 1024;

  function openSettingsModal(){
    renderStorageStats();
    document.getElementById("settings-modal-overlay").classList.add("show");
  }

  function closeSettingsModal(){
    document.getElementById("settings-modal-overlay").classList.remove("show");
  }

  function renderStorageStats(){
    document.getElementById("settings-stat-count").textContent = expenses.length;

    let raw = "";
    try{
      raw = localStorage.getItem(STORAGE_KEY) || "";
    }catch(e){ /* ignore */ }
    const bytes = new Blob([raw]).size;
    const kb = bytes / 1024;
    document.getElementById("settings-stat-size").textContent = kb < 1
      ? `${bytes} B`
      : `${kb.toFixed(kb < 10 ? 2 : 1)} KB`;

    if(expenses.length){
      const oldest = expenses.reduce((min, e) => (e.date < min ? e.date : min), expenses[0].date);
      document.getElementById("settings-stat-oldest").textContent =
        new Date(oldest + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } else {
      document.getElementById("settings-stat-oldest").textContent = "—";
    }

    const pct = Math.min(100, (bytes / STORAGE_ESTIMATE_CAP) * 100);
    document.getElementById("settings-storage-bar").style.width = `${Math.max(pct, bytes > 0 ? 1 : 0)}%`;
  }

  function clearAll(){
    if(confirm("Delete all expense data from this browser? This can't be undone.")){
      expenses = [];
      saveExpenses();
      selectedYear = now.getFullYear();
      selectedMonth = now.getMonth() + 1;
      populateYearOptions();
      syncPeriodPicker();
      render();
      renderStorageStats();
      showToast("All data cleared");
    }
  }

  document.getElementById("add-expense-btn").addEventListener("click", openAddModal);
  document.getElementById("type-filter-select").addEventListener("change", e => {
    activeTypeFilter = e.target.value;
    render();
  });
  document.getElementById("search-input").addEventListener("input", e => {
    searchQuery = e.target.value;
    renderTransactions();
  });
  document.getElementById("add-modal-cancel-btn").addEventListener("click", closeAddModal);
  document.getElementById("add-modal-overlay").addEventListener("click", e => {
    if(e.target.id === "add-modal-overlay") closeAddModal();
  });
  document.getElementById("add-btn").addEventListener("click", addExpense);
  document.getElementById("f-note").addEventListener("keydown", e => { if(e.key === "Enter") addExpense(); });
  document.getElementById("f-amount").addEventListener("keydown", e => { if(e.key === "Enter") addExpense(); });

  document.addEventListener("keydown", e => {
    if(e.key === "Escape"){ closeAddModal(); closeCsvModal(); closeSettingsModal(); closeBulkEditModal(); }
  });

  document.getElementById("settings-btn").addEventListener("click", openSettingsModal);
  document.getElementById("settings-close-btn").addEventListener("click", closeSettingsModal);
  document.getElementById("settings-modal-overlay").addEventListener("click", e => {
    if(e.target.id === "settings-modal-overlay") closeSettingsModal();
  });

  document.getElementById("select-mode-btn").addEventListener("click", toggleSelectionMode);
  document.getElementById("bulk-cancel-btn").addEventListener("click", exitSelectionMode);
  document.getElementById("bulk-delete-btn").addEventListener("click", bulkDeleteSelected);
  document.getElementById("bulk-edit-btn").addEventListener("click", openBulkEditModal);
  document.getElementById("bulk-select-all").addEventListener("change", e => {
    const visibleIds = JSON.parse(e.target.dataset.visibleIds || "[]");
    if(e.target.checked) visibleIds.forEach(id => selectedIds.add(id));
    else visibleIds.forEach(id => selectedIds.delete(id));
    renderTransactions();
  });

  document.getElementById("bulk-edit-cancel-btn").addEventListener("click", closeBulkEditModal);
  document.getElementById("bulk-edit-save-btn").addEventListener("click", confirmBulkEdit);
  document.getElementById("bulk-edit-modal-overlay").addEventListener("click", e => {
    if(e.target.id === "bulk-edit-modal-overlay") closeBulkEditModal();
  });
  ["category", "date", "type", "note"].forEach(field => {
    document.getElementById(`bulk-use-${field}`).addEventListener("change", e => {
      document.getElementById(`bulk-row-${field}`).classList.toggle("disabled", !e.target.checked);
    });
  });

  document.getElementById("export-json-btn").addEventListener("click", exportJSON);
  document.getElementById("export-csv-btn").addEventListener("click", exportCSV);
  document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-input").click());
  document.getElementById("import-input").addEventListener("change", e => {
    if(e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("clear-btn").addEventListener("click", clearAll);

  document.getElementById("import-csv-btn").addEventListener("click", () => document.getElementById("import-csv-input").click());
  document.getElementById("import-csv-input").addEventListener("change", e => {
    if(e.target.files[0]) handleCsvFile(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("csv-cancel-btn").addEventListener("click", closeCsvModal);
  document.getElementById("csv-confirm-btn").addEventListener("click", confirmCsvImport);
  document.getElementById("csv-modal-overlay").addEventListener("click", e => {
    if(e.target.id === "csv-modal-overlay") closeCsvModal();
  });
  document.getElementById("map-type").addEventListener("change", updateCsvNegateVisibility);

  document.getElementById("upload-expense-btn").addEventListener("click", () => {
    document.getElementById("upload-input").click();
  });
  document.getElementById("upload-input").addEventListener("change", e => {
    const file = e.target.files[0];
    e.target.value = "";
    if(!file) return;
    const name = file.name.toLowerCase();
    if(name.endsWith(".json") || file.type === "application/json"){
      importJSON(file);
    } else if(name.endsWith(".csv") || file.type === "text/csv"){
      handleCsvFile(file);
    } else {
      showToast("Please choose a .json or .csv file");
    }
  });

  function syncHeaderSpacing(){
    const tapeFixed = document.getElementById("tape-fixed");
    const wrap = document.getElementById("wrap");
    wrap.style.paddingTop = (tapeFixed.offsetHeight + 20) + "px";
  }

  if(window.ResizeObserver){
    new ResizeObserver(syncHeaderSpacing).observe(document.getElementById("tape-fixed"));
  } else {
    window.addEventListener("resize", syncHeaderSpacing);
  }
  syncHeaderSpacing();

  const COLLAPSE_RANGE = 160;
  let scrollTicking = false;
  const tapeFixedEl = document.getElementById("tape-fixed");

  function applyHeaderCollapse(){
    const progress = Math.min(1, Math.max(0, window.scrollY / COLLAPSE_RANGE));
    tapeFixedEl.style.setProperty("--tp", progress.toFixed(3));
    scrollTicking = false;
  }

  window.addEventListener("scroll", () => {
    if(!scrollTicking){
      requestAnimationFrame(applyHeaderCollapse);
      scrollTicking = true;
    }
  }, { passive: true });

  initPeriodPicker();
  render();
  applyHeaderCollapse();
})();