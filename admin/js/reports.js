let reportsRenderToken = 0
let reportsCurrentTab = 'daily' // 'daily', 'weekly', 'monthly'
let reportsCurrentType = 'income' // 'income', 'expense', 'global'
let _reportsStart = null
let _reportsEnd = null
let _reportsPage = 1
let _reportsPageSize = 10

function cancelReportsRender() {
  reportsRenderToken++
}

function initReportsDefaultDates() {
  const today = todayStr()
  if (reportsCurrentTab === 'daily') {
    _reportsStart = addDaysToDateStr(today, -13)
    _reportsEnd = today
  } else if (reportsCurrentTab === 'weekly') {
    const buckets = buildWeekBuckets(12)
    _reportsStart = buckets[0].start
    _reportsEnd = buckets[buckets.length - 1].end
  } else if (reportsCurrentTab === 'monthly') {
    const currentYear = today.slice(0, 4)
    _reportsStart = `${currentYear}-01-01`
    _reportsEnd = `${currentYear}-12-31`
  }
}

function getReportsControlBarHtml() {
  if (!_reportsStart || !_reportsEnd) {
    initReportsDefaultDates()
  }
  return `
    <div class="reports-control-bar">
      <div class="report-tabs" style="margin-bottom:0">
        <button class="report-tab ${reportsCurrentTab === 'daily' ? 'active' : ''}" onclick="switchReportTab('daily', this)">📅 Harian</button>
        <button class="report-tab ${reportsCurrentTab === 'weekly' ? 'active' : ''}" onclick="switchReportTab('weekly', this)">📆 Mingguan</button>
        <button class="report-tab ${reportsCurrentTab === 'monthly' ? 'active' : ''}" onclick="switchReportTab('monthly', this)">📅 Bulanan</button>
      </div>
      <div class="reports-right-controls" style="display:flex; gap:10px; align-items:center; margin-left:auto;">
        <div class="date-row" style="display:flex; gap:8px; align-items:center;">
          <input type="date" id="reportsStart" value="${_reportsStart}" style="width:140px;height:36px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text)">
          <input type="date" id="reportsEnd" value="${_reportsEnd}" style="width:140px;height:36px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text)">
          <button class="btn btn-primary btn-sm search-btn" onclick="applyReportsFilter()" style="height:36px;padding:0 12px;border-radius:8px"><i class="fas fa-search"></i> Cari</button>
        </div>
        <button class="btn btn-outline btn-sm" onclick="exportReportsPDF()" style="height:36px"><i class="fas fa-file-pdf text-danger"></i> PDF</button>
      </div>
    </div>
  `
}

async function renderReportsIncome(container) {
  cancelReportsRender()
  reportsCurrentType = 'income'
  reportsCurrentTab = 'daily'
  _reportsPage = 1
  initReportsDefaultDates()
  container.innerHTML = `
    ${adminPageNote('fas fa-chart-line', 'Laporan Penjualan & Pemasukan', 'Analisis pendapatan harian, mingguan, dan bulanan dari penjualan toko serta pemasukan kas manual.')}
    ${getReportsControlBarHtml()}
    <div id="reportContent"></div>
  `
  await loadReportsData()
}

async function renderReportsExpense(container) {
  cancelReportsRender()
  reportsCurrentType = 'expense'
  reportsCurrentTab = 'daily'
  _reportsPage = 1
  initReportsDefaultDates()
  container.innerHTML = `
    ${adminPageNote('fas fa-chart-pie', 'Laporan Pengeluaran', 'Analisis pengeluaran kas operasional dan belanja stok koperasi sekolah secara berkala.')}
    ${getReportsControlBarHtml()}
    <div id="reportContent"></div>
  `
  await loadReportsData()
}

