let productsRenderToken = 0
let categoriesRenderToken = 0

function drawProductsUI(container, products, categories) {
  container.innerHTML = `
    ${buildLowStockBanner(products)}
    ${adminPageNote('fas fa-box', 'Data Produk', 'Kelola daftar produk, harga, stok, dan barcode barang Koperasi.')}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;flex:1;flex-wrap:wrap;gap:8px;align-items:center;min-width:0">
        <div class="search-input" style="flex:1;min-width:180px;max-width:280px">
          <i class="fas fa-search search-icon"></i>
          <input type="text" id="productSearch" placeholder="Cari produk..." oninput="filterProductTable()">
        </div>
        <select id="productCategoryFilter" class="products-filter-select" onchange="filterProductTable()" aria-label="Filter kategori">
          <option value="all">Semua Kategori</option>
          ${(categories || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <select id="productStatusFilter" class="products-filter-select" onchange="filterProductTable()" aria-label="Filter status">
          <option value="all">Semua Status</option>
          <option value="available">Tersedia</option>
          <option value="unavailable">Nonaktif</option>
          <option value="low">Stok Sedikit</option>
          <option value="out">Habis</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="exportProductsPDF()"><i class="fas fa-file-pdf text-danger"></i> PDF</button>
        <button class="btn btn-outline" onclick="navigateTo('categories')"><i class="fas fa-tags"></i> Kategori</button>
        <button class="btn btn-primary" onclick="showProductModal()"><i class="fas fa-plus"></i> Tambah Produk</button>
      </div>
    </div>
    <div class="products-table-card">
      <div class="products-table-scroll">
        <table class="products-data-table">
          <thead>
            <tr>
              <th>No</th>
              <th class="col-head-product">Produk</th>
              <th>Barcode</th>
              <th class="col-head-category">Kategori</th>
              <th class="col-nominal">Harga Beli</th>
              <th class="col-nominal">Harga Jual</th>
              <th class="col-nominal">Keuntungan</th>
              <th>Stok</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="productTableBody">
          </tbody>
        </table>
      </div>
      <div class="products-table-footer" id="productTableFooter"></div>
    </div>
  `
  window._products = products || []
  window._categories = categories || []
  if (!window._productPage) window._productPage = 1
  if (!window._productPageSize) window._productPageSize = 10
  renderProductTable()
}

