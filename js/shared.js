function formatRupiah(amount) {
  return 'Rp. ' + Number(amount).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Ikon emoji kategori otomatis dari nama (tidak disimpan di database) */
function suggestCategoryIcon(name) {
  const n = (name || '').toLowerCase().trim()
  if (!n) return '📦'

  const rules = [
    { keys: ['gorengan', 'bakwan', 'tahu isi', 'tempe goreng', 'risol', 'pisang goreng'], icon: '🥟' },
    { keys: ['makanan', 'nasi', 'mie', 'ayam', 'lauk', 'food', 'makan'], icon: '🍱' },
    { keys: ['minuman', 'minum', 'es ', 'teh', 'kopi', 'jus', 'air', 'drink', 'soda'], icon: '🥤' },
    { keys: ['cemilan', 'snack', 'keripik', 'biskuit', 'wafer', 'cokelat', 'permen'], icon: '🍿' },
    { keys: ['seragam', 'baju sekolah', 'atribut sekolah'], icon: '👔' },
    { keys: ['paket', 'hemat', 'combo', 'set'], icon: '📦' },
    { keys: ['atk', 'alat tulis', 'pensil', 'pulpen', 'buku', 'penghapus', 'penggaris'], icon: '✏️' },
    { keys: ['buah', 'fruit', 'apel', 'jeruk'], icon: '🍎' },
    { keys: ['roti', 'kue', 'cake', 'donat', 'bakery'], icon: '🍞' },
    { keys: ['es krim', 'ice cream', 'dessert', 'puding'], icon: '🍦' },
    { keys: ['sayur', 'salad', 'vegetarian'], icon: '🥗' },
    { keys: ['daging', 'sosis', 'burger'], icon: '🍖' },
    { keys: ['seafood', 'ikan', 'udang'], icon: '🐟' },
    { keys: ['obat', 'kesehatan', 'vitamin'], icon: '💊' },
    { keys: ['elektronik', 'gadget', 'charger'], icon: '🔌' },
    { keys: ['lain', 'other', 'umum'], icon: '📦' }
  ]

  for (const rule of rules) {
    if (rule.keys.some(k => n.includes(k))) return rule.icon
  }
  return '📦'
}

function adminPageNote(icon, title, description) {
  return `
    <div class="admin-page-note">
      <div class="admin-page-note-icon"><i class="${icon}"></i></div>
      <div class="admin-page-note-text">
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
    </div>
  `
}

/** Modal error akses / sesi — dipanggil saat Auth guard gagal */
function showAuthErrorModal({ emoji = '🚫', title, message, redirect, buttonLabel = 'Mengerti' }) {
  document.body.classList.add('auth-blocked')

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay auth-error-overlay'
  overlay.style.display = 'flex'
  overlay.innerHTML = `
    <div class="modal confirm-modal auth-error-modal">
      ${modalHeader(emoji, title, 'Akses halaman ditolak', 'warning')}
      <div class="modal-body confirm-modal-body">
        <p class="confirm-message auth-error-message">${message}</p>
        <div class="modal-actions confirm-actions">
          <button type="button" class="btn btn-primary" id="authErrorOk">${buttonLabel}</button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const go = () => {
    if (redirect) window.location.href = redirect
    else {
      overlay.remove()
      document.body.classList.remove('auth-blocked')
    }
  }

  document.getElementById('authErrorOk').onclick = go
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) go()
  })
}

/** Header modal dengan emoji dan opsi varian warna */
function modalHeader(emoji, title, subtitle = '', variant = 'primary') {
  return `
    <div class="modal-header modal-header-${variant}">
      <div class="modal-header-icon" aria-hidden="true">${emoji}</div>
      <div class="modal-header-text">
        <h2>${title}</h2>
        ${subtitle ? `<p>${subtitle}</p>` : ''}
      </div>
    </div>
  `
}

function formatRupiahSplit(amount) {
  const nominal = Number(amount).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `<span class="money-split"><span class="money-currency">Rp.</span> <span class="money-nominal">${nominal}</span></span>`
}

/** Format angka untuk input uang (tanpa prefix Rp), contoh: 50000 → "50.000" */
function formatRupiahInput(amount) {
  const digits = String(amount ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/** Parse nilai input uang berformat Indonesia ke angka */
function parseRupiahInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

/** Pasang format rupiah real-time pada input teks */
function attachRupiahInput(input) {
  if (!input || input.dataset.rupiahBound) return
  input.dataset.rupiahBound = '1'
  input.setAttribute('inputmode', 'numeric')
  input.setAttribute('autocomplete', 'off')

  const applyFormat = () => {
    const start = input.selectionStart ?? 0
    const digitsBefore = input.value.slice(0, start).replace(/\D/g, '').length
    input.value = formatRupiahInput(input.value)

    let newPos = input.value.length
    let digitCount = 0
    for (let i = 0; i < input.value.length; i++) {
      if (/\d/.test(input.value[i])) digitCount++
      if (digitCount === digitsBefore) {
        newPos = i + 1
        break
      }
    }
    input.setSelectionRange(newPos, newPos)
  }

  input.addEventListener('input', applyFormat)
  if (input.value) input.value = formatRupiahInput(input.value)
}

/** Pasang format rupiah pada semua input dengan class .input-rupiah di dalam container */
function attachRupiahInputs(root = document) {
  root.querySelectorAll('.input-rupiah').forEach(attachRupiahInput)
}

const APP_TIMEZONE = 'Asia/Jakarta'

function formatDate(dateStr, withTime = true) {
  const d = new Date(dateStr)
  const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: APP_TIMEZONE }
  if (withTime) {
    options.hour = '2-digit'
    options.minute = '2-digit'
  }
  return d.toLocaleDateString('id-ID', options)
}

function formatDateShort(dateStr) {
  const d = new Date(`${dateStr}T12:00:00+07:00`)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: APP_TIMEZONE })
}

function jakartaDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function todayStr() {
  return jakartaDateStr()
}

function nowISO() {
  return new Date().toISOString()
}

function jakartaDayRangeISO(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+07:00`).toISOString()
  const end = new Date(`${dateStr}T23:59:59.999+07:00`).toISOString()
  return { start, end }
}