async function renderReportsGlobal(container) {
  cancelReportsRender()
  reportsCurrentType = 'global'
  reportsCurrentTab = 'daily'
  _reportsPage = 1
  initReportsDefaultDates()
  container.innerHTML = `
    ${adminPageNote('fas fa-globe', 'Laporan Keuangan Global', 'Analisis laba bersih secara real-time dengan membandingkan seluruh Pemasukan (Penjualan + Manual) dan Pengeluaran.')}
    ${getReportsControlBarHtml()}
    <div id="reportContent"></div>
  `
  await loadReportsData()
}

function switchReportTab(tab, btn) {
  cancelReportsRender()
  document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'))
  btn.classList.add('active')
  reportsCurrentTab = tab
  _reportsPage = 1
  
  initReportsDefaultDates()
  
  const startEl = document.getElementById('reportsStart')
  const endEl = document.getElementById('reportsEnd')
  if (startEl && endEl) {
    startEl.value = _reportsStart
    endEl.value = _reportsEnd
  }

  loadReportsData()
}

function applyReportsFilter() {
  const startEl = document.getElementById('reportsStart')
  const endEl = document.getElementById('reportsEnd')
  if (startEl && endEl) {
    let start = startEl.value
    let end = endEl.value
    if (!start || !end) return
    if (start > end) [start, end] = [end, start]
    _reportsStart = start
    _reportsEnd = end
    startEl.value = start
    endEl.value = end
  }
  _reportsPage = 1
  loadReportsData()
}

function getEffectiveReportsPageSize(total) {
  const size = _reportsPageSize
  return size === -1 ? total : (size || 10)
}

function buildReportsPageNumbers(current, total) {
  const pages = [1]
  if (current > 3) pages.push('...')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    if (!pages.includes(p)) pages.push(p)
  }
  if (current < total - 2) pages.push('...')
  if (total > 1 && !pages.includes(total)) pages.push(total)
  return pages
}

function renderReportsPagination(total, start, shown, totalPages) {
  const footer = document.getElementById('reportTableFooter')
  if (!footer) return

  if (total === 0) {
    footer.innerHTML = '<span class="products-table-info">Menampilkan 0 data</span>'
    return
  }

  const end = start + shown
  const page = _reportsPage || 1
  const pageSize = _reportsPageSize ?? 10
  const pages = buildReportsPageNumbers(page, totalPages)
  const paginationHtml = (pageSize <= 0 || totalPages <= 1) ? '' : `
    <div class="products-pagination">
      <button type="button" onclick="setReportsPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>« Prev</button>
      ${pages.map(p => {
        if (p === '...') return '<span class="products-page-ellipsis">...</span>'
        return `<button type="button" class="${p === page ? 'active' : ''}" onclick="setReportsPage(${p})">${p}</button>`
      }).join('')}
      <button type="button" onclick="setReportsPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next »</button>
    </div>
  `

  footer.innerHTML = `
    <span class="products-table-info">Menampilkan ${start + 1}-${end} dari ${total} data</span>
    <div class="products-table-controls">
      <select class="products-page-size" onchange="setReportsPageSize(Number(this.value))" aria-label="Jumlah baris per halaman">
        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / Hal</option>
        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / Hal</option>
        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / Hal</option>
      </select>
      ${paginationHtml}
    </div>
  `
}

function setReportsPage(page) {
  _reportsPage = page
  loadReportsData()
}

function setReportsPageSize(size) {
  _reportsPageSize = size
  _reportsPage = 1
  loadReportsData()
}

function buildCustomWeekBuckets(startStr, endStr) {
  const buckets = []
  let current = startStr
  while (current <= endStr) {
    let nextEnd = addDaysToDateStr(current, 6)
    if (nextEnd > endStr) nextEnd = endStr
    buckets.push({
      label: `${formatDateShort(current)} - ${formatDateShort(nextEnd)}`,
      start: current,
      end: nextEnd
    })
    current = addDaysToDateStr(nextEnd, 1)
  }
  return buckets
}

