let _expensesSearch = ''
let _expensesStart = null
let _expensesEnd = null
let _expensesPage = 1
let _expensesPageSize = 10

async function renderExpenses(container) {
  try {
    const start = _expensesStart || todayStr()
    const end = _expensesEnd || todayStr()
    _expensesStart = start
    _expensesEnd = end
    _expensesPage = 1

    container.innerHTML = `
      ${adminPageNote('fas fa-minus-circle', 'Pengeluaran Kas', 'Catat pengeluaran operasional koperasi sekolah, belanja stok produk, pembayaran tagihan, dll.')}
      
      <div class="income-expense-bar">
        <div class="search-row">
          <input type="search" id="expenseSearch" class="products-filter-select"
            placeholder="Cari keterangan..." value="${escapeHtml(_expensesSearch)}"
            oninput="setExpensesSearch(this.value)">
        </div>
        <div class="date-row">
          <input type="date" id="expenseStart" value="${start}">
          <input type="date" id="expenseEnd" value="${end}">
        </div>
        <div class="button-row">
          <button class="btn btn-primary btn-sm search-btn" onclick="loadExpenses()"><i class="fas fa-search"></i> Cari</button>
          <button class="btn btn-primary btn-danger add-btn" style="background-color:var(--danger)" onclick="showExpenseModal()"><i class="fas fa-plus"></i> Tambah Pengeluaran</button>
        </div>
      </div>

      <div class="products-table-card">
        <div class="products-table-scroll">
          <table class="products-data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Tanggal</th>
                <th>Keterangan</th>
                <th>Nominal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="expensesTableBody">
            </tbody>
          </table>
        </div>
        <div class="products-table-footer" id="expenseTableFooter"></div>
      </div>
    `
    await loadExpenses()
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`
  }
}

function renderExpenseRows(expenses, totalAmount, startIndex = 0) {
  if (!expenses.length) {
    return '<tr><td colspan="5"><div class="empty-state"><div class="icon">💸</div><h3>Belum ada data pengeluaran</h3><p>Klik tombol tambah untuk mencatat pengeluaran baru atau ubah filter tanggal</p></div></td></tr>'
  }
  const rows = expenses.map((exp, i) => {
    const formattedDate = new Date(exp.created_at).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    return `
      <tr>
        <td class="col-no">${startIndex + i + 1}</td>
        <td class="col-date">${formattedDate}</td>
        <td class="col-desc"><strong>${escapeHtml(exp.description || 'Pengeluaran Lainnya')}</strong></td>
        <td class="font-bold text-danger col-nominal">${formatRupiah(exp.amount)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-danger" onclick="deleteExpense(${exp.id})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `
  }).join('')

  const totalRowHtml = `
    <tr class="table-total-row">
      <td class="total-label">TOTAL</td>
      <td></td>
      <td></td>
      <td class="col-nominal">${formatRupiah(totalAmount)}</td>
      <td></td>
    </tr>
  `
  return rows + totalRowHtml
}

async function loadExpenses() {
  let start = document.getElementById('expenseStart')?.value
  let end = document.getElementById('expenseEnd')?.value
  if (!start || !end) return
  if (start > end) [start, end] = [end, start]

  _expensesStart = start
  _expensesEnd = end
  _expensesPage = 1

  try {
    const { data: expenses, error } = await api.getExpensesByDateRange(start, end)
    if (error) throw error

    window._expensesCache = expenses || []
    window._expensesCache.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    filterExpensesTable()
  } catch (err) {
    showToast('Gagal memuat: ' + (err.message || err), 'error')
  }
}

function filterExpensesTable() {
  if (!window._expensesCache) return
  const q = (_expensesSearch || '').trim().toLowerCase()
  const filtered = window._expensesCache.filter(exp => {
    if (!q) return true
    return String(exp.description || '').toLowerCase().includes(q)
  })

  const total = filtered.length
  const pageSize = getEffectiveExpensesPageSize(total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!_expensesPage || _expensesPage < 1) _expensesPage = 1
  if (_expensesPage > totalPages) _expensesPage = totalPages

  const start = total === 0 ? 0 : (_expensesPage - 1) * pageSize
  const pageItems = filtered.slice(start, start + pageSize)

  const totalAmount = filtered.reduce((s, exp) => s + Number(exp.amount || 0), 0)

  const tbody = document.getElementById('expensesTableBody')
  if (tbody) tbody.innerHTML = renderExpenseRows(pageItems, totalAmount, start)

  renderExpensesPagination(total, start, pageItems.length, totalPages)
}

function getEffectiveExpensesPageSize(total) {
  const size = _expensesPageSize
  return size === -1 ? total : (size || 10)
}

function buildExpensesPageNumbers(current, total) {
  const pages = [1]
  if (current > 3) pages.push('...')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    if (!pages.includes(p)) pages.push(p)
  }
  if (current < total - 2) pages.push('...')
  if (total > 1 && !pages.includes(total)) pages.push(total)
  return pages
}

function renderExpensesPagination(total, start, shown, totalPages) {
  const footer = document.getElementById('expenseTableFooter')
  if (!footer) return

  if (total === 0) {
    footer.innerHTML = '<span class="products-table-info">Menampilkan 0 data</span>'
    return
  }

  const end = start + shown
  const page = _expensesPage || 1
  const pageSize = _expensesPageSize ?? 10
  const pages = buildExpensesPageNumbers(page, totalPages)
  const paginationHtml = (pageSize <= 0 || totalPages <= 1) ? '' : `
    <div class="products-pagination">
      <button type="button" onclick="setExpensesPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>« Prev</button>
      ${pages.map(p => {
        if (p === '...') return '<span class="products-page-ellipsis">...</span>'
        return `<button type="button" class="${p === page ? 'active' : ''}" onclick="setExpensesPage(${p})">${p}</button>`
      }).join('')}
      <button type="button" onclick="setExpensesPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next »</button>
    </div>
  `

  footer.innerHTML = `
    <span class="products-table-info">Menampilkan ${start + 1}-${end} dari ${total} data</span>
    <div class="products-table-controls">
      <select class="products-page-size" onchange="setExpensesPageSize(Number(this.value))" aria-label="Jumlah baris per halaman">
        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / Hal</option>
        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / Hal</option>
        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / Hal</option>
      </select>
      ${paginationHtml}
    </div>
  `
}

function setExpensesPage(page) {
  _expensesPage = page
  filterExpensesTable()
}

function setExpensesPageSize(size) {
  _expensesPageSize = size
  _expensesPage = 1
  filterExpensesTable()
}

function setExpensesSearch(val) {
  _expensesSearch = val
  filterExpensesTable()
}

function showExpenseModal() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.display = 'flex'
  overlay.innerHTML = `
    <div class="modal modal-md">
      ${modalHeader('💸', 'Tambah Pengeluaran', 'Catat kas keluar baru', 'danger')}
      <div class="modal-body">
        <form id="expenseForm">
          <div class="form-group">
            <label>Nominal Pengeluaran (Rp)</label>
            <input type="text" id="expAmount" class="input-rupiah" placeholder="Contoh: 150.000" required>
          </div>
          <div class="form-group">
            <label>Keterangan / Tujuan</label>
            <textarea id="expDesc" placeholder="Contoh: Belanja Minuman Dingin, Bayar Kebersihan, dll" required rows="3"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">✖️ Batal</button>
            <button type="submit" class="btn btn-primary" style="background-color:var(--danger)">✅ Simpan</button>
          </div>
        </form>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  if (typeof attachRupiahInput === 'function') {
    attachRupiahInput(document.getElementById('expAmount'))
  }

  document.getElementById('expenseForm').onsubmit = async (e) => {
    e.preventDefault()
    const btn = overlay.querySelector('button[type="submit"]')
    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'

    const data = {
      amount: parseRupiahInput(document.getElementById('expAmount').value),
      description: document.getElementById('expDesc').value
    }

    const { error } = await api.addExpense(data)
    if (error) {
      showToast('Gagal: ' + error.message, 'error')
      btn.disabled = false
      btn.innerHTML = 'Simpan'
    } else {
      overlay.remove()
      showToast('Pengeluaran berhasil dicatat', 'success')
      renderExpenses(document.getElementById('pageContent'))
    }
  }
}

async function deleteExpense(id) {
  const confirm = await confirmDialog('Yakin ingin menghapus catatan pengeluaran ini?')
  if (!confirm) return
  const { error } = await api.deleteExpense(id)
  if (error) {
    showToast('Gagal: ' + error.message, 'error')
  } else {
    showToast('Pengeluaran berhasil dihapus', 'success')
    renderExpenses(document.getElementById('pageContent'))
  }
}

function getFilteredExpensesData() {
  const q = (_expensesSearch || '').trim().toLowerCase()
  return (window._expensesCache || []).filter(exp => {
    if (!q) return true
    return String(exp.description || '').toLowerCase().includes(q)
  })
}

function exportExpensesExcel() {
  const filtered = getFilteredExpensesData()
  const headers = ['ID', 'Tanggal', 'Keterangan', 'Nominal']
  const rows = filtered.map(exp => [
    exp.id,
    new Date(exp.created_at).toLocaleString('id-ID'),
    exp.description,
    exp.amount
  ])
  downloadExcel(`pengeluaran_${_expensesStart}_to_${_expensesEnd}.xlsx`, headers, rows)
}

function exportExpensesPDF() {
  const filtered = getFilteredExpensesData()
  const headers = ['ID', 'Tanggal', 'Keterangan', 'Nominal']
  const rows = filtered.map(exp => [
    exp.id,
    new Date(exp.created_at).toLocaleString('id-ID'),
    exp.description || '-',
    formatRupiah(exp.amount)
  ])
  printTableToPDF(`Laporan Kas Pengeluaran (${_expensesStart} s/d ${_expensesEnd})`, headers, rows)
}

window.renderExpenses = renderExpenses
window.showExpenseModal = showExpenseModal
window.deleteExpense = deleteExpense
window.setExpensesSearch = setExpensesSearch
window.loadExpenses = loadExpenses
window.exportExpensesExcel = exportExpensesExcel
window.exportExpensesPDF = exportExpensesPDF