function txDayKey(createdAt) {
  return jakartaDateStr(new Date(createdAt))
}

function aggregateRevenueByDays(transactions, dates) {
  const map = Object.fromEntries(dates.map(d => [d, { revenue: 0, count: 0 }]))
  for (const tx of transactions || []) {
    const day = txDayKey(tx.created_at)
    if (!map[day]) continue
    map[day].revenue += Number(tx.total_amount)
    map[day].count++
  }
  return {
    revenue: dates.map(d => map[d].revenue),
    count: dates.map(d => map[d].count)
  }
}

function countItemsSold(transactions, day = null) {
  let total = 0
  for (const tx of transactions || []) {
    if (day && txDayKey(tx.created_at) !== day) continue
    for (const item of tx.transaction_items || []) total += item.quantity
  }
  return total
}

function getBestSellingProduct(transactions) {
  const sales = {}
  for (const tx of transactions || []) {
    for (const item of tx.transaction_items || []) {
      sales[item.product_name] = (sales[item.product_name] || 0) + item.quantity
    }
  }
  const top = Object.entries(sales).sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : '-'
}

function buildWeekBuckets(weekCount) {
  const buckets = []
  const today = todayStr()
  for (let w = weekCount - 1; w >= 0; w--) {
    const end = addDaysToDateStr(today, -(w * 7))
    const start = addDaysToDateStr(end, -6)
    buckets.push({
      label: formatDateShort(start),
      start,
      end
    })
  }
  return buckets
}

function aggregateByWeekBuckets(transactions, buckets) {
  return buckets.map(b => {
    let revenue = 0
    let count = 0
    for (const tx of transactions || []) {
      const day = txDayKey(tx.created_at)
      if (day >= b.start && day <= b.end) {
        revenue += Number(tx.total_amount)
        count++
      }
    }
    return { revenue, count }
  })
}

function aggregateByMonth(transactions, year) {
  const revenue = Array(12).fill(0)
  const count = Array(12).fill(0)
  const yearStr = String(year)
  for (const tx of transactions || []) {
    const day = txDayKey(tx.created_at)
    if (!day.startsWith(yearStr)) continue
    const m = Number(day.slice(5, 7)) - 1
    revenue[m] += Number(tx.total_amount)
    count[m]++
  }
  return { revenue, count }
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast-notif')
  if (existing) existing.remove()
  const toast = document.createElement('div')
  toast.className = `toast-notif toast-${type}`
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span class="toast-message"></span>
  `
  toast.querySelector('.toast-message').textContent = message
  document.body.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('show'))
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 200)
  }, 3000)
}

function confirmDialog(message, { confirmText = 'Hapus', confirmIcon = '🗑️' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.style.display = 'flex'
    overlay.innerHTML = `
      <div class="modal confirm-modal">
        ${modalHeader('⚠️', 'Konfirmasi', 'Tindakan ini tidak dapat dibatalkan', 'warning')}
        <div class="modal-body confirm-modal-body">
          <p class="confirm-message">${escapeHtml(message)}</p>
          <div class="modal-actions confirm-actions">
            <button class="btn btn-outline" id="confirmNo">✖️ Batal</button>
            <button class="btn btn-danger" id="confirmYes">${confirmIcon} ${confirmText}</button>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    document.getElementById('confirmNo').onclick = () => {
      overlay.remove()
      resolve(false)
    }
    document.getElementById('confirmYes').onclick = () => {
      overlay.remove()
      resolve(true)
    }
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove()
        resolve(false)
      }
    }
  })
}

