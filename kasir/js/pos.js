let cart = []
let selectedCategoryId = null
let searchQuery = ''
let posProducts = []
let posCategories = []
let posRenderToken = 0
let selectedPayment = 'Tunai'
let lastTransaction = null
let lastTransactionItems = []
let lastCashReceived = 0
let lastChange = 0
let posEventsBound = false
const POS_PHOTO_BUST = Date.now()

function getLiveProduct(productId) {
  return posProducts.find(p => p.id === productId)
}

function getCartQtyForProduct(productId) {
  const item = cart.find(i => i.product_id === productId)
  return item ? item.quantity : 0
}

function getAvailableStock(productId) {
  const product = getLiveProduct(productId)
  if (!product) return 0
  return Math.max(0, Number(product.stock) - getCartQtyForProduct(productId))
}

function getProductImage(product) {
  if (!product) return null
  if (product.photo_id) {
    // Bust once per page load so replaced storage files (same path) refresh
    return api.getProductPhotoUrl(product.photo_id, {
      bust: `${product.photo_id}-${POS_PHOTO_BUST}`
    })
  }
  const name = encodeURIComponent(String(product.name || 'produk').substring(0, 12))
  return `https://placehold.co/400x300/111111/FFC700?font=quicksand&text=${name}`
}

function pickSeragamGroupImage(variants) {
  const list = variants || []
  const withPhoto = list.filter(v => v.photo_id)
  if (!withPhoto.length) return getProductImage(list[0])
  withPhoto.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))
  return getProductImage(withPhoto[0])
}

function isSeragamCategory(productOrName) {
  const name = typeof productOrName === 'string'
    ? productOrName
    : (productOrName?.categories?.name || '')
  return /seragam/i.test(name || '')
}