async function renderProducts(container) {
  const token = ++productsRenderToken
  
  // Instant Cache Render
  const cachedProducts = api.getCachedData('products')
  const cachedCategories = api.getCachedData('categories')
  if (cachedProducts && cachedCategories) {
    drawProductsUI(container, cachedProducts, cachedCategories)
  } else {
    container.innerHTML = '<div class="empty-state" style="padding: 40px;"><div class="icon"><i class="fas fa-spinner fa-spin text-primary"></i></div><h3>Memuat data...</h3></div>'
  }

  try {
    const [{ data: products, error: prodErr }, { data: categories, error: catErr }] = await Promise.all([
      api.getProducts(),
      api.getCategories()
    ])
    if (prodErr) throw prodErr
    if (catErr) throw catErr
    if (token !== productsRenderToken) return

    drawProductsUI(container, products, categories)
  } catch (err) {
    if (token !== productsRenderToken) return
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Gagal memuat</h3><p>${escapeHtml(err.message || String(err))}</p></div>`
  }
}

function getStockLevel(stock, minStock) {
  const qty = Number(stock) || 0
  const min = Number(minStock) || 0
  if (qty <= 0) return 'low'
  if (min > 0 && qty <= min) return 'mid'
  return 'ok'
}

function getLowStockProducts(products) {
  return (products || []).filter(p => {
    const min = Number(p.min_stock) || 0
    return min > 0 && Number(p.stock) <= min
  })
}

function buildLowStockBanner(products) {
  const low = getLowStockProducts(products)
  if (!low.length) return ''
  const items = low.map(p => `<strong>${escapeHtml(p.name)}</strong> (${p.stock}/${p.min_stock})`).join(', ')
  return `<div class="low-stock-banner"><i class="fas fa-exclamation-triangle"></i><span>Stok Sedikit : ${items}</span></div>`
}

function getFilteredProducts() {
  const q = document.getElementById('productSearch')?.value.toLowerCase() || ''
  const categoryFilter = document.getElementById('productCategoryFilter')?.value || 'all'
  const statusFilter = document.getElementById('productStatusFilter')?.value || 'all'

  return (window._products || []).filter(p => {
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.categories?.name || '').toLowerCase().includes(q)

    const matchCategory = categoryFilter === 'all' ||
      String(p.category_id) === String(categoryFilter)

    let matchStatus = true
    if (statusFilter === 'available') matchStatus = p.is_available !== false
    else if (statusFilter === 'unavailable') matchStatus = p.is_available === false
    else if (statusFilter === 'low') {
      const min = Number(p.min_stock) || 0
      matchStatus = min > 0 && Number(p.stock) > 0 && Number(p.stock) <= min
    } else if (statusFilter === 'out') matchStatus = Number(p.stock) <= 0

    return matchSearch && matchCategory && matchStatus
  })
}

function getEffectiveProductPageSize(total) {
  const size = window._productPageSize
  if (!size || size <= 0) return Math.max(total, 1)
  return size
}

function isAllProductPages() {
  return !window._productPageSize || window._productPageSize <= 0
}

function buildProductPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = [1]
  if (current > 3) pages.push('...')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    if (!pages.includes(p)) pages.push(p)
  }
  if (current < total - 2) pages.push('...')
  if (total > 1 && !pages.includes(total)) pages.push(total)
  return pages
}

function renderProductPagination(total, start, shown, totalPages) {
  const footer = document.getElementById('productTableFooter')
  if (!footer) return

  if (total === 0) {
    footer.innerHTML = '<span class="products-table-info">Menampilkan 0 data</span>'
    return
  }

  const end = start + shown
  const page = window._productPage || 1
  const pageSize = window._productPageSize ?? 10
  const pages = buildProductPageNumbers(page, totalPages)
  const paginationHtml = (isAllProductPages() || totalPages <= 1) ? '' : `
    <div class="products-pagination">
      <button type="button" onclick="setProductPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>« Prev</button>
      ${pages.map(p => {
        if (p === '...') return '<span class="products-page-ellipsis">...</span>'
        return `<button type="button" class="${p === page ? 'active' : ''}" onclick="setProductPage(${p})">${p}</button>`
      }).join('')}
      <button type="button" onclick="setProductPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next »</button>
    </div>
  `

  footer.innerHTML = `
    <span class="products-table-info">Menampilkan ${start + 1}-${end} dari ${total} data</span>
    <div class="products-table-controls">
      <select class="products-page-size" onchange="setProductPageSize(Number(this.value))" aria-label="Jumlah baris per halaman">
        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / Hal</option>
        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / Hal</option>
        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / Hal</option>
      </select>
      ${paginationHtml}
    </div>
  `
}

function renderProductTable() {
  const filtered = getFilteredProducts()
  const total = filtered.length
  const pageSize = getEffectiveProductPageSize(total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!window._productPage || window._productPage < 1) window._productPage = 1
  if (window._productPage > totalPages) window._productPage = totalPages

  const start = total === 0 ? 0 : (window._productPage - 1) * pageSize
  const pageItems = filtered.slice(start, start + pageSize)

  renderProductRows(pageItems, start)
  renderProductPagination(total, start, pageItems.length, totalPages)
}

function setProductPage(page) {
  const total = getFilteredProducts().length
  const totalPages = Math.max(1, Math.ceil(total / getEffectiveProductPageSize(total)))
  window._productPage = Math.min(Math.max(1, page), totalPages)
  renderProductTable()
}

function setProductPageSize(size) {
  window._productPageSize = size
  window._productPage = 1
  renderProductTable()
}

function renderProductRows(products, startIndex = 0) {
  const tbody = document.getElementById('productTableBody')
  if (!tbody) return
  if (!products || products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">📦</div><h3>Belum ada produk</h3><p>Klik "Tambah Produk" untuk memulai</p></div></td></tr>`
    return
  }
  tbody.innerHTML = products.map((p, i) => {
    const photoUrl = p.photo_id ? api.getProductPhotoUrl(p.photo_id, { bust: p.photo_id }) : null
    const stockLevel = getStockLevel(p.stock, p.min_stock)
    const stockClass = stockLevel === 'ok' ? 'col-stock-ok' : stockLevel === 'mid' ? 'col-stock-mid' : 'col-stock-low'
    const stockLabel = p.stock > 0 ? p.stock : 'habis'
    const profit = Number(p.price || 0) - Number(p.buy_price || 0)
    const profitClass = profit > 0 ? 'col-profit-pos' : profit < 0 ? 'col-profit-neg' : 'col-profit-zero'
    const thumb = photoUrl
      ? `<img class="product-thumb" src="${photoUrl}" alt="${escapeHtml(p.name)}">`
      : `<span class="product-thumb">${suggestCategoryIcon(p.categories?.name)}</span>`
    return `
    <tr>
      <td class="col-no">${startIndex + i + 1}</td>
      <td class="col-product">
        <div class="product-cell">
          ${thumb}
          <span>${escapeHtml(p.name)}${p.is_available === false ? ' <span class="badge badge-danger">Nonaktif</span>' : ''}</span>
        </div>
      </td>
      <td class="col-barcode">${escapeHtml(p.barcode || '-')}</td>
      <td class="col-category">${escapeHtml(p.categories?.name || '-')}</td>
      <td class="col-buy">${formatRupiah(p.buy_price || 0)}</td>
      <td class="col-sell">${formatRupiah(p.price)}</td>
      <td class="col-profit ${profitClass}">${formatRupiah(profit)}</td>
      <td class="${stockClass}">${stockLabel}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-outline" onclick="showProductModal(${p.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `}).join('')
}