function generateTransactionNumber() {
  const d = todayStr().replace(/-/g, '')
  const t = Date.now().toString(36).slice(-5).toUpperCase()
  const r = Math.floor(Math.random() * 900) + 100
  return `INV-${d}-${t}${r}`
}

function printReceipt(transaction, items) {
  const receiptWindow = window.open('', '_blank', 'width=420,height=700')
  if (!receiptWindow) {
    showToast('Popup diblokir browser. Izinkan popup untuk mencetak struk.', 'error')
    return
  }
  const date = formatDate(transaction.created_at, true)
  const itemsHtml = items.map(item => `
    <tr>
      <td class="col-item">${escapeHtml(item.product_name)}</td>
      <td class="col-qty">${item.quantity}x</td>
      <td class="col-money">${formatRupiahSplit(item.subtotal)}</td>
    </tr>
  `).join('')

  receiptWindow.document.write(`
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Struk Pembayaran</title>
      <style>
        @page { margin: 4mm; size: auto; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          width: 100%;
          min-height: 100%;
          background: #fff;
          color: #000;
        }
        body {
          font-family: Arial, Helvetica, 'Segoe UI', sans-serif;
          margin: 0;
          padding: 0;
        }
        .receipt {
          width: 100%;
          max-width: 100%;
          margin: 0 auto;
          /* Jarak aman dari pinggir kertas/layar */
          padding: clamp(12px, 5.5%, 28px) clamp(14px, 7%, 32px);
          container-type: inline-size;
          container-name: receipt;
          /* Skala font mengikuti lebar kontainer (kertas/layar) */
          font-size: clamp(12px, 4.5cqi, 16px);
          line-height: 1.45;
          word-wrap: break-word;
          overflow-wrap: anywhere;
        }
        .header { text-align: center; margin-bottom: 0.65em; }
        .header h2 {
          font-size: 1.5em;
          font-weight: 800;
          margin-bottom: 0.35em;
          letter-spacing: 0.3px;
        }
        .header p {
          font-size: 1em;
          font-weight: 400;
          color: #222;
          line-height: 1.45;
          padding: 0 0.25em;
        }
        .divider {
          border-top: 1px dashed #000;
          margin: 0.6em 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        th {
          font-size: 1em;
          font-weight: 700;
          padding: 0.35em 0.15em;
          border-bottom: 1px dashed #999;
        }
        td {
          padding: 0.35em 0.15em;
          vertical-align: top;
          font-size: 1em;
          font-weight: 400;
        }
        .col-item { text-align: left; width: 48%; word-break: break-word; padding-right: 0.35em; }
        .col-qty { text-align: center; width: 14%; white-space: nowrap; }
        .col-money { text-align: right; width: 38%; white-space: nowrap; padding-left: 0.35em; }
        .total-row td {
          font-weight: 700;
          font-size: 1em;
          padding-top: 0.45em;
          padding-bottom: 0.15em;
        }
        .footer {
          text-align: center;
          margin-top: 0.75em;
          font-size: 1em;
          font-weight: 400;
          line-height: 1.5;
          padding: 0 0.4em;
        }
        .money-split { display: inline; white-space: nowrap; }
        .money-currency, .money-nominal { display: inline; }

        /* Fallback jika browser tidak support cqi */
        @supports not (font-size: 1cqi) {
          .receipt {
            font-size: clamp(12px, 3.4vw, 16px);
            padding: clamp(12px, 4vw, 28px) clamp(14px, 5vw, 32px);
          }
        }

        @media print {
          html, body { width: 100%; background: #fff; }
          .receipt {
            max-width: 100%;
            box-shadow: none;
            padding: 3mm 5mm 4mm;
            font-size: clamp(12px, 4.5cqi, 15px);
          }
        }

        @media screen {
          body {
            min-height: 100vh;
            background: #e5e7eb;
            display: flex;
            justify-content: center;
            padding: clamp(12px, 3vw, 24px);
          }
          .receipt {
            max-width: min(100%, 420px);
            background: #fff;
            box-shadow: 0 1px 4px rgba(0,0,0,0.12);
            min-height: calc(100vh - 48px);
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <div class="header">
          <h2>KOPERASI SEKOLAH</h2>
          <p>${date}</p>
          <p>No: ${escapeHtml(transaction.transaction_number || '-')}</p>
          <p>Kasir: ${escapeHtml(transaction.cashier_name || '-')}</p>
          <p>Metode: ${escapeHtml(transaction.payment_method || 'Tunai')}</p>
        </div>
        <div class="divider"></div>
        <table>
          <thead>
            <tr>
              <th class="col-item">Item</th>
              <th class="col-qty">Qty</th>
              <th class="col-money">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>
        <table>
          <tr class="total-row">
            <td colspan="2">TOTAL</td>
            <td class="col-money">${formatRupiahSplit(transaction.total_amount)}</td>
          </tr>
        </table>
        <div class="divider"></div>
        <div class="footer">
          <p>Terima kasih telah berbelanja!</p>
          <p>Barang yang sudah dibeli tidak dapat dikembalikan</p>
        </div>
      </div>
      <script>
        window.onload = function() { window.print(); }
      <\\/script>
    </body>
    </html>
  `)
  receiptWindow.document.close()
}

