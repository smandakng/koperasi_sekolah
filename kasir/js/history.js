let kasirHistoryDate = null

async function renderKasirHistory(container) {
  if (!window._kasirFilter) window._kasirFilter = 'all'
  const dateVal = kasirHistoryDate || todayStr()

  container.innerHTML = `
    <div class="min-h-full bg-gray-100 p-4 md:p-8">
      <div class="max-w-2xl mx-auto">
        <h2 class="text-xl font-black text-brand-navy mb-4">📋 ${typeof Auth.isSelfOrder === 'function' && Auth.isSelfOrder() ? 'Riwayat Pesanan Saya' : 'Riwayat Transaksi Saya'}</h2>

        <div class="flex gap-2 mb-4">
          <input type="date" id="kasirTxDate" value="${dateVal}"
            class="flex-1 py-3 px-4 bg-white border-2 border-gray-100 rounded-xl font-semibold text-sm focus:border-brand-blue outline-none"
            onchange="loadKasirTransactions()">
          <button type="button" onclick="loadKasirTransactions()"
            class="w-12 h-12 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blueHover transition-all active:scale-95">
            <i class="fas fa-sync"></i>
          </button>
        </div>

        <div id="kasirFilterBar" class="flex gap-2 mb-4 overflow-x-auto hide-scroll pb-1">
          <button type="button" class="kasir-filter-btn px-4 py-2 rounded-full text-xs font-bold border-2 border-brand-blue bg-brand-blue text-white" data-filter="all" onclick="setKasirFilter('all')">Semua</button>
          <button type="button" class="kasir-filter-btn px-4 py-2 rounded-full text-xs font-bold border-2 border-gray-200 bg-white text-gray-500" data-filter="Tunai" onclick="setKasirFilter('Tunai')">💵 Tunai</button>
          <button type="button" class="kasir-filter-btn px-4 py-2 rounded-full text-xs font-bold border-2 border-gray-200 bg-white text-gray-500" data-filter="QRIS" onclick="setKasirFilter('QRIS')">📱 QRIS</button>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div class="text-2xl font-black text-brand-navy" id="kasirTxCount">0</div>
            <div class="text-xs font-bold text-gray-400 mt-1">Transaksi</div>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div class="text-lg font-black text-gacoan-red" id="kasirTxTotal">Rp0</div>
            <div class="text-xs font-bold text-gray-400 mt-1">Total</div>
          </div>
        </div>

        <div id="kasirTransactionList" class="space-y-3 mb-6"></div>

        <button type="button" onclick="navigateTo('pos')" class="mt-4 text-sm font-bold text-gray-500 hover:text-brand-navy transition-colors block text-center mx-auto">
          <i class="fas fa-arrow-left mr-1"></i> Kembali ke Kasir
        </button>
      </div>
    </div>
  `
  updateKasirFilterButtons()
  await loadKasirTransactions()
}

function updateKasirFilterButtons() {
  const method = window._kasirFilter || 'all'
  document.querySelectorAll('#kasirFilterBar .kasir-filter-btn').forEach(btn => {
    const active = btn.dataset.filter === method
    btn.className = active
      ? 'kasir-filter-btn px-4 py-2 rounded-full text-xs font-bold border-2 border-brand-blue bg-brand-blue text-white'
      : 'kasir-filter-btn px-4 py-2 rounded-full text-xs font-bold border-2 border-gray-200 bg-white text-gray-500 hover:border-brand-blue'
  })
}

async function setKasirFilter(method) {
  window._kasirFilter = method
  updateKasirFilterButtons()
  await loadKasirTransactions()
}