function filterProductTable() {
  window._productPage = 1
  renderProductTable()
}

function buildCategorySelectOptions(categories, selectedId, isEdit) {
  if (!categories.length) {
    return '<option value="" disabled selected>Tidak ada kategori</option>'
  }
  const valid = selectedId && categories.some(c => c.id === selectedId)
  let html = ''
  if (!valid) {
    html += '<option value="" disabled selected>— Pilih kategori —</option>'
  }
  html += categories.map((c) => {
    const selected = valid && selectedId === c.id
    return `<option value="${c.id}" ${selected ? 'selected' : ''}>${suggestCategoryIcon(c.name)} ${escapeHtml(c.name)}</option>`
  }).join('')
  return html
}

async function showProductModal(id = null) {
  const isEdit = id !== null
  let product = null
  if (isEdit) {
    const { data } = await supabaseClient.from('products').select('*, categories(*)').eq('id', id).single()
    product = data
    if (!product) {
      showToast('Produk tidak ditemukan', 'error')
      return
    }
  }
  const categories = window._categories || []
  const existingPhotoUrl = isEdit && product?.photo_id
    ? api.getProductPhotoUrl(product.photo_id, { bust: product.photo_id })
    : ''

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.display = 'flex'
  overlay.innerHTML = `
    <div class="modal modal-lg">
      ${modalHeader(isEdit ? '✏️' : '📦', isEdit ? 'Edit Produk' : 'Tambah Produk', isEdit ? 'Perbarui data produk Koperasi' : 'Lengkapi informasi produk baru', isEdit ? 'info' : 'success')}
      <div class="modal-body">
      <form id="productForm">
        <div class="modal-form-grid">
          <div class="modal-form-photo">
            <label>Foto Produk</label>
            <img id="pPhotoPreview" class="photo-preview" src="${existingPhotoUrl}" alt="Preview" style="${existingPhotoUrl ? '' : 'display:none;'}"/>
            <div class="photo-input-actions">
              <button type="button" class="btn btn-sm btn-outline" id="pPhotoCamera">📷 Ambil Foto</button>
              <button type="button" class="btn btn-sm btn-outline" id="pPhotoGallery">🖼️ Galeri</button>
            </div>
            <input type="file" id="pPhotoCameraInput" accept="image/*" capture="environment" hidden>
            <input type="file" id="pPhotoGalleryInput" accept="image/*" hidden>
            <span class="form-hint photo-input-hint">Gunakan kamera perangkat atau pilih dari galeri</span>
          </div>
          <div class="modal-form-fields">
            <div class="form-group">
              <label>Nama Produk</label>
              <input type="text" id="pName" value="${isEdit ? escapeHtml(product.name) : ''}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Kode Barcode</label>
                <div style="display: flex; gap: 8px;">
                  <input type="text" id="pBarcode" value="${isEdit ? escapeHtml(product.barcode || '') : ''}" placeholder="Contoh: 8991234567890" maxlength="50" autocomplete="off" style="flex: 1;">
                  <button type="button" class="btn btn-outline" id="pBarcodeScan" style="padding: 0 12px; height: 38px; display: flex; align-items: center; justify-content: center;" title="Scan Barcode"><i class="fas fa-barcode"></i></button>
                </div>
              </div>
              <div class="form-group">
                <label>Kategori</label>
                <select id="pCategory" required>
                  ${buildCategorySelectOptions(categories, isEdit ? product.category_id : null, isEdit)}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Harga Beli (Rp)</label>
                <input type="text" class="input-rupiah" id="pBuyPrice" value="${isEdit ? formatRupiahInput(product.buy_price ?? '') : ''}" placeholder="0" required>
              </div>
              <div class="form-group">
                <label>Harga Jual (Rp)</label>
                <input type="text" class="input-rupiah" id="pPrice" value="${isEdit ? formatRupiahInput(product.price) : ''}" placeholder="0" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Stok</label>
                <input type="number" id="pStock" value="${isEdit ? product.stock : '0'}" min="0">
              </div>
              <div class="form-group">
                <label>Stok Minimal</label>
                <input type="number" id="pMinStock" value="${isEdit ? (product.min_stock ?? 10) : '10'}" min="0">
                <span class="form-hint">Notifikasi muncul jika stok ≤ nilai ini</span>
              </div>
            </div>
            <div class="form-group">
              <label class="checkbox-label" for="pAvailable">
                <input type="checkbox" id="pAvailable" ${isEdit ? (product.is_available !== false ? 'checked' : '') : 'checked'}>
                <span>Tersedia di kasir</span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="pCancelBtn">✖️ Batal</button>
          <button type="submit" class="btn btn-primary">${isEdit ? '💾 Simpan' : '✅ Tambah'}</button>
        </div>
      </form>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  attachRupiahInputs(overlay)

  const photoPreview = document.getElementById('pPhotoPreview')
  const photoCameraBtn = document.getElementById('pPhotoCamera')
  const photoGalleryBtn = document.getElementById('pPhotoGallery')
  const photoCameraInput = document.getElementById('pPhotoCameraInput')
  const photoGalleryInput = document.getElementById('pPhotoGalleryInput')
  const cancelBtn = document.getElementById('pCancelBtn')
  const existingPhotoId = isEdit ? (product.photo_id || null) : null
  let photoId = existingPhotoId
  let photoBlob = null

  let previewObjectUrl = null

  function revokePreviewUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
      previewObjectUrl = null
    }
  }

  async function handlePhotoSelected(file) {
    if (!file) return
    photoBlob = await compressImageToBlob(file, { maxBytes: 50 * 1024, maxDimension: 960 })
    revokePreviewUrl()
    previewObjectUrl = URL.createObjectURL(photoBlob)
    photoPreview.src = previewObjectUrl
    photoPreview.style.display = 'block'
  }

  photoCameraBtn.addEventListener('click', () => photoCameraInput.click())
  photoGalleryBtn.addEventListener('click', () => photoGalleryInput.click())
  photoCameraInput.addEventListener('change', async () => {
    await handlePhotoSelected(photoCameraInput.files?.[0])
    photoCameraInput.value = ''
  })
  photoGalleryInput.addEventListener('change', async () => {
    await handlePhotoSelected(photoGalleryInput.files?.[0])
    photoGalleryInput.value = ''
  })

  const scanBarcodeBtn = document.getElementById('pBarcodeScan')
  scanBarcodeBtn?.addEventListener('click', () => {
    // Sembunyikan modal tambah/edit produk
    overlay.style.display = 'none'

    const adminScannerOverlay = document.createElement('div')
    adminScannerOverlay.id = 'adminBarcodeScannerModal'
    adminScannerOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 1001;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      padding: 16px;
      animation: fadeIn 0.22s ease;
    `
    adminScannerOverlay.innerHTML = `
      <style>
        .admin-scanner-modal {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          width: 100%;
          max-width: 448px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: slideUp 0.32s cubic-bezier(0.34, 1.2, 0.64, 1);
          border: 1px solid #e5e7eb;
        }
        .admin-scanner-header {
          padding: 16px;
          background-color: #1E3A8A;
          color: #ffffff;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .admin-scanner-title {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #ffffff;
          font-family: 'Quicksand', 'Inter', sans-serif;
        }
        .admin-scanner-close {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background-color: #1f2937;
          color: #d1d5db;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s, background-color 0.2s;
        }
        .admin-scanner-close:hover {
          color: #ffffff;
          background-color: #374151;
        }
        .admin-scanner-body {
          padding: 16px;
          background-color: #f9fafb;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .admin-scanner-reader {
          width: 100%;
          overflow: hidden;
          border-radius: 12px;
          border: 2px solid #e5e7eb;
          background-color: #000000;
          aspect-ratio: 1 / 1;
        }
        .admin-scanner-select-group {
          width: 100%;
          margin-top: 16px;
        }
        .admin-scanner-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 700;
          color: #6b7280;
          margin-bottom: 6px;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .admin-scanner-select {
          width: 100%;
          padding: 10px;
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          font-size: 0.875rem;
          font-weight: 600;
          color: #1E3A8A;
          outline: none;
          box-sizing: border-box;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .admin-scanner-select:focus {
          border-color: #2563EB;
        }
        .admin-scanner-info {
          font-size: 0.75rem;
          color: #9ca3af;
          font-weight: 600;
          margin-top: 12px;
          text-align: center;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      </style>
      <div class="admin-scanner-modal">
        <div class="admin-scanner-header">
          <h3 class="admin-scanner-title">
            <i class="fas fa-barcode"></i> Scan Barcode Kemasan
          </h3>
          <button type="button" id="closeAdminScanner" class="admin-scanner-close" title="Tutup">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="admin-scanner-body">
          <div id="adminBarcodeReader" class="admin-scanner-reader"></div>
          <div class="admin-scanner-select-group">
            <label for="adminBarcodeCameraSelect" class="admin-scanner-label">Pilih Kamera:</label>
            <select id="adminBarcodeCameraSelect" class="admin-scanner-select">
              <option value="">Memuat kamera...</option>
            </select>
          </div>
          <p class="admin-scanner-info">
            Arahkan barcode pada kemasan produk ke dalam area kamera.
          </p>
        </div>
      </div>
    `
    document.body.appendChild(adminScannerOverlay)

    let adminHtml5Qrcode = null

    const closeAdminScanner = () => {
      if (adminHtml5Qrcode) {
        adminHtml5Qrcode.stop().catch(() => {}).then(() => {
          adminScannerOverlay.remove()
          // Munculkan kembali modal tambah/edit produk
          overlay.style.display = 'flex'
        })
      } else {
        adminScannerOverlay.remove()
        // Munculkan kembali modal tambah/edit produk
        overlay.style.display = 'flex'
      }
    }

    document.getElementById('closeAdminScanner')?.addEventListener('click', closeAdminScanner)
    adminScannerOverlay.addEventListener('click', (e) => {
      if (e.target === adminScannerOverlay) closeAdminScanner()
    })

    const startAdminScanning = (cameraId) => {
      if (adminHtml5Qrcode) {
        adminHtml5Qrcode.stop().then(() => {
          initializeAdminHtml5Qrcode(cameraId)
        }).catch(() => {
          initializeAdminHtml5Qrcode(cameraId)
        })
      } else {
        initializeAdminHtml5Qrcode(cameraId)
      }
    }

    const initializeAdminHtml5Qrcode = (cameraId) => {
      if (!cameraId) return
      adminHtml5Qrcode = new Html5Qrcode("adminBarcodeReader")
      adminHtml5Qrcode.start(
        cameraId,
        {
          fps: 30, // FPS lebih tinggi untuk pemindaian yang lebih cepat/responsif
          qrbox: (w, h) => {
            const size = Math.min(w, h);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true // Detektor bawaan browser untuk performa lebih sensitif
          }
        },
        (decodedText) => {
          // Play beep
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
            const oscillator = audioCtx.createOscillator()
            const gainNode = audioCtx.createGain()
            oscillator.connect(gainNode)
            gainNode.connect(audioCtx.destination)
            oscillator.type = 'sine'
            oscillator.frequency.value = 1000
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
            gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05)
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15)
            oscillator.start(audioCtx.currentTime)
            oscillator.stop(audioCtx.currentTime + 0.15)
          } catch (_) {}

          const barcodeInput = document.getElementById('pBarcode')
          if (barcodeInput) barcodeInput.value = decodedText

          showToast(`Barcode terdeteksi: ${decodedText}`, 'success')
          closeAdminScanner()
        },
        () => {}
      ).then(() => {
        // Terapkan autofocus continuous setelah kamera berhasil menyala
        setTimeout(() => {
          if (adminHtml5Qrcode) {
            adminHtml5Qrcode.applyVideoConstraints({
              focusMode: "continuous",
              advanced: [{ focusMode: "continuous" }]
            }).catch(err => {
              console.warn("Autofocus tidak didukung pada perangkat ini:", err)
            })
          }
        }, 1000)
      }).catch(err => {
        showToast("Gagal memulai kamera: " + err, "error")
      })
    }

    const cameraSelect = document.getElementById('adminBarcodeCameraSelect')
    cameraSelect.addEventListener('change', (e) => startAdminScanning(e.target.value))

    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        cameraSelect.innerHTML = ''
        devices.forEach((device, index) => {
          const option = document.createElement('option')
          option.value = device.id
          if (device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('rear')) {
            option.selected = true
          }
          option.text = device.label || `Kamera ${index + 1}`
          cameraSelect.appendChild(option)
        })
        startAdminScanning(cameraSelect.value)
      } else {
        cameraSelect.innerHTML = '<option value="">Kamera tidak ditemukan</option>'
      }
    }).catch(err => {
      cameraSelect.innerHTML = '<option value="">Gagal mengakses kamera</option>'
    })
  })

  cancelBtn?.addEventListener('click', () => {
    revokePreviewUrl()
    overlay.remove()
  })
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      revokePreviewUrl()
      overlay.remove()
    }
  })

  document.getElementById('productForm').onsubmit = async (e) => {
    e.preventDefault()
    const btn = overlay.querySelector('button[type="submit"]')
    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'

    // Upload foto ke Supabase Storage — selalu pakai photo_id baru agar URL
    // publik berubah (browser/CDN tidak menampilkan foto lama).
    const previousPhotoId = existingPhotoId
    if (photoBlob) {
      photoId = generateShortAlnumId(10)
      const { error: imgErr } = await api.uploadProductPhoto(photoId, photoBlob)
      if (imgErr) {
        showToast('Gagal upload foto: ' + imgErr.message, 'error')
        btn.disabled = false
        btn.innerHTML = isEdit ? 'Simpan' : 'Tambah'
        return
      }
    }

    const barcodeValue = document.getElementById('pBarcode').value.trim()
    const categoryVal = document.getElementById('pCategory').value
    if (!categoryVal) {
      showToast('Pilih kategori produk', 'error')
      btn.disabled = false
      btn.innerHTML = isEdit ? 'Simpan' : 'Tambah'
      return
    }

    const data = {
      name: document.getElementById('pName').value,
      barcode: barcodeValue || null,
      category_id: parseInt(categoryVal, 10),
      buy_price: parseRupiahInput(document.getElementById('pBuyPrice').value),
      price: parseRupiahInput(document.getElementById('pPrice').value),
      stock: parseInt(document.getElementById('pStock').value) || 0,
      min_stock: parseInt(document.getElementById('pMinStock').value) || 0,
      photo_id: photoId,
      is_available: document.getElementById('pAvailable').checked
    }

    const { error } = isEdit
      ? await api.updateProduct(id, data)
      : await api.addProduct(data)

    if (error) {
      showToast('Gagal menyimpan: ' + error.message, 'error')
      btn.disabled = false
      btn.innerHTML = isEdit ? 'Simpan' : 'Tambah'
    } else {
      if (photoBlob && previousPhotoId && previousPhotoId !== photoId) {
        await api.deleteProductPhoto(previousPhotoId)
      }
      revokePreviewUrl()
      overlay.remove()
      showToast(isEdit ? 'Produk berhasil diperbarui' : 'Produk berhasil ditambahkan', 'success')
      renderProducts(document.getElementById('pageContent'))
    }
  }
}

