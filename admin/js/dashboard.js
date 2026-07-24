let dashboardRenderToken = 0

function cancelDashboardRender() {
  dashboardRenderToken++
}

function drawDashboardUI(container, todayRevenue, todayCount, todayItems, bestProduct, recentTx) {
  const adminName = (typeof Auth !== 'undefined' && Auth.getFullName())
    ? Auth.getFullName()
    : ((typeof Auth !== 'undefined' && Auth.getUsername()) ? Auth.getUsername() : 'Admin')

  container.innerHTML = `
    <div class="dashboard-welcome">
      <div class="dashboard-welcome-icon">
        <i class="fas fa-store"></i>
      </div>
      <div class="dashboard-welcome-text">
        <h2>Selamat Datang, ${escapeHtml(adminName)}</h2>
        <p>Pantau penjualan Koperasi secara real-time, kelola produk, dan lihat laporan dengan mudah.</p>
      </div>
    </div>

    <div class="dashboard-section-header">
      <i class="fas fa-chart-pie"></i>
      <span>Ringkasan Hari Ini</span>
    </div>

    <div class="dashboard-grid">
      <div class="stat-card stat-colored stat-money">
        <div class="icon">💰</div>
        <div class="info">
          <h3>${formatRupiah(todayRevenue)}</h3>
          <p>Pendapatan Hari Ini</p>
        </div>
      </div>
      <div class="stat-card stat-colored stat-transactions">
        <div class="icon">📋</div>
        <div class="info">
          <h3>${todayCount}</h3>
          <p>Transaksi Hari Ini</p>
        </div>
      </div>
      <div class="stat-card stat-colored stat-items">
        <div class="icon">📦</div>
        <div class="info">
          <h3>${todayItems}</h3>
          <p>Item Terjual</p>
        </div>
      </div>
      <div class="stat-card stat-colored stat-best">
        <div class="icon">🏆</div>
        <div class="info">
          <h3>${escapeHtml(bestProduct)}</h3>
          <p>Produk Terlaris (7 hari)</p>
        </div>
      </div>
    </div>

    <div class="chart-container">
      <h3>📊 10 Transaksi Terbaru</h3>
      <div id="recentTransactions"></div>
    </div>
  `

  const recentContainer = container.querySelector('#recentTransactions')
  if (!recentContainer) return

  if (!recentTx || recentTx.length === 0) {
    recentContainer.innerHTML = '<div class="empty-state"><div class="icon">📭</div><h3>Belum ada transaksi</h3></div>'
  } else {
    recentContainer.innerHTML = `
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
            <tbody>
              ${recentTx.map(tx => {
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
                      <button class="btn btn-outline" onclick="viewTransaction(${tx.id})"><i class="fas fa-eye"></i></button>
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `
  }
}

async function renderDashboard(container) {
  const token = ++dashboardRenderToken
  const today = todayStr()

  // Instant Cache Render
  const cachedSales = api.getCachedData(`daily_sales_${today}_${today}`)
  const cachedBest = api.getCachedData('best_selling')
  const cachedItems = api.getCachedData('items_sold_today')
  const cachedTx = api.getCachedData('transactions')

  if (cachedSales && cachedBest && cachedItems && cachedTx) {
    const todaySales = cachedSales[0] || { total_sales: 0, tx_count: 0 }
    const todayCount = Number(todaySales.tx_count)
    const todayRevenue = Number(todaySales.total_sales)
    const todayItems = Number(cachedItems.total_qty || 0)
    const bestProduct = cachedBest.product_name || '-'
    drawDashboardUI(container, todayRevenue, todayCount, todayItems, bestProduct, cachedTx.slice(0, 10))
  } else {
    container.innerHTML = '<div class="empty-state" style="padding: 40px;"><div class="icon"><i class="fas fa-spinner fa-spin text-primary"></i></div><h3>Memuat data...</h3></div>'
  }

  try {
    const [{ data: salesSum, error: salesErr }, { data: bestProductData, error: bestErr }, { data: itemsSoldData, error: itemsErr }, { data: recentTx, error: recentErr }] = await Promise.all([
      api.getDailySalesSummary(today, today),
      api.getBestSellingProduct7Days(),
      api.getItemsSoldToday(),
      api.getTransactions(10)
    ])
    if (salesErr) throw salesErr
    if (bestErr) throw bestErr
    if (itemsErr) throw itemsErr
    if (recentErr) throw recentErr

    if (token !== dashboardRenderToken) return

    const todaySales = salesSum?.[0] || { total_sales: 0, tx_count: 0 }
    const todayCount = Number(todaySales.tx_count)
    const todayRevenue = Number(todaySales.total_sales)
    const todayItems = Number(itemsSoldData?.total_qty || 0)
    const bestProduct = bestProductData?.product_name || '-'

    drawDashboardUI(container, todayRevenue, todayCount, todayItems, bestProduct, recentTx)
  } catch (err) {
    if (token !== dashboardRenderToken) return
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Gagal memuat data</h3><p>${escapeHtml(err.message)}</p></div>`
  }
}