function buildCustomMonthBuckets(startStr, endStr) {
  const buckets = []
  let start = new Date(startStr)
  let end = new Date(endStr)
  let current = new Date(start.getFullYear(), start.getMonth(), 1)
  const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  
  while (current <= end) {
    let y = current.getFullYear()
    let m = current.getMonth()
    let monthStart = `${y}-${String(m+1).padStart(2, '0')}-01`
    let lastDay = new Date(y, m + 1, 0).getDate()
    let monthEnd = `${y}-${String(m+1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    let activeStart = monthStart < startStr ? startStr : monthStart
    let activeEnd = monthEnd > endStr ? endStr : monthEnd
    
    buckets.push({
      label: `${monthNames[m]} ${y}`,
      start: activeStart,
      end: activeEnd,
      monthIdx: m,
      year: y
    })
    current.setMonth(current.getMonth() + 1)
  }
  return buckets
}

async function loadReportsData() {
  const token = ++reportsRenderToken
  
  const content = document.getElementById('reportContent')
  if (!content) return

  try {
    if (reportsCurrentType === 'income') {
      await loadIncomeReports(content, token)
    } else if (reportsCurrentType === 'expense') {
      await loadExpenseReports(content, token)
    } else if (reportsCurrentType === 'global') {
      await loadGlobalReports(content, token)
    }
  } catch (err) {
    if (token !== reportsRenderToken) return
    content.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`
  }
}

async function loadIncomeReports(content, token) {
  const today = todayStr()
  let dates = []
  let labels = []
  let buckets = []
  let startStr = _reportsStart
  let endStr = _reportsEnd

  if (!startStr || !endStr) {
    initReportsDefaultDates()
    startStr = _reportsStart
    endStr = _reportsEnd
  }

  if (reportsCurrentTab === 'daily') {
    let current = startStr
    while (current <= endStr) {
      dates.push(current)
      labels.push(formatDateShort(current))
      current = addDaysToDateStr(current, 1)
    }
  } else if (reportsCurrentTab === 'weekly') {
    buckets = buildCustomWeekBuckets(startStr, endStr)
    labels = buckets.map(b => b.label)
  } else if (reportsCurrentTab === 'monthly') {
    buckets = buildCustomMonthBuckets(startStr, endStr)
    labels = buckets.map(b => b.label)
  }

  // Fetch daily summaries (aggregated on database)
  const [{ data: salesSum, error: txErr }, { data: incSum, error: incErr }] = await Promise.all([
    api.getDailySalesSummary(startStr, endStr),
    api.getDailyIncomesSummary(startStr, endStr)
  ])

  if (txErr) throw txErr
  if (incErr) throw incErr
  if (token !== reportsRenderToken) return

  // Build index maps
  const salesMap = {}
  const incMap = {}
  ;(salesSum || []).forEach(r => { salesMap[r.date_local] = { sales: Number(r.total_sales), count: Number(r.tx_count) } })
  ;(incSum || []).forEach(r => { incMap[r.date_local] = Number(r.total_income) })

  let salesData = []
  let manualIncData = []
  let txCountData = []

  if (reportsCurrentTab === 'daily') {
    salesData = dates.map(d => salesMap[d]?.sales || 0)
    txCountData = dates.map(d => salesMap[d]?.count || 0)
    manualIncData = dates.map(d => incMap[d] || 0)
  } else if (reportsCurrentTab === 'weekly' || reportsCurrentTab === 'monthly') {
    salesData = buckets.map(b => {
      let sum = 0
      for (let d = b.start; d <= b.end; d = addDaysToDateStr(d, 1)) {
        sum += salesMap[d]?.sales || 0
      }
      return sum
    })
    txCountData = buckets.map(b => {
      let sum = 0
      for (let d = b.start; d <= b.end; d = addDaysToDateStr(d, 1)) {
        sum += salesMap[d]?.count || 0
      }
      return sum
    })
    manualIncData = buckets.map(b => {
      let sum = 0
      for (let d = b.start; d <= b.end; d = addDaysToDateStr(d, 1)) {
        sum += incMap[d] || 0
      }
      return sum
    })
  }

  const totalSales = salesData.reduce((s, v) => s + v, 0)
  const totalManual = manualIncData.reduce((s, v) => s + v, 0)
  const totalCombined = totalSales + totalManual
  const totalTx = txCountData.reduce((s, v) => s + v, 0)

  let items = []
  if (reportsCurrentTab === 'daily') {
    for (let i = 0; i < dates.length; i++) {
      items.push({
        label: labels[i],
        txCount: txCountData[i],
        sales: salesData[i],
        manualInc: manualIncData[i],
        comb: salesData[i] + manualIncData[i]
      })
    }
  } else {
    for (let i = 0; i < buckets.length; i++) {
      items.push({
        label: labels[i],
        txCount: txCountData[i],
        sales: salesData[i],
        manualInc: manualIncData[i],
        comb: salesData[i] + manualIncData[i]
      })
    }
  }
  items.reverse()

  const total = items.length
  const pageSize = getEffectiveReportsPageSize(total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!_reportsPage || _reportsPage < 1) _reportsPage = 1
  if (_reportsPage > totalPages) _reportsPage = totalPages

  const start = total === 0 ? 0 : (_reportsPage - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)

  let tableRows = pageItems.map(item => {
    return `
      <tr>
        <td class="font-bold text-brand-navy col-date">${escapeHtml(item.label)}</td>
        <td>${item.txCount.toLocaleString('id-ID')} Transaksi</td>
        <td class="col-nominal">${formatRupiah(item.sales)}</td>
        <td class="col-nominal">${formatRupiah(item.manualInc)}</td>
        <td class="font-bold text-success col-nominal">${formatRupiah(item.comb)}</td>
      </tr>
    `
  }).join('')

  const totalRowHtml = `
    <tr class="table-total-row">
      <td class="total-label">TOTAL</td>
      <td>${totalTx.toLocaleString('id-ID')} Transaksi</td>
      <td class="col-nominal">${formatRupiah(totalSales)}</td>
      <td class="col-nominal">${formatRupiah(totalManual)}</td>
      <td class="col-nominal">${formatRupiah(totalCombined)}</td>
    </tr>
  `
  tableRows += totalRowHtml

  content.innerHTML = `
    <div class="products-table-card" style="margin-top:24px">
      <div class="products-table-scroll">
        <table class="products-data-table">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Transaksi</th>
              <th>Penjualan (Kasir)</th>
              <th>Pemasukan Manual</th>
              <th>Total Pemasukan</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      <div class="products-table-footer" id="reportTableFooter"></div>
    </div>
  `

  renderReportsPagination(total, start, pageItems.length, totalPages)

  window._currentReportCache = {
    type: 'income',
    tab: reportsCurrentTab,
    labels,
    txCountData,
    salesData,
    manualIncData,
    totalTx,
    totalSales,
    totalManual,
    totalCombined,
    today
  }
}