function getProductBaseName(name) {
  const raw = String(name || '').trim()
  if (!raw) return ''
  const cut = raw.split(/\s*[-|\/(]\s*/)[0].trim()
  return cut || raw
}

function getSeragamBadge(product) {
  const cat = (product.categories?.name || '').trim()
  if (cat) return cat
  const name = String(product.name || '')
  if (/emblem/i.test(name)) return 'Emblem'
  if (/atribut/i.test(name)) return 'Atribut'
  if (/batik/i.test(name)) return 'Batik'
  return 'Seragam'
}

function groupSeragamProducts(products) {
  const map = new Map()
  ;(products || []).forEach(product => {
    if (!isSeragamCategory(product)) return
    const baseName = getProductBaseName(product.name)
    const key = baseName.toLowerCase()
    if (!map.has(key)) {
      map.set(key, {
        baseName,
        badge: getSeragamBadge(product),
        priceFrom: Number(product.price) || 0,
        variants: [],
        image: null
      })
    }
    const group = map.get(key)
    group.variants.push(product)
    const price = Number(product.price) || 0
    if (price < group.priceFrom) group.priceFrom = price
  })
  return Array.from(map.values()).map(group => {
    group.variants.sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'))
    group.image = pickSeragamGroupImage(group.variants)
    return group
  })
}

function shouldUseSeragamLayout(filtered) {
  if (!filtered.length) return false
  if (selectedCategoryId !== null) {
    const cat = posCategories.find(c => c.id === selectedCategoryId)
    if (cat && isSeragamCategory(cat.name)) return true
  }
  return filtered.every(p => isSeragamCategory(p))
}

function syncCartWithLiveProducts() {
  cart.forEach(item => {
    const product = getLiveProduct(item.product_id)
    if (!product) return
    item.product_name = product.name
    item.price = Number(product.price)
    item.subtotal = item.price * item.quantity
  })
}

async function reloadPOSCatalog(fresh = true) {
  const isCheckout = cart && cart.length > 0
  const [catRes, prodRes] = await Promise.all([
    api.getCategories({ fresh: fresh && !isCheckout }),
    api.getProducts({ fresh })
  ])
  if (catRes.error) throw catRes.error
  if (prodRes.error) throw prodRes.error
  posCategories = catRes.data || []
  posProducts = (prodRes.data || []).filter(p => p.is_available !== false)
  syncCartWithLiveProducts()
  return posProducts
}

function syncPaymentMethodUI() {
  const tunai = document.getElementById('payMethodTunai')
  const qris = document.getElementById('payMethodQris')
  const cashSection = document.getElementById('cashPaymentSection')
  const qrisSection = document.getElementById('qrisPaymentSection')
  if (!tunai || !qris) return

  const isTunai = selectedPayment === 'Tunai'
  tunai.className = isTunai
    ? 'flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-brand-blue bg-brand-blue text-white transition-all'
    : 'flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-gray-200 bg-white text-gray-500 transition-all'
  qris.className = !isTunai
    ? 'flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-brand-blue bg-brand-blue text-white transition-all'
    : 'flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-gray-200 bg-white text-gray-500 transition-all'

  if (cashSection) cashSection.classList.toggle('hidden', !isTunai)
  if (qrisSection) qrisSection.classList.toggle('hidden', isTunai)

  const qrisHint = document.getElementById('qrisPaymentHint')
  if (qrisHint) {
    qrisHint.textContent = isSelfOrderSession()
      ? 'Setelah bayar, kirim bukti lewat Konfirmasi WA'
      : 'Konfirmasi setelah pelanggan membayar'
  }

  if (isTunai) {
    updateChange()
  } else {
    syncProcessPaymentButton()
  }
}

function isSelfOrderSession() {
  return typeof Auth.isSelfOrder === 'function' && Auth.isSelfOrder()
}

function getProcessPaymentButtonLabel() {
  if (isSelfOrderSession()) {
    return '<i class="fab fa-whatsapp text-xl"></i> <span>Konfirmasi WA</span>'
  }
  return 'Proses'
}

function syncProcessPaymentButton({ forceDisabled } = {}) {
  const processBtn = document.getElementById('processPaymentBtn')
  if (!processBtn) return

  const self = isSelfOrderSession()
  processBtn.className = self
    ? 'w-full bg-[#25D366] hover:bg-[#1ebe57] text-white py-3 md:py-4 rounded-xl font-black text-lg md:text-xl transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transform active:scale-[0.98] flex items-center justify-center gap-2'
    : 'w-full bg-brand-blue hover:bg-brand-blueHover text-white py-3 md:py-4 rounded-xl font-black text-lg md:text-xl transition-all shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transform active:scale-[0.98]'

  if (!processBtn.dataset.busy) {
    processBtn.innerHTML = getProcessPaymentButtonLabel()
  }

  if (forceDisabled != null) {
    processBtn.disabled = forceDisabled
    return
  }

  if (self) {
    processBtn.disabled = cart.length === 0
    return
  }

  if (selectedPayment !== 'Tunai') {
    processBtn.disabled = cart.length === 0
  }
}

function normalizeWhatsAppNumber(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  if (digits.startsWith('8')) digits = '62' + digits
  return digits
}

function buildWaPaymentMessage(tx, items, totalAmount) {
  const buyer = typeof Auth.getCashierDisplayName === 'function'
    ? Auth.getCashierDisplayName()
    : Auth.getFullName()
  const isSiswa = Auth.getRole() === 'siswa'
  const className = (Auth.currentUser?.class_name || '').trim()
  const identityLine = isSiswa
    ? `Kelas: ${className || '-'}`
    : `No. Transaksi: ${tx?.transaction_number || tx?.id || '-'}`
  const lines = [
    '*Konfirmasi Pembayaran Koperasi Sekolah*',
    '',
    `Pemesan: ${buyer}`,
    identityLine,
    `Metode: ${selectedPayment}`,
    '',
    '*Rincian:*'
  ]
  ;(items || []).forEach((item, i) => {
    lines.push(`${i + 1}. ${item.product_name} x${item.quantity} = ${formatRupiah(item.subtotal)}`)
  })
  lines.push('')
  lines.push(`*Total: ${formatRupiah(totalAmount)}*`)
  lines.push('')
  lines.push('Mohon dikonfirmasi. Terima kasih.')
  return lines.join('\n')
}

function buildWaReceiptMessage(tx, items, cashReceived, change) {
  const cashierName = tx?.cashier_name || Auth.getFullName()
  const time = tx?.created_at ? formatDate(tx.created_at, true) : new Date().toLocaleString('id-ID')
  
  const lines = [
    '*🧾 KWITANSI KOPERASI SEKOLAH*',
    '----------------------------------------',
    `No. Transaksi: *${tx?.transaction_number || tx?.id || '-'}*`,
    `Kasir: ${cashierName}`,
    `Waktu: ${time}`,
    `Metode: ${tx?.payment_method || 'Tunai'}`,
    '----------------------------------------',
    '*Rincian Belanja:*'
  ]
  
  ;(items || []).forEach((item, i) => {
    lines.push(`${i + 1}. ${item.product_name} x${item.quantity} = ${formatRupiah(item.subtotal)}`)
  })
  
  lines.push('----------------------------------------')
  lines.push(`*Total: ${formatRupiah(tx?.total_amount || 0)}*`)
  if (tx?.payment_method === 'Tunai') {
    lines.push(`Bayar: ${formatRupiah(cashReceived || tx?.total_amount || 0)}`)
    lines.push(`Kembalian: ${formatRupiah(change || 0)}`)
  }
  lines.push('----------------------------------------')
  lines.push('Terima kasih telah berbelanja di Koperasi Sekolah! 😊')
  
  return lines.join('\n')
}

async function openCashierWhatsAppConfirm(tx, items, totalAmount) {
  const { data: cashier, error } = await api.getCashierWhatsApp()
  if (error) throw error
  const wa = normalizeWhatsAppNumber(cashier?.whatsapp)
  if (!wa) {
    showToast('Nomor WhatsApp kasir belum diatur di Admin → Pengguna', 'error')
    return false
  }
  const text = encodeURIComponent(buildWaPaymentMessage(tx, items, totalAmount))
  window.open(`https://wa.me/${wa}?text=${text}`, '_blank', 'noopener,noreferrer')
  return true
}

function renderCategoryButtons() {
  const desktop = document.getElementById('categoryContainer')
  const mobile = document.getElementById('bottomCategoryContainer')
  if (!desktop || !mobile) return

  const allActive = selectedCategoryId === null
  const desktopHtml = `
    <button type="button" class="category-btn ${allActive ? 'active' : ''} px-6 py-2.5 rounded-full text-sm font-bold shadow-sm ${allActive ? 'bg-brand-blue text-white border-2 border-brand-blue' : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-brand-blue hover:text-brand-navy'} transition-all transform active:scale-95 whitespace-nowrap" data-category="all">Semua</button>
    ${posCategories.map(c => {
      const active = selectedCategoryId === c.id
      return `<button type="button" class="category-btn ${active ? 'active' : ''} px-6 py-2.5 rounded-full text-sm font-bold shadow-sm ${active ? 'bg-brand-blue text-white border-2 border-brand-blue' : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-brand-blue hover:text-brand-navy'} transition-all transform active:scale-95 whitespace-nowrap" data-category="${c.id}">${suggestCategoryIcon(c.name)} ${escapeHtml(c.name)}</button>`
    }).join('')}
  `
  desktop.innerHTML = desktopHtml

  const mobileHtml = `
    <button type="button" class="bottom-category-btn flex-1 flex flex-col items-center justify-center py-1.5 px-2 ${allActive ? 'text-brand-blue' : 'text-gray-400 hover:text-brand-blue'} transition-transform active:scale-95 group flex-shrink-0 min-w-[52px]" data-category="all">
      <i class="fas fa-th-large text-base mb-0.5 transition-transform group-active:scale-90"></i>
      <span class="text-[9px] font-bold leading-tight">Semua</span>
    </button>
    ${posCategories.map(c => {
      const active = selectedCategoryId === c.id
      return `<button type="button" class="bottom-category-btn flex-1 flex flex-col items-center justify-center py-1.5 px-2 ${active ? 'text-brand-blue' : 'text-gray-400 hover:text-brand-blue'} transition-transform active:scale-95 group flex-shrink-0 min-w-[52px]" data-category="${c.id}">
        <span class="text-base mb-0.5 leading-none transition-transform group-active:scale-90">${suggestCategoryIcon(c.name)}</span>
        <span class="text-[9px] font-bold leading-tight truncate max-w-[52px]">${escapeHtml(c.name)}</span>
      </button>`
    }).join('')}
  `
  mobile.innerHTML = mobileHtml

  desktop.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.category))
  })
  mobile.querySelectorAll('.bottom-category-btn').forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.category))
  })
}

function setCategory(category) {
  selectedCategoryId = category === 'all' ? null : Number(category)
  renderCategoryButtons()
  renderProducts()
}

function getFilteredProducts() {
  return posProducts.filter(p => {
    const matchCategory = selectedCategoryId === null || p.category_id === selectedCategoryId
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCategory && matchSearch
  })
}

