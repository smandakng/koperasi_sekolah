let txLoadToken = 0
let txFilterStart = null
let txFilterEnd = null
let txPaymentFilter = 'all'
let txCashierFilter = 'all'
let txAllTransactions = []
let _txPage = 1
let _txPageSize = 10

async function renderTransactions(container) {
  try {
    const start = txFilterStart || todayStr()
    const end = txFilterEnd || todayStr()
    const { data: users } = await api.getUsers()
    const cashiers = (users || []).filter(u => u.role === 'kasir' || u.role === 'admin')

    container.innerHTML = `
      ${adminPageNote('fas fa-receipt', 'Data Transaksi', 'Riwayat dan detail penjualan dari seluruh transaksi kasir Koperasi.')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">

        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <select id="txPaymentFilter" class="products-filter-select" onchange="loadTransactions()" style="height:38px" aria-label="Filter metode bayar">
            <option value="all" ${txPaymentFilter === 'all' ? 'selected' : ''}>Semua Bayar</option>
            <option value="Tunai" ${txPaymentFilter === 'Tunai' ? 'selected' : ''}>Tunai</option>
            <option value="QRIS" ${txPaymentFilter === 'QRIS' ? 'selected' : ''}>QRIS</option>
          </select>
          <select id="txCashierFilter" class="products-filter-select" onchange="loadTransactions()" style="height:38px" aria-label="Filter kasir">
            <option value="all" ${txCashierFilter === 'all' ? 'selected' : ''}>Semua Kasir</option>
            ${cashiers.map(u => `
              <option value="${u.id}" ${String(txCashierFilter) === String(u.id) ? 'selected' : ''}>${escapeHtml(u.full_name)}</option>
            `).join('')}
          </select>
          <input type="date" id="txStart" value="${start}" style="width:140px;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:8px">
          <input type="date" id="txEnd" value="${end}" style="width:140px;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:8px">
          <button class="btn btn-primary btn-sm" onclick="loadTransactions()" style="height:38px"><i class="fas fa-search"></i> Cari</button>
        </div>
      </div>
      <div class="dashboard-section-header" style="margin-top:4px">
        <i class="fas fa-list-ul"></i>
        <span>Rincian Transaksi</span>
      </div>
      <div class="products-table-card">
        <div class="products-table-scroll">
          <table class="products-data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Waktu</th>
                <th class="col-nominal">Item</th>
                <th class="col-nominal">Total</th>
                <th>Bayar</th>
                <th>Kasir</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="txTableBody">
            </tbody>
          </table>
        </div>
        <div class="products-table-footer" id="txTableFooter"></div>
      </div>
    `
    _txPage = 1
    await loadTransactions()
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`
  }
}

function getFilteredTransactions(transactions) {
  const paymentFilter = document.getElementById('txPaymentFilter')?.value || txPaymentFilter || 'all'
  const cashierFilter = document.getElementById('txCashierFilter')?.value || txCashierFilter || 'all'
  txPaymentFilter = paymentFilter
  txCashierFilter = cashierFilter

  return (transactions || []).filter(tx => {
    const matchPayment = paymentFilter === 'all' || (tx.payment_method || 'Tunai') === paymentFilter
    const matchCashier = cashierFilter === 'all' ||
      String(tx.cashier_id) === String(cashierFilter)
    return matchPayment && matchCashier
  })
}

async function loadTransactions() {
  const token = ++txLoadToken
  let startStr = document.getElementById('txStart')?.value
  let endStr = document.getElementById('txEnd')?.value
  if (!startStr || !endStr) return
  if (startStr > endStr) [startStr, endStr] = [endStr, startStr]

  txFilterStart = startStr
  txFilterEnd = endStr

  try {
    const { data, error } = await api.getTransactionsByDateRange(startStr, endStr)
    if (error) throw error
    if (token !== txLoadToken) return

    const tbody = document.getElementById('txTableBody')
    if (!tbody) return

    txAllTransactions = data || []
    const transactions = getFilteredTransactions(txAllTransactions)

    let totalItems = 0
    transactions.forEach(tx => {
      if (tx.transaction_items) {
        totalItems += tx.transaction_items.reduce((s, i) => s + i.quantity, 0)
      }
    })
    const totalRev = transactions.reduce((s, t) => s + Number(t.total_amount), 0)
    const avg = transactions.length > 0 ? totalRev / transactions.length : 0

    if (transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="icon">📭</div><h3>Tidak ada transaksi</h3><p>Ubah filter atau pilih tanggal lain</p></div></td></tr>'
      renderTxPagination(0, 0, 0, 1)
      return
    }

    const total = transactions.length
    const pageSize = getEffectiveTxPageSize(total)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    if (!_txPage || _txPage < 1) _txPage = 1
    if (_txPage > totalPages) _txPage = totalPages

    const startIdx = total === 0 ? 0 : (_txPage - 1) * pageSize
    const pageItems = transactions.slice(startIdx, startIdx + pageSize)

    const totalRowHtml = `
      <tr class="table-total-row">
        <td class="total-label">TOTAL</td>
        <td></td>
        <td class="col-qty">${totalItems.toLocaleString('id-ID')}</td>
        <td class="col-nominal">${formatRupiah(totalRev)}</td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `

    tbody.innerHTML = pageItems.map(tx => {
      const items = tx.transaction_items || []
      const qtySold = items.reduce((s, i) => s + Number(i.quantity || 0), 0)
      const itemSummary = items.map(i => `${i.product_name} x${i.quantity}`).join(', ')
      const pm = tx.payment_method || 'Tunai'
      const pmClass = pm.toLowerCase() === 'qris' ? 'badge-payment-qris' : 'badge-payment-tunai'
      return `<tr>
        <td><strong>#${tx.id}</strong></td>
        <td class="col-date">${formatDate(tx.created_at, true)}</td>
        <td class="col-qty" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(itemSummary)}">${qtySold}</td>
        <td class="col-nominal"><strong>${formatRupiah(tx.total_amount)}</strong></td>
        <td><span class="badge ${pmClass}">${escapeHtml(pm)}</span></td>
        <td class="col-cashier">${escapeHtml(tx.cashier_name || '-')}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-outline" onclick="viewTransaction(${tx.id})"><i class="fas fa-eye"></i></button>
          </div>
        </td>
      </tr>`
    }).join('') + totalRowHtml

    renderTxPagination(total, startIdx, pageItems.length, totalPages)
  } catch (err) {
    if (token !== txLoadToken) return
    showToast('Gagal memuat: ' + (err.message || err), 'error')
  }
}

function getEffectiveTxPageSize(total) {
  const size = _txPageSize
  return size === -1 ? total : (size || 10)
}

function buildTxPageNumbers(current, total) {
  const pages = [1]
  if (current > 3) pages.push('...')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    if (!pages.includes(p)) pages.push(p)
  }
  if (current < total - 2) pages.push('...')
  if (total > 1 && !pages.includes(total)) pages.push(total)
  return pages
}

function renderTxPagination(total, start, shown, totalPages) {
  const footer = document.getElementById('txTableFooter')
  if (!footer) return

  if (total === 0) {
    footer.innerHTML = '<span class="products-table-info">Menampilkan 0 data</span>'
    return
  }

  const end = start + shown
  const page = _txPage || 1
  const pageSize = _txPageSize ?? 10
  const pages = buildTxPageNumbers(page, totalPages)
  const paginationHtml = (pageSize <= 0 || totalPages <= 1) ? '' : `
    <div class="products-pagination">
      <button type="button" onclick="setTxPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>« Prev</button>
      ${pages.map(p => {
        if (p === '...') return '<span class="products-page-ellipsis">...</span>'
        return `<button type="button" class="${p === page ? 'active' : ''}" onclick="setTxPage(${p})">${p}</button>`
      }).join('')}
      <button type="button" onclick="setTxPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next »</button>
    </div>
  `

  footer.innerHTML = `
    <span class="products-table-info">Menampilkan ${start + 1}-${end} dari ${total} data</span>
    <div class="products-table-controls">
      <select class="products-page-size" onchange="setTxPageSize(Number(this.value))" aria-label="Jumlah baris per halaman">
        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / Hal</option>
        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / Hal</option>
        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / Hal</option>
      </select>
      ${paginationHtml}
    </div>
  `
}

function setTxPage(page) {
  _txPage = page
  loadTransactions()
}

function setTxPageSize(size) {
  _txPageSize = size
  _txPage = 1
  loadTransactions()
}

async function viewTransaction(id) {
  const { data: tx, error } = await api.getTransactionById(id)
  if (error || !tx) {
    showToast('Transaksi tidak ditemukan', 'error')
    return
  }

  const items = tx.transaction_items || []
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.display = 'flex'
  overlay.innerHTML = `
    <div class="modal modal-lg">
      ${modalHeader('🧾', `Detail Transaksi #${tx.id}`, 'Informasi lengkap transaksi Koperasi', 'info')}
      <div class="modal-body">
      <div class="modal-meta">
        <span>📅 ${formatDate(tx.created_at, true)}</span>
        <span>👤 Kasir: ${escapeHtml(tx.cashier_name || '-')}</span>
      </div>
      <div class="modal-meta-badges" style="margin-bottom:14px">
        <span class="badge badge-info">💳 ${escapeHtml(tx.payment_method || 'Tunai')}</span>
        <span class="badge badge-success">🛍️ ${items.length} item</span>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-bottom:12px">
        <table class="modal-detail-table">
          <thead>
            <tr><th>Produk</th><th>Qty</th><th>Harga Jual</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td class="col-product">${escapeHtml(item.product_name)}</td>
                <td class="col-qty">${item.quantity}</td>
                <td class="col-nominal">${formatRupiah(item.price)}</td>
                <td class="col-nominal"><strong>${formatRupiah(item.subtotal)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="modal-total-bar">
        <strong>💰 TOTAL</strong>
        <strong>${formatRupiah(tx.total_amount)}</strong>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">✖️ Tutup</button>
        <button class="btn btn-primary" onclick="printTransaction(${tx.id})"><i class="fas fa-print"></i> Cetak Ulang</button>
      </div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function printTransaction(id) {
  const { data: tx, error } = await api.getTransactionById(id)
  if (error || !tx) {
    showToast('Transaksi tidak ditemukan', 'error')
    return
  }
  printReceipt(tx, tx.transaction_items || [])
}

function exportTransactionsExcel() {
  const filtered = getFilteredTransactions(txAllTransactions)
  const headers = ['ID', 'Waktu', 'Nominal Transaksi', 'Metode Pembayaran', 'Kasir', 'Nomor Transaksi', 'Buyer Ref']
  const rows = filtered.map(tx => [
    tx.id,
    formatDate(tx.created_at, true),
    tx.total_amount,
    tx.payment_method || 'Tunai',
    tx.cashier_name || '-',
    tx.transaction_number || '',
    tx.buyer_ref || ''
  ])
  downloadExcel(`transaksi_${txFilterStart}_to_${txFilterEnd}.xlsx`, headers, rows)
}

function exportTransactionsPDF() {
  const filtered = getFilteredTransactions(txAllTransactions)
  const headers = ['Invoice', 'Waktu', 'Nominal', 'Pembayaran', 'Kasir', 'No. Transaksi']
  const rows = filtered.map(tx => [
    `#${tx.id}`,
    formatDate(tx.created_at, true),
    formatRupiah(tx.total_amount),
    tx.payment_method || 'Tunai',
    tx.cashier_name || '-',
    tx.transaction_number || '-'
  ])
  printTableToPDF(`Laporan Transaksi Penjualan (${txFilterStart} s/d ${txFilterEnd})`, headers, rows)
}

window.loadTransactions = loadTransactions
window.viewTransaction = viewTransaction
window.printTransaction = printTransaction
window.exportTransactionsExcel = exportTransactionsExcel
window.exportTransactionsPDF = exportTransactionsPDF