async function loadExpenseReports(content, token) {
  const today = todayStr()
  let dates = []
  let labels = []
  let buckets = []
  let startStr = _reportsStart
  let endStr = _reportsEnd

  if (!startStr || !endStr) {
    initReportsDefaultDates()
    startStr = _reportsStart
    endStr = _reportsEnd
  }

  if (reportsCurrentTab === 'daily') {
    let current = startStr
    while (current <= endStr) {
      dates.push(current)
      labels.push(formatDateShort(current))
      current = addDaysToDateStr(current, 1)
    }
  } else if (reportsCurrentTab === 'weekly') {
    buckets = buildCustomWeekBuckets(startStr, endStr)
    labels = buckets.map(b => b.label)
  } else if (reportsCurrentTab === 'monthly') {
    buckets = buildCustomMonthBuckets(startStr, endStr)
    labels = buckets.map(b => b.label)
  }

  // Fetch daily expense summaries (aggregated on database)
  const { data: expSum, error: expErr } = await api.getDailyExpensesSummary(startStr, endStr)

  if (expErr) throw expErr
  if (token !== reportsRenderToken) return

  const expMap = {}
  ;(expSum || []).forEach(r => { expMap[r.date_local] = Number(r.total_expense) })

  let expenseData = []

  if (reportsCurrentTab === 'daily') {
    expenseData = dates.map(d => expMap[d] || 0)
  } else if (reportsCurrentTab === 'weekly' || reportsCurrentTab === 'monthly') {
    expenseData = buckets.map(b => {
      let sum = 0
      for (let d = b.start; d <= b.end; d = addDaysToDateStr(d, 1)) {
        sum += expMap[d] || 0
      }
      return sum
    })
  }

  const totalExpense = expenseData.reduce((s, v) => s + v, 0)
  const average = totalExpense / (reportsCurrentTab === 'daily' ? 14 : reportsCurrentTab === 'weekly' ? 12 : 12)

  let items = []
  if (reportsCurrentTab === 'daily') {
    for (let i = 0; i < dates.length; i++) {
      items.push({
        label: labels[i],
        expense: expenseData[i]
      })
    }
  } else {
    for (let i = 0; i < buckets.length; i++) {
      items.push({
        label: labels[i],
        expense: expenseData[i]
      })
    }
  }
  items.reverse()

  const total = items.length
  const pageSize = getEffectiveReportsPageSize(total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!_reportsPage || _reportsPage < 1) _reportsPage = 1
  if (_reportsPage > totalPages) _reportsPage = totalPages

  const start = total === 0 ? 0 : (_reportsPage - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)

  let tableRows = pageItems.map(item => {
    return `
      <tr>
        <td class="font-bold text-brand-navy col-date">${escapeHtml(item.label)}</td>
        <td class="font-bold text-danger col-nominal">${formatRupiah(item.expense)}</td>
      </tr>
    `
  }).join('')

  const totalRowHtml = `
    <tr class="table-total-row">
      <td class="total-label">TOTAL</td>
      <td class="col-nominal">${formatRupiah(totalExpense)}</td>
    </tr>
  `
  tableRows += totalRowHtml

  content.innerHTML = `
    <div class="products-table-card" style="margin-top:24px">
      <div class="products-table-scroll">
        <table class="products-data-table">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Total Pengeluaran</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      <div class="products-table-footer" id="reportTableFooter"></div>
    </div>
  `

  renderReportsPagination(total, start, pageItems.length, totalPages)

  window._currentReportCache = {
    type: 'expense',
    tab: reportsCurrentTab,
    labels,
    expenseData,
    totalExpense,
    today
  }
}