function generateShortAlnumId(maxLen = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const len = Math.max(1, Math.min(10, maxLen))
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return out
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

async function compressImageToBlob(file, { maxBytes, maxDimension }) {
  const dataUrl = await compressImageToDataUrl(file, { maxBytes, maxDimension })
  const res = await fetch(dataUrl)
  return await res.blob()
}

async function compressImageToDataUrl(file, { maxBytes, maxDimension }) {
  // Decode
  const srcUrl = await readFileAsDataUrl(file)
  const img = await loadImage(srcUrl)

  // Determine target size
  let { width, height } = img
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  width = Math.max(1, Math.round(width * scale))
  height = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return srcUrl

  // Progressive compression: reduce quality then dimension if needed
  let quality = 0.85
  let attempt = 0
  let out = ''

  while (attempt < 20) {
    canvas.width = width
    canvas.height = height
    
    // Enable high-quality image smoothing for clarity
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    out = canvas.toDataURL('image/jpeg', quality)
    const bytes = estimateDataUrlBytes(out)
    if (bytes <= maxBytes) return out

    // Step down quality first, then scale down dimension if quality is already low
    if (quality > 0.5) {
      quality -= 0.08
    } else if (quality > 0.3) {
      quality -= 0.05
    } else {
      width = Math.max(200, Math.round(width * 0.8))
      height = Math.max(200, Math.round(height * 0.8))
    }
    attempt++
  }

  return out || srcUrl
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal memuat gambar'))
    img.src = src
  })
}