function renderNormalProductCard(product) {
  const available = getAvailableStock(product.id)
  const outOfStock = available <= 0
  const image = getProductImage(product)
  const isSpicy = /lv|pedas/i.test(product.name)

  const card = document.createElement('div')
  card.className = `bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col transform transition-transform active:scale-95 group hover:shadow-md ${outOfStock ? 'opacity-60' : ''}`
  card.innerHTML = `
    <div class="relative w-full bg-gray-50">
      <img src="${image}" alt="${escapeHtml(product.name)}" class="w-full h-auto max-w-full block object-contain" loading="lazy">
      ${isSpicy ? '<div class="absolute top-2 right-2 bg-brand-blue text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-md z-10">Pedas</div>' : ''}
      ${outOfStock ? '<div class="absolute inset-0 bg-black/40 flex items-center justify-center z-10"><span class="bg-white text-brand-navy font-black px-3 py-1.5 rounded-lg text-xs">Habis</span></div>' : ''}
    </div>
    <div class="p-3 flex flex-col bg-white relative z-10">
      <div>
        <h3 class="text-sm md:text-base font-bold text-brand-navy leading-snug mb-0.5 line-clamp-2">${escapeHtml(product.name)}</h3>
        <p class="text-[11px] text-gray-400 font-semibold">Stok: ${available}</p>
      </div>
      <div class="mt-2">
        <div class="text-gacoan-red font-black text-base md:text-lg mb-2">${formatRupiah(product.price)}</div>
        <button type="button" class="w-full bg-brand-blue hover:bg-brand-blueHover text-white font-bold text-sm py-2 rounded-xl transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" ${outOfStock ? 'disabled' : ''} data-add="${product.id}">
          Tambah
        </button>
      </div>
    </div>
  `
  if (!outOfStock) {
    card.querySelector('[data-add]').addEventListener('click', () => addToCart(product))
  }
  return card
}

function renderSeragamProductCard(group) {
  const totalAvailable = group.variants.reduce((s, v) => s + getAvailableStock(v.id), 0)
  const outOfStock = totalAvailable <= 0
  const variantCount = group.variants.length
  const choiceLabel = variantCount === 1 ? '1 pilihan tersedia' : `${variantCount} pilihan tersedia`

  const card = document.createElement('div')
  card.className = `bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col transform transition-transform active:scale-95 group hover:shadow-md ${outOfStock ? 'opacity-60' : ''}`
  card.innerHTML = `
    <div class="relative w-full bg-gray-50">
      <img src="${group.image}" alt="${escapeHtml(group.baseName)}" class="w-full h-auto max-w-full block object-contain" loading="lazy">
      <div class="absolute top-2 left-2 bg-brand-navy/90 text-white text-[10px] font-black px-2.5 py-1 rounded-md shadow-md z-10 uppercase tracking-wide">${escapeHtml(group.badge)}</div>
      ${outOfStock ? '<div class="absolute inset-0 bg-black/40 flex items-center justify-center z-10"><span class="bg-white text-brand-navy font-black px-3 py-1.5 rounded-lg text-xs">Habis</span></div>' : ''}
    </div>
    <div class="p-3 flex flex-col bg-white relative z-10">
      <div class="flex items-start justify-between gap-2 mb-1">
        <h3 class="text-sm md:text-base font-black text-brand-navy leading-snug uppercase line-clamp-2 flex-1">${escapeHtml(group.baseName)}</h3>
        <div class="text-brand-blue font-black text-sm md:text-base whitespace-nowrap">${formatRupiah(group.priceFrom)}</div>
      </div>
      <p class="text-[11px] text-gray-400 font-semibold mb-2">${choiceLabel}</p>
      <button type="button" class="w-full bg-brand-blue hover:bg-brand-blueHover text-white font-bold text-sm py-2.5 rounded-xl transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" ${outOfStock ? 'disabled' : ''} data-seragam-detail>
        <i class="fas fa-eye text-xs"></i>
        <span>Lihat Detail &amp; Varian</span>
      </button>
    </div>
  `
  if (!outOfStock) {
    card.querySelector('[data-seragam-detail]').addEventListener('click', () => openSeragamVariantModal(group))
  }
  return card
}