async function loadGlobalReports(content, token) {
  const today = todayStr()
  let dates = []
  let labels = []
  let buckets = []
  let startStr = _reportsStart
  let endStr = _reportsEnd

  if (!startStr || !endStr) {
    initReportsDefaultDates()
    startStr = _reportsStart
    endStr = _reportsEnd
  }

  if (reportsCurrentTab === 'daily') {
    let current = startStr
    while (current <= endStr) {
      dates.push(current)
      labels.push(formatDateShort(current))
      current = addDaysToDateStr(current, 1)
    }
  } else if (reportsCurrentTab === 'weekly') {
    buckets = buildCustomWeekBuckets(startStr, endStr)
    labels = buckets.map(b => b.label)
  } else if (reportsCurrentTab === 'monthly') {
    buckets = buildCustomMonthBuckets(startStr, endStr)
    labels = buckets.map(b => b.label)
  }

  // Fetch daily summaries (aggregated on database)
  const [{ data: salesSum, error: txErr }, { data: incSum, error: incErr }, { data: expSum, error: expErr }] = await Promise.all([
    api.getDailySalesSummary(startStr, endStr),
    api.getDailyIncomesSummary(startStr, endStr),
    api.getDailyExpensesSummary(startStr, endStr)
  ])

  if (txErr) throw txErr
  if (incErr) throw incErr
  if (expErr) throw expErr
  if (token !== reportsRenderToken) return

  const salesMap = {}
  const incMap = {}
  const expMap = {}
  ;(salesSum || []).forEach(r => { salesMap[r.date_local] = Number(r.total_sales) })
  ;(incSum || []).forEach(r => { incMap[r.date_local] = Number(r.total_income) })
  ;(expSum || []).forEach(r => { expMap[r.date_local] = Number(r.total_expense) })

  let incomeData = []
  let expenseData = []

  if (reportsCurrentTab === 'daily') {
    incomeData = dates.map(d => (salesMap[d] || 0) + (incMap[d] || 0))
    expenseData = dates.map(d => expMap[d] || 0)
  } else if (reportsCurrentTab === 'weekly' || reportsCurrentTab === 'monthly') {
    incomeData = buckets.map(b => {
      let sum = 0
      for (let d = b.start; d <= b.end; d = addDaysToDateStr(d, 1)) {
        sum += (salesMap[d] || 0) + (incMap[d] || 0)
      }
      return sum
    })
    expenseData = buckets.map(b => {
      let sum = 0
      for (let d = b.start; d <= b.end; d = addDaysToDateStr(d, 1)) {
        sum += expMap[d] || 0
      }
      return sum
    })
  }

  const totalIncome = incomeData.reduce((s, v) => s + v, 0)
  const totalExpense = expenseData.reduce((s, v) => s + v, 0)
  const netProfit = totalIncome - totalExpense

  let items = []
  if (reportsCurrentTab === 'daily') {
    for (let i = 0; i < dates.length; i++) {
      const profit = incomeData[i] - expenseData[i]
      items.push({
        label: labels[i],
        income: incomeData[i],
        expense: expenseData[i],
        profit: profit
      })
    }
  } else {
    for (let i = 0; i < buckets.length; i++) {
      const profit = incomeData[i] - expenseData[i]
      items.push({
        label: labels[i],
        income: incomeData[i],
        expense: expenseData[i],
        profit: profit
      })
    }
  }
  items.reverse()

  const total = items.length
  const pageSize = getEffectiveReportsPageSize(total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!_reportsPage || _reportsPage < 1) _reportsPage = 1
  if (_reportsPage > totalPages) _reportsPage = totalPages

  const start = total === 0 ? 0 : (_reportsPage - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)

  let tableRows = pageItems.map(item => {
    const profitClass = item.profit >= 0 ? 'text-success' : 'text-danger'
    return `
      <tr>
        <td class="font-bold text-brand-navy col-date">${escapeHtml(item.label)}</td>
        <td class="text-success col-nominal">${formatRupiah(item.income)}</td>
        <td class="text-danger col-nominal">${formatRupiah(item.expense)}</td>
        <td class="font-bold ${profitClass} col-nominal">${formatRupiah(item.profit)}</td>
      </tr>
    `
  }).join('')

  const totalRowHtml = `
    <tr class="table-total-row">
      <td class="total-label">TOTAL</td>
      <td class="col-nominal">${formatRupiah(totalIncome)}</td>
      <td class="col-nominal">${formatRupiah(totalExpense)}</td>
      <td class="col-nominal">${formatRupiah(netProfit)}</td>
    </tr>
  `
  tableRows += totalRowHtml

  content.innerHTML = `
    <div class="products-table-card" style="margin-top:24px">
      <div class="products-table-scroll">
        <table class="products-data-table">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Total Pemasukan</th>
              <th>Total Pengeluaran</th>
              <th>Laba Bersih</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      <div class="products-table-footer" id="reportTableFooter"></div>
    </div>
  `

  renderReportsPagination(total, start, pageItems.length, totalPages)

  window._currentReportCache = {
    type: 'global',
    tab: reportsCurrentTab,
    labels,
    incomeData,
    expenseData,
    totalIncome,
    totalExpense,
    netProfit,
    today
  }
}