async function deleteProduct(id) {
  const confirm = await confirmDialog('Yakin ingin menghapus produk ini?')
  if (!confirm) return
  const product = (window._products || []).find(p => p.id === id)
  const { error } = await api.deleteProduct(id)
  if (error) {
    showToast('Gagal menghapus: ' + error.message, 'error')
  } else {
    if (product?.photo_id) await api.deleteProductPhoto(product.photo_id)
    showToast('Produk berhasil dihapus', 'success')
    renderProducts(document.getElementById('pageContent'))
  }
}

// ========== CATEGORIES ==========
function getFilteredCategories() {
  const q = document.getElementById('categorySearch')?.value.toLowerCase() || ''
  return (window._categoryList || []).filter(c =>
    c.name.toLowerCase().includes(q)
  )
}

function getEffectiveCategoryPageSize(total) {
  const size = window._categoryPageSize
  if (!size || size <= 0) return Math.max(total, 1)
  return size
}

function isAllCategoryPages() {
  return !window._categoryPageSize || window._categoryPageSize <= 0
}

function buildCategoryPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = [1]
  if (current > 3) pages.push('...')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    if (!pages.includes(p)) pages.push(p)
  }
  if (current < total - 2) pages.push('...')
  if (total > 1 && !pages.includes(total)) pages.push(total)
  return pages
}