function getSeragamVariantLabel(variant, baseName) {
  const label = String(variant.name || '')
    .replace(new RegExp('^' + String(baseName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
    .replace(/^[\s\-|/]+/, '')
    .trim()
  return label || variant.name
}

function closeSeragamVariantModal() {
  document.getElementById('seragamVariantModal')?.remove()
}

function openSeragamVariantModal(group) {
  closeSeragamVariantModal()

  const availableVariants = group.variants.filter(v => getAvailableStock(v.id) > 0)
  const initialVariant = availableVariants[0] || group.variants[0]
  if (!initialVariant) return

  let selectedVariantId = initialVariant.id
  let qty = 1

  const getSelectedVariant = () =>
    group.variants.find(v => v.id === selectedVariantId) || initialVariant

  const getMaxQty = () => Math.max(0, getAvailableStock(getSelectedVariant().id))

  const overlay = document.createElement('div')
  overlay.id = 'seragamVariantModal'
  overlay.className = 'fixed inset-0 bg-black/70 z-[60] flex items-end md:items-center justify-center backdrop-blur-sm p-0 md:p-4'

  const buildOptions = () => group.variants.map(variant => {
    const available = getAvailableStock(variant.id)
    const disabled = available <= 0
    const label = getSeragamVariantLabel(variant, group.baseName)
    const selected = variant.id === selectedVariantId
    return `
      <button type="button"
        class="w-full text-left px-3 py-2.5 text-sm font-semibold transition-colors ${disabled ? 'text-gray-300 cursor-not-allowed' : selected ? 'bg-brand-blue text-white' : 'text-brand-navy hover:bg-brand-light'}"
        data-variant-option="${variant.id}" ${disabled ? 'disabled' : ''}>
        ${escapeHtml(label)} - ${formatRupiah(variant.price)}${disabled ? ' (Habis)' : ''}
      </button>
    `
  }).join('')

  const renderModalBody = () => {
    const selected = getSelectedVariant()
    const maxQty = getMaxQty()
    if (qty > maxQty) qty = Math.max(1, maxQty)
    if (maxQty <= 0) qty = 0
    const label = getSeragamVariantLabel(selected, group.baseName)
    const canAdd = maxQty > 0 && qty > 0

    return `
      <div class="bg-white rounded-t-3xl md:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" id="seragamVariantModalContent">
        <div class="p-4 flex justify-between items-center bg-brand-navy text-white flex-shrink-0">
          <h3 class="font-black text-lg uppercase tracking-wide truncate pr-3">${escapeHtml(group.baseName)}</h3>
          <button type="button" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center flex-shrink-0" data-close-seragam>
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="p-4 md:p-5 overflow-y-auto flex-1 min-h-0 bg-white">
          <div class="flex flex-col sm:flex-row gap-4">
            <div class="w-full sm:w-40 flex-shrink-0">
              <div class="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                <img src="${getProductImage(selected) || group.image}" alt="${escapeHtml(group.baseName)}" class="w-full h-full object-contain">
              </div>
            </div>
            <div class="flex-1 min-w-0 flex flex-col">
              <h4 class="font-black text-brand-navy text-base uppercase mb-2">${escapeHtml(group.baseName)}</h4>
              <span class="inline-flex self-start items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-soft text-brand-navy mb-4">${escapeHtml(group.badge)}</span>

              <label class="block text-sm font-bold text-gray-700 mb-1.5">Pilih Varian:</label>
              <div class="relative mb-4" id="seragamVariantDropdown">
                <button type="button" class="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-sm font-semibold text-brand-navy hover:border-brand-blue transition-colors" data-toggle-variant>
                  <span class="truncate text-left" data-variant-label>${escapeHtml(label)} - ${formatRupiah(selected.price)}</span>
                  <i class="fas fa-chevron-down text-xs text-gray-400 flex-shrink-0"></i>
                </button>
                <div class="hidden absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto" data-variant-menu>
                  ${buildOptions()}
                </div>
              </div>

              <div class="mt-auto flex items-center gap-3 pt-1">
                <div class="flex items-center bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                  <button type="button" class="w-10 h-10 flex items-center justify-center text-brand-navy font-black hover:bg-gray-200 transition-colors" data-qty-minus ${qty <= 1 || maxQty <= 0 ? 'disabled' : ''}>-</button>
                  <span class="w-10 text-center font-black text-brand-navy" data-qty-value>${qty}</span>
                  <button type="button" class="w-10 h-10 flex items-center justify-center text-brand-navy font-black hover:bg-gray-200 transition-colors" data-qty-plus ${qty >= maxQty || maxQty <= 0 ? 'disabled' : ''}>+</button>
                </div>
                <button type="button" class="flex-1 bg-brand-navy hover:bg-blue-900 text-white font-black py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" data-add-seragam ${canAdd ? '' : 'disabled'}>
                  <i class="fas fa-shopping-cart text-sm"></i>
                  <span>Tambah</span>
                </button>
              </div>
              <p class="text-[11px] text-gray-400 font-semibold mt-2">Stok tersedia: ${maxQty}</p>
            </div>
          </div>
        </div>
      </div>
    `
  }

  const bindModalEvents = () => {
    overlay.querySelector('[data-close-seragam]')?.addEventListener('click', closeSeragamVariantModal)

    const dropdown = overlay.querySelector('#seragamVariantDropdown')
    const menu = overlay.querySelector('[data-variant-menu]')
    const toggleBtn = overlay.querySelector('[data-toggle-variant]')

    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      menu?.classList.toggle('hidden')
    })

    overlay.querySelectorAll('[data-variant-option]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedVariantId = Number(btn.dataset.variantOption)
        qty = 1
        refreshModal()
      })
    })

    overlay.querySelector('[data-qty-minus]')?.addEventListener('click', () => {
      if (qty > 1) {
        qty--
        refreshModal()
      }
    })

    overlay.querySelector('[data-qty-plus]')?.addEventListener('click', () => {
      const maxQty = getMaxQty()
      if (qty < maxQty) {
        qty++
        refreshModal()
      }
    })

    overlay.querySelector('[data-add-seragam]')?.addEventListener('click', () => {
      const product = getSelectedVariant()
      const maxQty = getMaxQty()
      if (!product || maxQty <= 0 || qty <= 0) return

      const liveProduct = getLiveProduct(product.id) || product
      const existing = cart.find(item => item.product_id === product.id)
      const currentQty = existing ? existing.quantity : 0
      if (currentQty + qty > Number(liveProduct.stock ?? 0)) {
        showToast(`Stok ${product.name} tidak mencukupi`, 'error')
        return
      }

      if (existing) {
        existing.quantity += qty
        existing.subtotal = existing.quantity * existing.price
      } else {
        cart.push({
          product_id: product.id,
          product_name: product.name,
          price: Number(product.price),
          quantity: qty,
          subtotal: Number(product.price) * qty
        })
      }

      updateCartUI()
      renderProducts()
      closeSeragamVariantModal()

      if (window.innerWidth < 768 && cart.length === 1) openMobileCart()
    })
  }

  const refreshModal = () => {
    overlay.innerHTML = renderModalBody()
    bindModalEvents()
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSeragamVariantModal()
    else {
      const menu = overlay.querySelector('[data-variant-menu]')
      const dropdown = overlay.querySelector('#seragamVariantDropdown')
      if (menu && dropdown && !dropdown.contains(e.target)) menu.classList.add('hidden')
    }
  })

  refreshModal()
  document.body.appendChild(overlay)
}

