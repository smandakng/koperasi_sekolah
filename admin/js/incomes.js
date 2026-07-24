let _incomesSearch = ''
let _incomesStart = null
let _incomesEnd = null
let _incomesPage = 1
let _incomesPageSize = 10

async function renderIncomes(container) {
  try {
    const start = _incomesStart || todayStr()
    const end = _incomesEnd || todayStr()
    _incomesStart = start
    _incomesEnd = end
    _incomesPage = 1

    container.innerHTML = `
      ${adminPageNote('fas fa-plus-circle', 'Pemasukan Kas', 'Catat pemasukan kas manual (diluar penjualan kasir) seperti modal awal, pendapatan sewa, dll.')}
      
      <div class="income-expense-bar">
        <div class="search-row">
          <input type="search" id="incomeSearch" class="products-filter-select"
            placeholder="Cari keterangan..." value="${escapeHtml(_incomesSearch)}"
            oninput="setIncomesSearch(this.value)">
        </div>
        <div class="date-row">
          <input type="date" id="incomeStart" value="${start}">
          <input type="date" id="incomeEnd" value="${end}">
        </div>
        <div class="button-row">
          <button class="btn btn-primary btn-sm search-btn" onclick="loadIncomes()"><i class="fas fa-search"></i> Cari</button>
          <button class="btn btn-primary add-btn" onclick="showIncomeModal()"><i class="fas fa-plus"></i> Tambah Pemasukan</button>
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
            <tbody id="incomesTableBody">
            </tbody>
          </table>
        </div>
        <div class="products-table-footer" id="incomeTableFooter"></div>
      </div>
    `
    await loadIncomes()
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`
  }
}

function renderIncomeRows(incomes, totalAmount, startIndex = 0) {
  if (!incomes.length) {
    return '<tr><td colspan="5"><div class="empty-state"><div class="icon">💵</div><h3>Belum ada data pemasukan</h3><p>Klik tombol tambah untuk mencatat pemasukan baru atau ubah filter tanggal</p></div></td></tr>'
  }
  const rows = incomes.map((inc, i) => {
    const formattedDate = new Date(inc.created_at).toLocaleDateString('id-ID', {
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
        <td class="col-desc"><strong>${escapeHtml(inc.description || 'Pemasukan Lainnya')}</strong></td>
        <td class="font-bold text-success col-nominal">${formatRupiah(inc.amount)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-danger" onclick="deleteIncome(${inc.id})">
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

async function loadIncomes() {
  let start = document.getElementById('incomeStart')?.value
  let end = document.getElementById('incomeEnd')?.value
  if (!start || !end) return
  if (start > end) [start, end] = [end, start]

  _incomesStart = start
  _incomesEnd = end
  _incomesPage = 1

  try {
    const { data: incomes, error } = await api.getIncomesByDateRange(start, end)
    if (error) throw error

    window._incomesCache = incomes || []
    window._incomesCache.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    filterIncomesTable()
  } catch (err) {
    showToast('Gagal memuat: ' + (err.message || err), 'error')
  }
}

function filterIncomesTable() {
  if (!window._incomesCache) return
  const q = (_incomesSearch || '').trim().toLowerCase()
  const filtered = window._incomesCache.filter(inc => {
    if (!q) return true
    return String(inc.description || '').toLowerCase().includes(q)
  })

  const total = filtered.length
  const pageSize = getEffectiveIncomesPageSize(total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!_incomesPage || _incomesPage < 1) _incomesPage = 1
  if (_incomesPage > totalPages) _incomesPage = totalPages

  const start = total === 0 ? 0 : (_incomesPage - 1) * pageSize
  const pageItems = filtered.slice(start, start + pageSize)

  const totalAmount = filtered.reduce((s, inc) => s + Number(inc.amount || 0), 0)

  const tbody = document.getElementById('incomesTableBody')
  if (tbody) tbody.innerHTML = renderIncomeRows(pageItems, totalAmount, start)

  renderIncomesPagination(total, start, pageItems.length, totalPages)
}

function getEffectiveIncomesPageSize(total) {
  const size = _incomesPageSize
  return size === -1 ? total : (size || 10)
}

function buildIncomesPageNumbers(current, total) {
  const pages = [1]
  if (current > 3) pages.push('...')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    if (!pages.includes(p)) pages.push(p)
  }
  if (current < total - 2) pages.push('...')
  if (total > 1 && !pages.includes(total)) pages.push(total)
  return pages
}

function renderIncomesPagination(total, start, shown, totalPages) {
  const footer = document.getElementById('incomeTableFooter')
  if (!footer) return

  if (total === 0) {
    footer.innerHTML = '<span class="products-table-info">Menampilkan 0 data</span>'
    return
  }

  const end = start + shown
  const page = _incomesPage || 1
  const pageSize = _incomesPageSize ?? 10
  const pages = buildIncomesPageNumbers(page, totalPages)
  const paginationHtml = (pageSize <= 0 || totalPages <= 1) ? '' : `
    <div class="products-pagination">
      <button type="button" onclick="setIncomesPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>« Prev</button>
      ${pages.map(p => {
        if (p === '...') return '<span class="products-page-ellipsis">...</span>'
        return `<button type="button" class="${p === page ? 'active' : ''}" onclick="setIncomesPage(${p})">${p}</button>`
      }).join('')}
      <button type="button" onclick="setIncomesPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next »</button>
    </div>
  `

  footer.innerHTML = `
    <span class="products-table-info">Menampilkan ${start + 1}-${end} dari ${total} data</span>
    <div class="products-table-controls">
      <select class="products-page-size" onchange="setIncomesPageSize(Number(this.value))" aria-label="Jumlah baris per halaman">
        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / Hal</option>
        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / Hal</option>
        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / Hal</option>
      </select>
      ${paginationHtml}
    </div>
  `
}

function setIncomesPage(page) {
  _incomesPage = page
  filterIncomesTable()
}

function setIncomesPageSize(size) {
  _incomesPageSize = size
  _incomesPage = 1
  filterIncomesTable()
}

function setIncomesSearch(val) {
  _incomesSearch = val
  filterIncomesTable()
}

function showIncomeModal() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.display = 'flex'
  overlay.innerHTML = `
    <div class="modal modal-md">
      ${modalHeader('💰', 'Tambah Pemasukan', 'Catat kas masuk baru', 'primary')}
      <div class="modal-body">
        <form id="incomeForm">
          <div class="form-group">
            <label>Nominal Pemasukan (Rp)</label>
            <input type="text" id="incAmount" class="input-rupiah" placeholder="Contoh: 500.000" required>
          </div>
          <div class="form-group">
            <label>Keterangan / Sumber</label>
            <textarea id="incDesc" placeholder="Contoh: Modal Awal Koperasi, Sumbangan Alumni, dll" required rows="3"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">✖️ Batal</button>
            <button type="submit" class="btn btn-primary">✅ Simpan</button>
          </div>
        </form>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  
  if (typeof attachRupiahInput === 'function') {
    attachRupiahInput(document.getElementById('incAmount'))
  }

  document.getElementById('incomeForm').onsubmit = async (e) => {
    e.preventDefault()
    const btn = overlay.querySelector('button[type="submit"]')
    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'

    const data = {
      amount: parseRupiahInput(document.getElementById('incAmount').value),
      description: document.getElementById('incDesc').value
    }

    const { error } = await api.addIncome(data)
    if (error) {
      showToast('Gagal: ' + error.message, 'error')
      btn.disabled = false
      btn.innerHTML = 'Simpan'
    } else {
      overlay.remove()
      showToast('Pemasukan berhasil dicatat', 'success')
      renderIncomes(document.getElementById('pageContent'))
    }
  }
}

async function deleteIncome(id) {
  const confirm = await confirmDialog('Yakin ingin menghapus catatan pemasukan ini?')
  if (!confirm) return
  const { error } = await api.deleteIncome(id)
  if (error) {
    showToast('Gagal: ' + error.message, 'error')
  } else {
    showToast('Pemasukan berhasil dihapus', 'success')
    renderIncomes(document.getElementById('pageContent'))
  }
}

function getFilteredIncomesData() {
  const q = (_incomesSearch || '').trim().toLowerCase()
  return (window._incomesCache || []).filter(inc => {
    if (!q) return true
    return String(inc.description || '').toLowerCase().includes(q)
  })
}

function exportIncomesExcel() {
  const filtered = getFilteredIncomesData()
  const headers = ['ID', 'Tanggal', 'Keterangan', 'Nominal']
  const rows = filtered.map(inc => [
    inc.id,
    new Date(inc.created_at).toLocaleString('id-ID'),
    inc.description,
    inc.amount
  ])
  downloadExcel(`pemasukan_${_incomesStart}_to_${_incomesEnd}.xlsx`, headers, rows)
}

function exportIncomesPDF() {
  const filtered = getFilteredIncomesData()
  const headers = ['ID', 'Tanggal', 'Keterangan', 'Nominal']
  const rows = filtered.map(inc => [
    inc.id,
    new Date(inc.created_at).toLocaleString('id-ID'),
    inc.description || '-',
    formatRupiah(inc.amount)
  ])
  printTableToPDF(`Laporan Kas Pemasukan Manual (${_incomesStart} s/d ${_incomesEnd})`, headers, rows)
}

window.renderIncomes = renderIncomes
window.showIncomeModal = showIncomeModal
window.deleteIncome = deleteIncome
window.setIncomesSearch = setIncomesSearch
window.loadIncomes = loadIncomes
window.exportIncomesExcel = exportIncomesExcel
window.exportIncomesPDF = exportIncomesPDF