function renderCategoryPagination(total, start, shown, totalPages) {
  const footer = document.getElementById('categoryTableFooter')
  if (!footer) return

  if (total === 0) {
    footer.innerHTML = '<span class="products-table-info">Menampilkan 0 data</span>'
    return
  }

  const end = start + shown
  const page = window._categoryPage || 1
  const pageSize = window._categoryPageSize ?? 10
  const pages = buildCategoryPageNumbers(page, totalPages)
  const paginationHtml = (isAllCategoryPages() || totalPages <= 1) ? '' : `
    <div class="products-pagination">
      <button type="button" onclick="setCategoryPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>« Prev</button>
      ${pages.map(p => {
        if (p === '...') return '<span class="products-page-ellipsis">...</span>'
        return `<button type="button" class="${p === page ? 'active' : ''}" onclick="setCategoryPage(${p})">${p}</button>`
      }).join('')}
      <button type="button" onclick="setCategoryPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next »</button>
    </div>
  `

  footer.innerHTML = `
    <span class="products-table-info">Menampilkan ${start + 1}-${end} dari ${total} data</span>
    <div class="products-table-controls">
      <select class="products-page-size" onchange="setCategoryPageSize(Number(this.value))" aria-label="Jumlah baris per halaman">
        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / Hal</option>
        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / Hal</option>
        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / Hal</option>
      </select>
      ${paginationHtml}
    </div>
  `
}