function renderProducts() {
  const grid = document.getElementById('productsGrid')
  const empty = document.getElementById('emptyProductState')
  if (!grid || !empty) return

  const filtered = getFilteredProducts()
  grid.innerHTML = ''

  if (filtered.length === 0) {
    grid.classList.add('hidden')
    empty.classList.remove('hidden')
    empty.classList.add('flex')
    return
  }

  grid.classList.remove('hidden')
  empty.classList.add('hidden')
  empty.classList.remove('flex')

  if (shouldUseSeragamLayout(filtered)) {
    const groups = groupSeragamProducts(filtered)
    groups.forEach(group => grid.appendChild(renderSeragamProductCard(group)))
    return
  }

  const renderedSeragamKeys = new Set()
  filtered.forEach(product => {
    if (isSeragamCategory(product)) {
      const key = getProductBaseName(product.name).toLowerCase()
      if (renderedSeragamKeys.has(key)) return
      renderedSeragamKeys.add(key)

      const siblings = posProducts.filter(p =>
        isSeragamCategory(p) &&
        getProductBaseName(p.name).toLowerCase() === key &&
        (selectedCategoryId === null || p.category_id === selectedCategoryId) &&
        (!searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      const fullGroup = groupSeragamProducts(siblings)[0]
      if (fullGroup) grid.appendChild(renderSeragamProductCard(fullGroup))
    } else {
      grid.appendChild(renderNormalProductCard(product))
    }
  })
}

function addToCart(product) {
  const liveProduct = getLiveProduct(product.id) || product
  const existing = cart.find(item => item.product_id === product.id)
  const currentQty = existing ? existing.quantity : 0
  const maxStock = Number(liveProduct.stock ?? 0)

  if (currentQty >= maxStock) {
    showToast(`Stok ${product.name} tidak mencukupi`, 'error')
    return
  }

  if (existing) {
    existing.quantity++
    existing.subtotal = existing.quantity * existing.price
  } else {
    cart.push({
      product_id: product.id,
      product_name: product.name,
      price: Number(product.price),
      quantity: 1,
      subtotal: Number(product.price)
    })
  }

  updateCartUI()
  renderProducts()

  const icon = document.querySelector('#bottomNavCartBtn i')
  if (icon) {
    icon.classList.add('scale-125', 'text-yellow-600')
    setTimeout(() => icon.classList.remove('scale-125', 'text-yellow-600'), 200)
  }

  if (window.innerWidth < 768 && cart.length === 1) {
    openMobileCart()
  }
}

function updateCartUI() {
  const container = document.getElementById('cartItemsContainer')
  const totalEl = document.getElementById('totalAmount')
  const checkoutBtn = document.getElementById('checkoutBtn')
  const clearBtn = document.getElementById('clearCartBtn')
  const bottomCount = document.getElementById('bottomNavCartCount')
  const cartBtn = document.getElementById('bottomNavCartBtn')
  if (!container || !totalEl) return

  const total = cart.reduce((s, i) => s + i.subtotal, 0)
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0)
  window.currentCartTotal = total

  totalEl.textContent = formatRupiah(total)

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-gray-400 min-h-[200px]">
        <i class="fas fa-shopping-basket text-6xl mb-4 text-gray-300"></i>
        <p class="text-gray-500 font-bold">Keranjang Kosong</p>
        <p class="text-sm text-gray-400 mt-1 font-medium">Yuk, pilih menu dulu!</p>
      </div>
    `
    if (checkoutBtn) checkoutBtn.disabled = true
    if (clearBtn) clearBtn.classList.add('hidden')
  } else {
    if (clearBtn) clearBtn.classList.remove('hidden')
    if (checkoutBtn) checkoutBtn.disabled = false
    container.innerHTML = ''

    cart.forEach((item, idx) => {
      const el = document.createElement('div')
      el.className = 'bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between gap-3'
      el.innerHTML = `
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-bold text-brand-navy truncate">${escapeHtml(item.product_name)}</h4>
          <div class="text-gacoan-red font-black text-xs md:text-sm mt-0.5">${formatRupiah(item.price)}</div>
        </div>
        <div class="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100">
          <button type="button" class="w-8 h-8 flex items-center justify-center text-brand-navy hover:bg-white rounded-lg transition-all shadow-sm font-bold" data-qty="${idx}" data-delta="-1">
            <i class="fas fa-minus text-xs"></i>
          </button>
          <span class="w-8 text-center text-sm font-black text-brand-navy">${item.quantity}</span>
          <button type="button" class="w-8 h-8 flex items-center justify-center text-white bg-brand-blue hover:bg-brand-blueHover rounded-lg transition-all shadow-sm font-bold" data-qty="${idx}" data-delta="1">
            <i class="fas fa-plus text-xs"></i>
          </button>
        </div>
      `
      el.querySelectorAll('[data-qty]').forEach(btn => {
        btn.addEventListener('click', () => updateCartQty(Number(btn.dataset.qty), Number(btn.dataset.delta)))
      })
      container.appendChild(el)
    })
  }

  if (bottomCount && cartBtn) {
    bottomCount.textContent = totalItems
    if (totalItems > 0) {
      bottomCount.classList.remove('hidden')
      cartBtn.classList.add('text-brand-navy')
      cartBtn.classList.remove('text-gray-400')
    } else {
      bottomCount.classList.add('hidden')
      cartBtn.classList.remove('text-brand-navy')
      cartBtn.classList.add('text-gray-400')
    }
  }
}

function updateCartQty(idx, delta) {
  const item = cart[idx]
  if (!item) return

  const newQty = item.quantity + delta
  if (newQty <= 0) {
    showConfirmModal(
      'Hapus Item?',
      `Apakah Anda yakin ingin menghapus "${item.product_name}" dari keranjang?`,
      'fas fa-trash-alt',
      () => {
        cart.splice(idx, 1)
        updateCartUI()
        renderProducts()
      }
    )
  } else {
    const product = getLiveProduct(item.product_id)
    const maxStock = Number(product?.stock ?? 0)
    if (newQty > maxStock) {
      showToast(`Stok maksimal ${item.product_name}: ${maxStock}`, 'error')
      return
    }
    item.quantity = newQty
    item.subtotal = item.quantity * item.price
    updateCartUI()
    renderProducts()
  }
}

function clearCart() {
  cart = []
  updateCartUI()
  renderProducts()
}

function openMobileCart() {
  const sidebar = document.getElementById('cartSidebar')
  const overlay = document.getElementById('cartOverlay')
  if (!sidebar || !overlay) return
  sidebar.classList.remove('translate-y-full')
  overlay.classList.remove('hidden')
  setTimeout(() => overlay.classList.remove('opacity-0'), 10)
}

function closeMobileCart() {
  const sidebar = document.getElementById('cartSidebar')
  const overlay = document.getElementById('cartOverlay')
  if (!sidebar || !overlay) return
  sidebar.classList.add('translate-y-full')
  overlay.classList.add('opacity-0')
  setTimeout(() => overlay.classList.add('hidden'), 300)
}

function openPaymentModal() {
  if (cart.length === 0) return

  const modal = document.getElementById('paymentModal')
  const content = document.getElementById('paymentModalContent')
  const modalTotal = document.getElementById('modalTotalAmount')
  const cashInput = document.getElementById('cashInput')
  const processBtn = document.getElementById('processPaymentBtn')
  const cashSection = document.getElementById('cashPaymentSection')
  if (!modal || !content) return

  const self = isSelfOrderSession()
  selectedPayment = self ? 'QRIS' : 'Tunai'
  if (processBtn) {
    delete processBtn.dataset.busy
    syncProcessPaymentButton({ forceDisabled: true })
  }
  syncPaymentMethodUI()
  syncProcessPaymentButton()

  // Self-order: fokus QRIS; input tunai kasir disembunyikan
  if (self && cashSection && selectedPayment === 'QRIS') {
    cashSection.classList.add('hidden')
  }

  if (modalTotal) modalTotal.textContent = formatRupiah(window.currentCartTotal)
  if (cashInput) cashInput.value = ''
  updateChange()
  syncProcessPaymentButton()

  modal.classList.remove('hidden')
  setTimeout(() => {
    if (window.innerWidth < 768) {
      content.classList.remove('translate-y-full', 'opacity-0')
    } else {
      content.classList.remove('md:scale-95', 'opacity-0')
    }
    if (selectedPayment === 'Tunai' && cashInput) {
      setTimeout(() => cashInput.focus(), 300)
    }
  }, 10)
}

function closePaymentModal() {
  const modal = document.getElementById('paymentModal')
  const content = document.getElementById('paymentModalContent')
  if (!modal || !content) return

  if (window.innerWidth < 768) {
    content.classList.add('translate-y-full', 'opacity-0')
  } else {
    content.classList.add('md:scale-95', 'opacity-0')
  }
  setTimeout(() => modal.classList.add('hidden'), 300)
}

function updateChange() {
  const cashInput = document.getElementById('cashInput')
  const changeEl = document.getElementById('changeAmount')
  const processBtn = document.getElementById('processPaymentBtn')
  if (!cashInput || !changeEl || !processBtn) return

  if (selectedPayment !== 'Tunai') {
    syncProcessPaymentButton()
    return
  }

  const rawValue = cashInput.value.replace(/\./g, '')
  const cash = parseInt(rawValue, 10) || 0
  const total = window.currentCartTotal || 0
  const change = cash - total
  const self = isSelfOrderSession()

  if (cash === 0) {
    changeEl.textContent = 'Rp 0'
    changeEl.classList.remove('text-gacoan-red', 'text-green-600')
    changeEl.classList.add('text-gray-800')
    // Self-order QRIS-style: WA tetap bisa jika keranjang ada; Tunai butuh uang cukup
    processBtn.disabled = self ? cart.length === 0 : true
    if (self && cart.length > 0) {
      // Tunai tanpa input: tetap izinkan konfirmasi WA (uang pas diasumsikan di kasir)
      processBtn.disabled = false
    }
    return
  }

  if (change < 0) {
    changeEl.innerHTML = `<span class="block text-xl md:text-2xl mb-1">Kurang:</span>${formatRupiah(Math.abs(change))}`
    changeEl.classList.add('text-gacoan-red')
    changeEl.classList.remove('text-green-600', 'text-gray-800')
    processBtn.disabled = true
  } else {
    changeEl.textContent = formatRupiah(change)
    changeEl.classList.add('text-green-600')
    changeEl.classList.remove('text-gacoan-red', 'text-gray-800')
    processBtn.disabled = false
  }

  if (self && !processBtn.dataset.busy) {
    processBtn.innerHTML = getProcessPaymentButtonLabel()
  }
}

function openSuccessModal(cashReceived, change, totalAmount) {
  lastCashReceived = cashReceived || 0
  lastChange = change || 0
  const modal = document.getElementById('successModal')
  const content = document.getElementById('successModalContent')
  const total = totalAmount ?? lastTransaction?.total_amount ?? window.currentCartTotal ?? 0
  const self = isSelfOrderSession()

  const successTitle = content?.querySelector('h3')
  const successMsg = content?.querySelector('p.text-gray-500')
  if (successTitle) successTitle.textContent = self ? 'Pesanan Terkirim!' : 'Lunas!'
  if (successMsg) {
    successMsg.textContent = self
      ? 'Bukti pembayaran dibuka di WhatsApp kasir.'
      : 'Pembayaran berhasil diproses.'
  }

  document.getElementById('receiptTotal').textContent = formatRupiah(total)

  const cashRow = document.getElementById('receiptCashRow')
  const changeRow = document.getElementById('receiptChangeRow')

  if (selectedPayment === 'Tunai') {
    if (cashRow) cashRow.classList.remove('hidden')
    if (changeRow) changeRow.classList.remove('hidden')
    document.getElementById('receiptCash').textContent = formatRupiah(cashReceived)
    document.getElementById('receiptChange').textContent = formatRupiah(change)
  } else {
    if (cashRow) cashRow.classList.add('hidden')
    if (changeRow) changeRow.classList.add('hidden')
  }

  modal.classList.remove('hidden')
  setTimeout(() => content.classList.remove('scale-95', 'opacity-0'), 10)
}

function resetPOS() {
  const content = document.getElementById('successModalContent')
  const modal = document.getElementById('successModal')
  content.classList.add('scale-95', 'opacity-0')
  setTimeout(() => {
    modal.classList.add('hidden')
    clearCart()
    closeMobileCart()
    lastTransaction = null
    lastTransactionItems = []
  }, 300)
}

async function processPayment() {
  if (cart.length === 0) {
    showToast('Keranjang masih kosong', 'error')
    return
  }

  const processBtn = document.getElementById('processPaymentBtn')
  const cashInput = document.getElementById('cashInput')
  const modalTotal = document.getElementById('modalTotalAmount')
  const self = isSelfOrderSession()
  processBtn.disabled = true
  processBtn.dataset.busy = '1'
  const originalText = getProcessPaymentButtonLabel()
  processBtn.innerHTML = self
    ? '<i class="fas fa-spinner fa-spin"></i> <span>Mengirim...</span>'
    : '<i class="fas fa-spinner fa-spin"></i> Memproses...'

  const resetBtn = () => {
    delete processBtn.dataset.busy
    processBtn.innerHTML = originalText
    if (self) syncProcessPaymentButton()
    else if (selectedPayment === 'Tunai') updateChange()
    else syncProcessPaymentButton()
  }

  let cashReceived = 0
  let change = 0

  try {
    await reloadPOSCatalog(true)
    syncCartWithLiveProducts()
    updateCartUI()
    renderProducts()

    for (const item of cart) {
      const product = getLiveProduct(item.product_id)
      if (!product) {
        showToast(`${item.product_name} tidak tersedia lagi`, 'error')
        resetBtn()
        return
      }
      if (item.quantity > Number(product.stock ?? 0)) {
        showToast(`Stok ${item.product_name} tidak mencukupi`, 'error')
        resetBtn()
        return
      }
    }

    const totalAmount = cart.reduce((s, i) => s + i.subtotal, 0)
    window.currentCartTotal = totalAmount
    if (modalTotal) modalTotal.textContent = formatRupiah(totalAmount)

    if (selectedPayment === 'Tunai') {
      const rawValue = (cashInput?.value || '').replace(/\./g, '')
      cashReceived = parseInt(rawValue, 10) || 0
      if (self && cashReceived === 0) {
        cashReceived = totalAmount
        change = 0
      } else {
        change = cashReceived - totalAmount
        if (change < 0) {
          showToast('Uang tidak mencukupi (total diperbarui)', 'error')
          updateChange()
          resetBtn()
          return
        }
      }
    }

    if (self) {
      const { data: cashier, error: waErr } = await api.getCashierWhatsApp()
      if (waErr) throw waErr
      if (!normalizeWhatsAppNumber(cashier?.whatsapp)) {
        showToast('Nomor WhatsApp kasir belum diatur. Hubungi admin.', 'error')
        resetBtn()
        return
      }
    }

    const items = cart.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal
    }))

    const transaction = {
      total_amount: totalAmount,
      payment_method: selectedPayment,
      cashier_name: typeof Auth.getCashierDisplayName === 'function'
        ? Auth.getCashierDisplayName()
        : Auth.getFullName(),
      cashier_id: self ? null : Auth.getUserId(),
      buyer_ref: self && typeof Auth.getBuyerRef === 'function' ? Auth.getBuyerRef() : null,
      transaction_number: generateTransactionNumber()
    }

    const { data: tx, error } = await api.processSale(transaction, items)
    if (error) throw error

    cart.forEach(item => {
      const product = getLiveProduct(item.product_id)
      if (product) product.stock = Math.max(0, Number(product.stock) - item.quantity)
    })

    lastTransaction = tx
    lastTransactionItems = items

    cart = []
    updateCartUI()
    closeMobileCart()

    delete processBtn.dataset.busy
    processBtn.innerHTML = originalText
    closePaymentModal()

    if (self) {
      await openCashierWhatsAppConfirm(tx, items, totalAmount)
    }
    openSuccessModal(cashReceived, change, totalAmount)
    renderProducts()
  } catch (err) {
    showToast('Gagal memproses: ' + (err.message || err), 'error')
    resetBtn()
  }
}

function bindPOSEvents() {
  if (posEventsBound) return
  posEventsBound = true

  function handleSearchInput(value) {
    searchQuery = value
    const mobile = document.getElementById('searchInput')
    const desktop = document.getElementById('searchInputDesktop')
    if (mobile && mobile.value !== value) mobile.value = value
    if (desktop && desktop.value !== value) desktop.value = value
    renderProducts()
  }

  const searchInput = document.getElementById('searchInput')
  const searchInputDesktop = document.getElementById('searchInputDesktop')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => handleSearchInput(e.target.value))
  }
  if (searchInputDesktop) {
    searchInputDesktop.addEventListener('input', (e) => handleSearchInput(e.target.value))
  }

  document.getElementById('btnScanBarcodeMobile')?.addEventListener('click', openBarcodeScanner)
  document.getElementById('btnScanBarcodeDesktop')?.addEventListener('click', openBarcodeScanner)
  document.getElementById('closeBarcodeScannerBtn')?.addEventListener('click', closeBarcodeScanner)
  document.getElementById('barcodeCameraSelect')?.addEventListener('change', (e) => startScanning(e.target.value))

  document.getElementById('clearCartBtn')?.addEventListener('click', () => {
    if (cart.length > 0) {
      showConfirmModal(
        'Kosongkan Keranjang?',
        'Apakah Anda yakin ingin menghapus semua pesanan di keranjang?',
        'fas fa-trash-alt',
        () => {
          clearCart()
        }
      )
    }
  })

  document.getElementById('confirmModalCancelBtn')?.addEventListener('click', closeConfirmModal)
  document.getElementById('confirmModalConfirmBtn')?.addEventListener('click', () => {
    if (confirmModalCallback) {
      confirmModalCallback()
    }
    closeConfirmModal()
  })
  document.getElementById('confirmModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirmModal()
  })

  document.getElementById('bottomNavCartBtn')?.addEventListener('click', openMobileCart)
  document.getElementById('closeCartBtn')?.addEventListener('click', closeMobileCart)
  document.getElementById('closeCartArea')?.addEventListener('click', closeMobileCart)
  document.getElementById('cartOverlay')?.addEventListener('click', closeMobileCart)

  document.getElementById('checkoutBtn')?.addEventListener('click', openPaymentModal)
  document.getElementById('closePaymentBtn')?.addEventListener('click', closePaymentModal)

  document.getElementById('payMethodTunai')?.addEventListener('click', () => {
    selectedPayment = 'Tunai'
    syncPaymentMethodUI()
  })
  document.getElementById('payMethodQris')?.addEventListener('click', () => {
    selectedPayment = 'QRIS'
    syncPaymentMethodUI()
  })

  const cashInput = document.getElementById('cashInput')
  if (cashInput) {
    cashInput.addEventListener('input', function () {
      let value = this.value.replace(/[^0-9]/g, '')
      this.value = value !== '' ? parseInt(value, 10).toLocaleString('id-ID') : ''
      updateChange()
    })
  }

  document.querySelectorAll('.quick-cash-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!cashInput) return
      const amount = btn.dataset.amount
      if (amount === 'exact') {
        cashInput.value = (window.currentCartTotal || 0).toLocaleString('id-ID')
      } else {
        const nominal = parseInt(amount, 10)
        if (!isNaN(nominal) && nominal > 0) {
          cashInput.value = nominal.toLocaleString('id-ID')
        }
      }
      updateChange()
    })
  })

  document.getElementById('resetCashBtn')?.addEventListener('click', () => {
    if (cashInput) cashInput.value = ''
    updateChange()
  })

  document.getElementById('processPaymentBtn')?.addEventListener('click', processPayment)

  document.getElementById('newTransactionBtn')?.addEventListener('click', resetPOS)

  document.getElementById('printReceiptBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('printReceiptBtn')
    const original = btn.innerHTML
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mencetak...'
    if (lastTransaction) printReceipt(lastTransaction, lastTransactionItems)
    setTimeout(() => {
      btn.innerHTML = '<i class="fas fa-check"></i> Selesai'
      setTimeout(() => {
        btn.innerHTML = original
        resetPOS()
      }, 800)
    }, 600)
  })

  document.getElementById('shareWaBtn')?.addEventListener('click', () => {
    if (!lastTransaction) return
    const text = buildWaReceiptMessage(lastTransaction, lastTransactionItems, lastCashReceived, lastChange)
    const encoded = encodeURIComponent(text)
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer')
  })
}

async function loadPOSProducts() {
  const token = ++posRenderToken
  try {
    await reloadPOSCatalog(false)
    if (token !== posRenderToken) return
    if (!document.getElementById('productsGrid')) return

    if (selectedCategoryId !== null && !posCategories.some(c => c.id === selectedCategoryId)) {
      selectedCategoryId = null
    }

    renderCategoryButtons()
    renderProducts()
    updateCartUI()
  } catch (err) {
    if (token !== posRenderToken) return
    const grid = document.getElementById('productsGrid')
    if (!grid) return
    grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500"><i class="fas fa-exclamation-circle text-4xl mb-3"></i><p class="font-bold">${escapeHtml(err.message)}</p></div>`
  }
}