async function loadKasirTransactions() {
  const dateInput = document.getElementById('kasirTxDate')
  const list = document.getElementById('kasirTransactionList')
  if (!dateInput || !list) return

  const date = dateInput.value || todayStr()
  kasirHistoryDate = date
  const method = window._kasirFilter || 'all'
  const isSelf = typeof Auth.isSelfOrder === 'function' && Auth.isSelfOrder()
  const buyerRef = typeof Auth.getBuyerRef === 'function' ? Auth.getBuyerRef() : null
  const cashierId = Auth.getUserId()

  try {
    let filtered
    if (isSelf && buyerRef && typeof api.getTransactionsByBuyerRef === 'function') {
      const { data, error } = await api.getTransactionsByBuyerRef(buyerRef, date, date)
      if (error) throw error
      filtered = data || []
    } else {
      const { data: allTx, error } = await api.getTransactionsByDateRange(date, date)
      if (error) throw error
      filtered = (allTx || []).filter(tx => Number(tx.cashier_id) === Number(cashierId))
    }
    if (method !== 'all') filtered = filtered.filter(tx => tx.payment_method === method)

    const totalRev = filtered.reduce((s, t) => s + Number(t.total_amount), 0)
    document.getElementById('kasirTxCount').textContent = filtered.length
    document.getElementById('kasirTxTotal').textContent = formatRupiah(totalRev)

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <i class="fas fa-inbox text-4xl text-gray-300 mb-3"></i>
          <p class="font-bold text-gray-500">Tidak ada transaksi</p>
          <p class="text-sm text-gray-400 mt-1">Pada tanggal ini</p>
        </div>
      `
      return
    }

    list.innerHTML = filtered.map(tx => `
      <div class="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm cursor-pointer hover:border-brand-blue transition-all active:scale-[0.99]" onclick="viewKasirTransaction(${tx.id})">
        <div class="flex justify-between items-center">
          <div>
            <div class="font-black text-gacoan-red">${formatRupiah(tx.total_amount)}</div>
            <div class="text-xs text-gray-400 font-semibold mt-1">${formatDate(tx.created_at, true)}</div>
          </div>
          <div class="text-right">
            <span class="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-brand-navy">${escapeHtml(tx.payment_method || 'Tunai')}</span>
            <div class="text-xs text-gray-400 font-semibold mt-1">#${tx.id}</div>
          </div>
        </div>
      </div>
    `).join('')
  } catch (err) {
    list.innerHTML = `
      <div class="bg-white rounded-2xl p-8 text-center border border-gray-100 text-red-500">
        <i class="fas fa-exclamation-circle text-3xl mb-2"></i>
        <p class="font-bold">${escapeHtml(err.message || String(err))}</p>
      </div>
    `
  }
}

async function viewKasirTransaction(id) {
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
      ${modalHeader('🧾', `Transaksi #${tx.id}`, 'Rincian pembelian pelanggan', 'info')}
      <div class="modal-body">
      <div class="modal-meta" style="margin-bottom:12px">
        <span>📅 ${formatDate(tx.created_at, true)}</span>
        <span>💳 ${escapeHtml(tx.payment_method || 'Tunai')} • 👤 ${escapeHtml(tx.cashier_name || '-')}</span>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-bottom:12px">
        ${items.map(item => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
            <span>🍱 ${escapeHtml(item.product_name)} x${item.quantity}</span>
            <span><strong>${formatRupiah(item.subtotal)}</strong></span>
          </div>
        `).join('')}
      </div>
      <div class="modal-total-bar">
        <strong>💰 TOTAL</strong>
        <strong>${formatRupiah(tx.total_amount)}</strong>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">✖️ Tutup</button>
        <button class="btn btn-primary" onclick="printKasirTransaction(${tx.id})"><i class="fas fa-print"></i> Cetak</button>
      </div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function printKasirTransaction(id) {
  const { data: tx, error } = await api.getTransactionById(id)
  if (error || !tx) {
    showToast('Transaksi tidak ditemukan', 'error')
    return
  }
  printReceipt(tx, tx.transaction_items || [])
}

window.setKasirFilter = setKasirFilter
window.loadKasirTransactions = loadKasirTransactions
window.viewKasirTransaction = viewKasirTransaction
window.printKasirTransaction = printKasirTransaction