function renderCategoryIconThumb(category) {
  return `<span class="product-thumb">${suggestCategoryIcon(category?.name)}</span>`
}

function renderCategoryRows(categories, startIndex = 0) {
  const tbody = document.getElementById('categoryTableBody')
  if (!tbody) return
  if (!categories || categories.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="icon">🏷️</div><h3>Belum ada kategori</h3><p>Klik "Tambah Kategori" untuk memulai</p></div></td></tr>`
    return
  }

  const productCount = window._categoryProductCount || {}
  tbody.innerHTML = categories.map((c, i) => `
    <tr>
      <td class="col-no">${startIndex + i + 1}</td>
      <td class="col-product">
        <div class="product-cell">
          ${renderCategoryIconThumb(c)}
          <span><strong>${escapeHtml(c.name)}</strong></span>
        </div>
      </td>
      <td class="col-qty"><span class="${(productCount[c.id] || 0) > 0 ? 'col-stock-ok' : 'col-stock-low'}">${productCount[c.id] || 0} produk</span></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-outline" onclick="showCategoryModal(${c.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteCategory(${c.id})"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('')
}

function renderCategoryTable() {
  const filtered = getFilteredCategories()
  const total = filtered.length
  const pageSize = getEffectiveCategoryPageSize(total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!window._categoryPage || window._categoryPage < 1) window._categoryPage = 1
  if (window._categoryPage > totalPages) window._categoryPage = totalPages

  const start = total === 0 ? 0 : (window._categoryPage - 1) * pageSize
  const pageItems = filtered.slice(start, start + pageSize)

  renderCategoryRows(pageItems, start)
  renderCategoryPagination(total, start, pageItems.length, totalPages)
}

function setCategoryPage(page) {
  const total = getFilteredCategories().length
  const totalPages = Math.max(1, Math.ceil(total / getEffectiveCategoryPageSize(total)))
  window._categoryPage = Math.min(Math.max(1, page), totalPages)
  renderCategoryTable()
}

function setCategoryPageSize(size) {
  window._categoryPageSize = size
  window._categoryPage = 1
  renderCategoryTable()
}

function filterCategoryTable() {
  window._categoryPage = 1
  renderCategoryTable()
}

async function renderCategories(container) {
  const token = ++categoriesRenderToken
  try {
    const [{ data: categories, error: catErr }, { data: products, error: prodErr }] = await Promise.all([
      api.getCategories(),
      api.getProducts()
    ])
    if (catErr) throw catErr
    if (prodErr) throw prodErr
    if (token !== categoriesRenderToken) return

    const productCount = {}
    if (products) {
      products.forEach(p => {
        if (p.category_id) productCount[p.category_id] = (productCount[p.category_id] || 0) + 1
      })
    }

    window._categoryList = categories || []
    window._categoryProductCount = productCount
    window._categoryPage = 1
    window._categoryPageSize = 10

    container.innerHTML = `
      ${adminPageNote('fas fa-tags', 'Data Kategori', 'Pengelolaan kategori produk untuk memudahkan pengelompokan barang Koperasi.')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div class="search-input" style="flex:1;max-width:300px">
          <i class="fas fa-search search-icon"></i>
          <input type="text" id="categorySearch" placeholder="Cari kategori..." oninput="filterCategoryTable()">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline" onclick="navigateTo('products')"><i class="fas fa-arrow-left"></i> Kembali ke Produk</button>
          <button class="btn btn-primary" onclick="showCategoryModal()"><i class="fas fa-plus"></i> Tambah Kategori</button>
        </div>
      </div>
      <div class="products-table-card">
        <div class="products-table-scroll">
          <table class="products-data-table">
            <thead>
              <tr>
                <th>No</th>
                <th class="col-head-product">Kategori</th>
                <th>Jumlah Produk</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="categoryTableBody"></tbody>
          </table>
        </div>
        <div class="products-table-footer" id="categoryTableFooter"></div>
      </div>
    `

    if (token !== categoriesRenderToken) return
    renderCategoryTable()
  } catch (err) {
    if (token !== categoriesRenderToken) return
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`
  }
}

async function showCategoryModal(id = null) {
  const isEdit = id !== null
  let cat = null
  if (isEdit) {
    const { data } = await supabaseClient.from('categories').select('*').eq('id', id).single()
    cat = data
    if (!cat) {
      showToast('Kategori tidak ditemukan', 'error')
      return
    }
  }

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.display = 'flex'
  overlay.innerHTML = `
    <div class="modal">
      ${modalHeader(isEdit ? '✏️' : '🏷️', isEdit ? 'Edit Kategori' : 'Tambah Kategori', isEdit ? 'Ubah nama kategori' : 'Buat kategori produk baru', 'purple')}
      <div class="modal-body">
      <form id="categoryForm">
        <div class="form-group">
          <label>Nama Kategori</label>
          <input type="text" id="cName" value="${isEdit ? escapeHtml(cat.name) : ''}" placeholder="Contoh: Minuman, ATK, Cemilan" required>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">✖️ Batal</button>
          <button type="submit" class="btn btn-primary">${isEdit ? '💾 Simpan' : '✅ Tambah'}</button>
        </div>
      </form>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  document.getElementById('categoryForm').onsubmit = async (e) => {
    e.preventDefault()
    const btn = overlay.querySelector('button[type="submit"]')
    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'

    const name = document.getElementById('cName').value.trim()
    if (!name) {
      showToast('Nama kategori wajib diisi', 'error')
      btn.disabled = false
      btn.innerHTML = isEdit ? 'Simpan' : 'Tambah'
      return
    }

    const { error } = isEdit
      ? await api.updateCategory(id, { name })
      : await api.addCategory(name)

    if (error) {
      showToast('Gagal: ' + error.message, 'error')
      btn.disabled = false
      btn.innerHTML = isEdit ? 'Simpan' : 'Tambah'
    } else {
      overlay.remove()
      showToast(isEdit ? 'Kategori diperbarui' : 'Kategori ditambahkan', 'success')
      renderCategories(document.getElementById('pageContent'))
    }
  }
}

async function deleteCategory(id) {
  const confirm = await confirmDialog('Yakin ingin menghapus kategori ini? Produk di dalamnya akan kehilangan kategori.')
  if (!confirm) return
  const { error } = await api.deleteCategory(id)
  if (error) {
    showToast('Gagal: ' + error.message, 'error')
  } else {
    showToast('Kategori berhasil dihapus', 'success')
    renderCategories(document.getElementById('pageContent'))
  }
}

function exportProductsExcel() {
  const headers = ['ID', 'Nama Produk', 'Harga Beli', 'Harga Jual', 'Stok', 'Stok Min', 'Barcode', 'Tersedia', 'Tanggal Dibuat']
  const rows = (window._products || []).map(p => [
    p.id,
    p.name,
    p.buy_price,
    p.price,
    p.stock,
    p.min_stock,
    p.barcode || '',
    p.is_available ? 'Ya' : 'Tidak',
    p.created_at
  ])
  downloadExcel('daftar_produk.xlsx', headers, rows)
}

function exportProductsPDF() {
  const headers = ['Nama Produk', 'Harga Beli', 'Harga Jual', 'Stok', 'Stok Min', 'Barcode', 'Tersedia']
  const rows = (window._products || []).map(p => [
    p.name,
    formatRupiah(p.buy_price),
    formatRupiah(p.price),
    p.stock,
    p.min_stock,
    p.barcode || '-',
    p.is_available ? 'Tersedia' : 'Nonaktif'
  ])
  printTableToPDF('Laporan Daftar Produk Koperasi Sekolah', headers, rows)
}

function importProductsExcel() {
  const desc = 'Format Excel harus memiliki header kolom berikut: <strong>nama, buy_price, price, stock, min_stock, barcode, is_available</strong>.<br>Kategori disesuaikan manual setelah diimpor.'
  openExcelImportModal('Impor Produk dari Excel', desc, async (rows) => {
    const productsToInsert = []
    for (const row of rows) {
      if (!row.name) continue
      productsToInsert.push({
        name: String(row.name).trim(),
        buy_price: parseFloat(row.buy_price) || 0,
        price: parseFloat(row.price) || 0,
        stock: parseInt(row.stock, 10) || 0,
        min_stock: parseInt(row.min_stock, 10) || 10,
        barcode: String(row.barcode || '').trim() || null,
        is_available: row.is_available === 'false' || row.is_available === '0' || row.is_available === 0 ? false : true
      })
    }

    if (productsToInsert.length === 0) {
      showToast('Tidak ada data produk yang valid untuk diimpor', 'error')
      return
    }

    const { error } = await api.addProductsBulk(productsToInsert)
    if (error) {
      showToast(`Gagal mengimpor produk: ${error.message}`, 'error')
    } else {
      showToast(`Berhasil mengimpor ${productsToInsert.length} produk sekaligus!`, 'success')
      renderProducts(document.getElementById('pageContent'))
    }
  })
}

window.filterProductTable = filterProductTable
window.setProductPage = setProductPage
window.setProductPageSize = setProductPageSize
window.showProductModal = showProductModal
window.deleteProduct = deleteProduct
window.filterCategoryTable = filterCategoryTable
window.setCategoryPage = setCategoryPage
window.setCategoryPageSize = setCategoryPageSize
window.showCategoryModal = showCategoryModal
window.deleteCategory = deleteCategory
window.exportProductsExcel = exportProductsExcel
window.exportProductsPDF = exportProductsPDF
window.importProductsExcel = importProductsExcel