function exportReportsPDF() {
  const cache = window._currentReportCache
  if (!cache) {
    showToast('Data laporan belum siap atau gagal dimuat.', 'error')
    return
  }

  const tabLabel = cache.tab === 'daily' ? 'Harian' : cache.tab === 'weekly' ? 'Mingguan' : 'Bulanan'
  let title = ''
  let headers = []
  let rows = []

  if (cache.type === 'income') {
    title = `Laporan Pemasukan ${tabLabel} (${cache.today})`
    headers = ['Periode', 'Transaksi', 'Penjualan (Kasir)', 'Pemasukan Manual', 'Total Pemasukan']
    
    const len = cache.tab === 'monthly' ? (new Date().getMonth() + 1) : cache.labels.length
    if (cache.tab === 'monthly') {
      for (let i = len - 1; i >= 0; i--) {
        const comb = cache.salesData[i] + cache.manualIncData[i]
        rows.push([
          `${cache.labels[i]} ${cache.today.slice(0, 4)}`,
          `${cache.txCountData[i].toLocaleString('id-ID')} Transaksi`,
          formatRupiah(cache.salesData[i]),
          formatRupiah(cache.manualIncData[i]),
          formatRupiah(comb)
        ])
      }
    } else {
      for (let i = len - 1; i >= 0; i--) {
        const comb = cache.salesData[i] + cache.manualIncData[i]
        rows.push([
          cache.labels[i],
          `${cache.txCountData[i].toLocaleString('id-ID')} Transaksi`,
          formatRupiah(cache.salesData[i]),
          formatRupiah(cache.manualIncData[i]),
          formatRupiah(comb)
        ])
      }
    }
    rows.push([
      'TOTAL',
      `${cache.totalTx.toLocaleString('id-ID')} Transaksi`,
      formatRupiah(cache.totalSales),
      formatRupiah(cache.totalManual),
      formatRupiah(cache.totalCombined)
    ])

  } else if (cache.type === 'expense') {
    title = `Laporan Pengeluaran ${tabLabel} (${cache.today})`
    headers = ['Periode', 'Total Pengeluaran']
    
    const len = cache.tab === 'monthly' ? (new Date().getMonth() + 1) : cache.labels.length
    if (cache.tab === 'monthly') {
      for (let i = len - 1; i >= 0; i--) {
        rows.push([
          `${cache.labels[i]} ${cache.today.slice(0, 4)}`,
          formatRupiah(cache.expenseData[i])
        ])
      }
    } else {
      for (let i = len - 1; i >= 0; i--) {
        rows.push([
          cache.labels[i],
          formatRupiah(cache.expenseData[i])
        ])
      }
    }
    rows.push([
      'TOTAL',
      formatRupiah(cache.totalExpense)
    ])

  } else if (cache.type === 'global') {
    title = `Laporan Keuangan Global ${tabLabel} (${cache.today})`
    headers = ['Periode', 'Total Pemasukan', 'Total Pengeluaran', 'Laba Bersih']
    
    const len = cache.tab === 'monthly' ? (new Date().getMonth() + 1) : cache.labels.length
    if (cache.tab === 'monthly') {
      for (let i = len - 1; i >= 0; i--) {
        const profit = cache.incomeData[i] - cache.expenseData[i]
        rows.push([
          `${cache.labels[i]} ${cache.today.slice(0, 4)}`,
          formatRupiah(cache.incomeData[i]),
          formatRupiah(cache.expenseData[i]),
          formatRupiah(profit)
        ])
      }
    } else {
      for (let i = len - 1; i >= 0; i--) {
        const profit = cache.incomeData[i] - cache.expenseData[i]
        rows.push([
          cache.labels[i],
          formatRupiah(cache.incomeData[i]),
          formatRupiah(cache.expenseData[i]),
          formatRupiah(profit)
        ])
      }
    }
    rows.push([
      'TOTAL',
      formatRupiah(cache.totalIncome),
      formatRupiah(cache.totalExpense),
      formatRupiah(cache.netProfit)
    ])
  }

  printTableToPDF(title, headers, rows)
}

window.switchReportTab = switchReportTab
window.cancelReportsRender = cancelReportsRender
window.renderReportsIncome = renderReportsIncome
window.renderReportsExpense = renderReportsExpense
window.renderReportsGlobal = renderReportsGlobal
window.exportReportsPDF = exportReportsPDF