function initPOS() {
  bindPOSEvents()
  updateCartUI()
  loadPOSProducts()
}

let html5QrcodeScannerInstance = null

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioCtx.createOscillator()
    const gainNode = audioCtx.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)
    
    oscillator.type = 'sine'
    oscillator.frequency.value = 1000 // 1000Hz frequency
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15)
    
    oscillator.start(audioCtx.currentTime)
    oscillator.stop(audioCtx.currentTime + 0.15)
  } catch (e) {
    console.warn("Gagal membunyikan beep:", e)
  }
}

function openBarcodeScanner() {
  const modal = document.getElementById('barcodeScannerModal')
  const content = document.getElementById('barcodeScannerModalContent')
  const select = document.getElementById('barcodeCameraSelect')
  if (!modal || !content) return

  modal.classList.remove('hidden')
  setTimeout(() => {
    content.classList.remove('scale-95', 'opacity-0')
  }, 10)

  Html5Qrcode.getCameras().then(devices => {
    if (devices && devices.length) {
      select.innerHTML = ''
      devices.forEach((device, index) => {
        const option = document.createElement('option')
        option.value = device.id
        if (device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('rear')) {
          option.selected = true
        }
        option.text = device.label || `Kamera ${index + 1}`
        select.appendChild(option)
      })
      
      startScanning(select.value)
    } else {
      select.innerHTML = '<option value="">Kamera tidak ditemukan</option>'
      showToast('Kamera tidak terdeteksi', 'error')
    }
  }).catch(err => {
    select.innerHTML = '<option value="">Gagal mengakses kamera</option>'
    showToast('Gagal memuat kamera: ' + err, 'error')
  })
}