/**
 * Ekspor data ke format Excel (.xlsx) menggunakan SheetJS
 */
function downloadExcel(filename, headers, rows) {
  try {
    const worksheetData = [headers, ...rows]
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data")
    XLSX.writeFile(workbook, filename)
  } catch (err) {
    showToast('Gagal mengekspor Excel: ' + err.message, 'error')
  }
}

/**
 * Cetak data tabel ke format PDF menggunakan pencetakan bawaan browser
 */
function printTableToPDF(title, headers, rows) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    showToast('Gagal membuka jendela cetak. Periksa pop-up blocker browser Anda.', 'error')
    return
  }

  const rowsHtml = rows.map(row => `
    <tr>
      ${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}
    </tr>
  `).join('')

  const headersHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: 'Inter', sans-serif; color: #333; margin: 20px; }
        h1 { text-align: center; font-size: 20px; margin-bottom: 5px; }
        p.subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
        th { background-color: #f3f4f6; font-weight: bold; }
        tr:nth-child(even) { background-color: #fafafa; }
        @media print {
          body { margin: 10mm 15mm; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">Koperasi Sekolah - Dicetak pada ${new Date().toLocaleString('id-ID')}</p>
      <table>
        <thead>
          <tr>${headersHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 500);
        }
      <\/script>
    </body>
    </html>
  `)
  printWindow.document.close()
}

/**
 * Modal untuk import data dari file Excel (.xlsx atau .xls)
 */
function openExcelImportModal(title, columnsDescription, onImport) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.display = 'flex'
  overlay.innerHTML = `
    <div class="modal confirm-modal" style="max-width: 480px">
      ${modalHeader('📥', title, 'Unggah berkas Excel untuk impor data', 'primary')}
      <div class="modal-body confirm-modal-body">
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px;line-height:1.5">${columnsDescription}</p>
        <div class="form-group" style="margin-bottom:20px">
          <label style="font-weight:bold;display:block;margin-bottom:6px">Pilih File Excel (.xlsx, .xls)</label>
          <input type="file" id="excelFileInput" accept=".xlsx, .xls" required style="border:2px dashed var(--border);padding:24px;text-align:center;width:100%;border-radius:12px;background:#fafafa;cursor:pointer">
        </div>
        <div class="modal-actions confirm-actions">
          <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">✖ Batal</button>
          <button type="button" id="btnImportSubmit" class="btn btn-primary" disabled>📥 Impor</button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const fileInput = document.getElementById('excelFileInput')
  const submitBtn = document.getElementById('btnImportSubmit')

  fileInput.onchange = () => {
    submitBtn.disabled = !fileInput.files.length
  }

  submitBtn.onclick = () => {
    const file = fileInput.files[0]
    if (!file) return

    submitBtn.disabled = true
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...'

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const rowsData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

        if (rowsData.length <= 1) {
          throw new Error('File Excel kosong atau hanya berisi header')
        }

        const headers = rowsData[0].map(h => String(h || '').toLowerCase().trim())
        const dataRows = rowsData.slice(1).map(cells => {
          const obj = {}
          headers.forEach((header, index) => {
            let val = cells[index] !== undefined ? cells[index] : ''
            obj[header] = val
          })
          return obj
        })

        overlay.remove()
        onImport(dataRows)
      } catch (err) {
        showToast('Gagal memproses file Excel: ' + err.message, 'error')
        submitBtn.disabled = false
        submitBtn.innerHTML = '📥 Impor'
      }
    }
    reader.readAsArrayBuffer(file)
  }
}