function startScanning(cameraId) {
  if (html5QrcodeScannerInstance) {
    html5QrcodeScannerInstance.stop().then(() => {
      initializeHtml5Qrcode(cameraId)
    }).catch(err => {
      console.warn("Gagal menghentikan scanner sebelumnya:", err)
      initializeHtml5Qrcode(cameraId)
    })
  } else {
    initializeHtml5Qrcode(cameraId)
  }
}

function initializeHtml5Qrcode(cameraId) {
  if (!cameraId) return
  html5QrcodeScannerInstance = new Html5Qrcode("barcodeReader")
  
  const config = {
    fps: 30, // FPS lebih tinggi untuk performa pemindaian yang lebih responsif
    qrbox: function(width, height) {
      const size = Math.min(width, height);
      return { width: size, height: size };
    },
    aspectRatio: 1.0,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true // Menggunakan detektor bawaan browser (sangat cepat & sensitif)
    }
  }

  html5QrcodeScannerInstance.start(
    cameraId, 
    config,
    (decodedText, decodedResult) => {
      handleScannedBarcode(decodedText)
    },
    (errorMessage) => {
      // Ignore scan failures to avoid spam
    }
  ).then(() => {
    // Terapkan autofocus continuous setelah kamera berhasil menyala
    setTimeout(() => {
      if (html5QrcodeScannerInstance) {
        html5QrcodeScannerInstance.applyVideoConstraints({
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

function closeBarcodeScanner() {
  const modal = document.getElementById('barcodeScannerModal')
  const content = document.getElementById('barcodeScannerModalContent')
  if (!modal || !content) return

  content.classList.add('scale-95', 'opacity-0')
  setTimeout(() => {
    modal.classList.add('hidden')
  }, 300)

  if (html5QrcodeScannerInstance) {
    html5QrcodeScannerInstance.stop().then(() => {
      html5QrcodeScannerInstance = null
    }).catch(err => {
      console.warn("Gagal mematikan kamera:", err)
      html5QrcodeScannerInstance = null
    })
  }
}

function handleScannedBarcode(barcode) {
  playBeep()
  
  const barcodeStr = String(barcode).trim()
  const product = posProducts.find(p => p.barcode && String(p.barcode).trim() === barcodeStr)
  
  if (product) {
    if (isSeragamCategory(product)) {
      closeBarcodeScanner()
      const baseName = getProductBaseName(product.name).toLowerCase()
      const siblings = posProducts.filter(p =>
        isSeragamCategory(p) &&
        getProductBaseName(p.name).toLowerCase() === baseName
      )
      const fullGroup = groupSeragamProducts(siblings)[0]
      if (fullGroup) {
        openSeragamVariantModal(fullGroup)
      }
      showToast(`Produk varian seragam ditemukan untuk barcode ${barcodeStr}`, 'success')
    } else {
      addToCart(product)
      showToast(`${product.name} berhasil ditambahkan!`, 'success')
      closeBarcodeScanner()
    }
  } else {
    showToast(`Produk dengan barcode "${barcodeStr}" tidak ditemukan`, 'error')
  }
}

let confirmModalCallback = null

function showConfirmModal(title, message, iconClass, onConfirm) {
  const modal = document.getElementById('confirmModal')
  const content = document.getElementById('confirmModalContent')
  const titleEl = document.getElementById('confirmModalTitle')
  const msgEl = document.getElementById('confirmModalMessage')
  const iconEl = document.getElementById('confirmModalIcon')
  
  if (!modal || !content) return

  if (title) titleEl.textContent = title
  if (message) msgEl.textContent = message
  if (iconClass && iconEl) {
    iconEl.className = `${iconClass} text-4xl text-red-500`
  }

  confirmModalCallback = onConfirm

  modal.classList.remove('hidden')
  setTimeout(() => {
    modal.classList.remove('opacity-0')
    content.classList.remove('scale-95', 'opacity-0')
  }, 10)
}

function closeConfirmModal() {
  const modal = document.getElementById('confirmModal')
  const content = document.getElementById('confirmModalContent')
  if (!modal || !content) return

  content.classList.add('scale-95', 'opacity-0')
  modal.classList.add('opacity-0')
  setTimeout(() => {
    modal.classList.add('hidden')
    confirmModalCallback = null
  }, 300)
}

window.initPOS = initPOS
window.openSeragamVariantModal = openSeragamVariantModal
window.closeSeragamVariantModal = closeSeragamVariantModal
window.openBarcodeScanner = openBarcodeScanner
window.closeBarcodeScanner = closeBarcodeScanner
window.startScanning = startScanning

