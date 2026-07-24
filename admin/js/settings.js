function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function renderSettings(container) {
  container.innerHTML = `
    ${adminPageNote('fas fa-cog', 'Pengaturan', 'Backup data, hapus data operasional, dan cetak QR Code/Barcode login.')}

    <div class="settings-grid">
      <section class="settings-card">
        <div class="settings-card-head">
          <div class="settings-card-icon settings-icon-backup"><i class="fas fa-download"></i></div>
          <div>
            <h3>Backup Data</h3>
            <p>Unduh salinan JSON kategori, produk, transaksi, pengguna, anggota, dan pengaturan.</p>
          </div>
        </div>
        <ul class="settings-list">
          <li>Termasuk: categories, products, transactions, transaction_items, users, members, app_settings</li>
          <li>Foto produk di Storage tidak ikut terunduh (hanya <code>photo_id</code>)</li>
        </ul>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="btnBackupData">
            <i class="fas fa-file-export"></i> Unduh Backup JSON
          </button>
          <button type="button" class="btn btn-success" id="btnImportData">
            <i class="fas fa-file-import"></i> Impor Backup JSON
          </button>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head">
          <div class="settings-card-icon settings-icon-capacity"><i class="fas fa-database"></i></div>
          <div>
            <h3>Kapasitas Database</h3>
            <p>Informasi kapasitas penyimpanan database Supabase Anda.</p>
          </div>
        </div>
        <div class="settings-capacity-content">
          <div class="capacity-row">
            <span class="capacity-label">Terpakai:</span>
            <span class="capacity-value" id="capacityUsed">Memuat...</span>
          </div>
          <div class="capacity-row">
            <span class="capacity-label">Sisa:</span>
            <span class="capacity-value" id="capacityRemaining">Memuat...</span>
          </div>
          <div class="capacity-progress-container">
            <div class="capacity-progress-bar" id="capacityProgressBar"></div>
          </div>
          <div style="text-align: right; margin-top: 12px; font-size: 12px; color: var(--text-light);">
            <span>Kapasitas Maksimal: 500 MB</span>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head">
          <div class="settings-card-icon settings-icon-db"><i class="fas fa-qrcode"></i></div>
          <div>
            <h3>Barcode Login</h3>
            <p>Cetak QR Code / Barcode login yang dapat dipindai untuk langsung masuk ke aplikasi Koperasi Sekolah.</p>
          </div>
        </div>
        <ul class="settings-list">
          <li>Memudahkan kasir, siswa, atau guru mengakses aplikasi dari HP/tablet</li>
          <li>QR Code akan otomatis mengarah ke URL login aktif saat ini</li>
        </ul>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="btnPrintLoginBarcode">
            <i class="fas fa-print"></i> Cetak QR Code Login
          </button>
        </div>
      </section>

      <section class="settings-card settings-card-danger">
        <div class="settings-card-head">
          <div class="settings-card-icon settings-icon-danger"><i class="fas fa-trash-alt"></i></div>
          <div>
            <h3>Hapus Data</h3>
            <p>Hapus data operasional. Akun admin/kasir dan konfigurasi database tidak dihapus.</p>
          </div>
        </div>
        <div class="settings-actions-col">
          <button type="button" class="btn btn-outline" data-purge="transactions">
            <i class="fas fa-receipt"></i> Hapus semua transaksi
          </button>
          <button type="button" class="btn btn-outline" data-purge="catalog">
            <i class="fas fa-box"></i> Hapus produk &amp; kategori
          </button>
          <button type="button" class="btn btn-outline" data-purge="members">
            <i class="fas fa-id-card"></i> Hapus semua anggota
          </button>
          <button type="button" class="btn btn-danger" data-purge="all_except_users">
            <i class="fas fa-exclamation-triangle"></i> Hapus semua data (kecuali pengguna)
          </button>
        </div>
      </section>
    </div>
  `

  document.getElementById('btnBackupData')?.addEventListener('click', runBackupExport)
  document.getElementById('btnImportData')?.addEventListener('click', triggerImportFile)
  document.getElementById('btnPrintLoginBarcode')?.addEventListener('click', printLoginBarcode)

  container.querySelectorAll('[data-purge]').forEach(btn => {
    btn.addEventListener('click', () => runPurgeData(btn.dataset.purge, btn))
  })

  updateCapacityUI()
}

async function runBackupExport() {
  const btn = document.getElementById('btnBackupData')
  if (!btn) return
  const original = btn.innerHTML
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyiapkan...'
  try {
    const { data, error } = await api.exportBackup()
    if (error) throw error
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadJsonFile(`waroeng-backup-${stamp}.json`, data)
    const counts = Object.fromEntries(
      Object.entries(data.tables || {}).map(([k, rows]) => [k, (rows || []).length])
    )
    showToast(`Backup berhasil diunduh (${Object.values(counts).reduce((a, b) => a + b, 0)} baris)`, 'success')
  } catch (err) {
    showToast('Gagal backup: ' + (err.message || err), 'error')
  } finally {
    btn.disabled = false
    btn.innerHTML = original
  }
}

const PURGE_LABELS = {
  transactions: 'semua transaksi (beserta item)',
  catalog: 'semua produk dan kategori',
  members: 'semua anggota siswa/guru',
  all_except_users: 'SEMUA data operasional (transaksi, produk, kategori, anggota). Akun admin/kasir & konfigurasi DB tetap aman'
}

async function runPurgeData(scope, btn) {
  const label = PURGE_LABELS[scope] || scope
  const ok = await confirmDialog(
    `Yakin ingin menghapus ${label}? Tindakan ini tidak dapat dibatalkan. Disarankan backup dulu.`
  )
  if (!ok) return

  const typed = window.prompt('Ketik HAPUS untuk konfirmasi:')
  if (typed !== 'HAPUS') {
    showToast('Penghapusan dibatalkan', 'error')
    return
  }

  const original = btn.innerHTML
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menghapus...'
  try {
    const { data, error } = await api.purgeData(scope)
    if (error) throw error
    showToast(`Berhasil menghapus: ${(data.cleared || []).join(', ')}`, 'success')
  } catch (err) {
    showToast(err.message || String(err), 'error')
  } finally {
    btn.disabled = false
    btn.innerHTML = original
  }
}

async function updateCapacityUI() {
  const usedEl = document.getElementById('capacityUsed')
  const remainingEl = document.getElementById('capacityRemaining')
  const barEl = document.getElementById('capacityProgressBar')
  if (!usedEl || !remainingEl || !barEl) return

  try {
    const { data: bytes, error } = await api.getDatabaseSize()
    if (error) throw error

    const maxBytes = 500 * 1024 * 1024 // 500 MB
    const usedBytes = bytes || 652000 // default fallback
    const remainingBytes = Math.max(0, maxBytes - usedBytes)

    function formatBytes(b) {
      if (b >= 1024 * 1024) {
        return (b / (1024 * 1024)).toFixed(2) + ' MB'
      }
      return (b / 1024).toFixed(2) + ' KB'
    }

    usedEl.textContent = formatBytes(usedBytes)
    remainingEl.textContent = formatBytes(remainingBytes)

    const pct = Math.min(100, Math.max(0.1, (usedBytes / maxBytes) * 100))
    barEl.style.width = pct + '%'
  } catch (err) {
    usedEl.textContent = 'Gagal memuat'
    remainingEl.textContent = 'Gagal memuat'
    console.error('Error loading capacity:', err)
  }
}

function triggerImportFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const ok = await confirmDialog(`Apakah Anda yakin ingin mengimpor data dari "${file.name}"? Data yang konflik akan ditimpa.`, { confirmText: 'Yakin', confirmIcon: '✅' })
    if (!ok) return

    const btn = document.getElementById('btnImportData')
    const original = btn ? btn.innerHTML : ''
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengimpor...'
    }

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target.result)
          const { data, error } = await api.importBackup(json)
          if (error) throw error
          
          let summary = []
          for (const [table, count] of Object.entries(data || {})) {
            summary.push(`${table}: ${count} baris`)
          }
          showToast(`Impor berhasil! (${summary.join(', ')})`, 'success')
          
          renderSettings(document.getElementById('pageContent'))
        } catch (err) {
          showToast('File tidak valid atau gagal dibaca: ' + (err.message || err), 'error')
          if (btn) {
            btn.disabled = false
            btn.innerHTML = original
          }
        }
      }
      reader.readAsText(file)
    } catch (err) {
      showToast('Gagal membaca file: ' + err.message, 'error')
      if (btn) {
        btn.disabled = false
        btn.innerHTML = original
      }
    }
  }
  input.click()
}

function printLoginBarcode() {
  const loginUrl = 'https://smandakng.github.io/koperasi_sekolah'
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(loginUrl)}`
  
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    showToast('Gagal membuka jendela cetak. Periksa pop-up blocker browser Anda.', 'error')
    return
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Cetak QR Code Login</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
          margin: 0;
          padding: 40px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 80vh;
          background: #ffffff;
          color: #1e293b;
        }
        .container {
          text-align: center;
          max-width: 400px;
          border: 2px dashed #cbd5e1;
          padding: 30px;
          border-radius: 20px;
        }
        .logo-container {
          background: #0284c7;
          color: white;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
          font-size: 24px;
        }
        h1 {
          font-size: 20px;
          font-weight: 800;
          margin: 0 0 8px 0;
          color: #0f172a;
        }
        p {
          font-size: 13px;
          color: #64748b;
          margin: 0 0 24px 0;
          line-height: 1.5;
        }
        .qr-code {
          width: 200px;
          height: 200px;
          margin: 0 auto 20px auto;
          display: block;
        }
        .url-text {
          font-family: monospace;
          font-size: 11px;
          background: #f1f5f9;
          padding: 8px 12px;
          border-radius: 8px;
          word-break: break-all;
          color: #334155;
          margin: 0;
        }
        @media print {
          body {
            background: none;
            padding: 0;
          }
          .container {
            border: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-container">🛒</div>
        <h1>KOPERASI SEKOLAH</h1>
        <p>Pindai QR Code di bawah untuk masuk ke Halaman Login aplikasi Koperasi Sekolah.</p>
        <img class="qr-code" src="${qrUrl}" alt="QR Code Login">
        <p class="url-text">${loginUrl}</p>
      </div>
      <script>
        const img = document.querySelector('.qr-code');
        function doPrint() {
          setTimeout(() => {
            window.print();
            setTimeout(() => { window.close(); }, 500);
          }, 300);
        }
        if (img.complete) {
          doPrint();
        } else {
          img.onload = doPrint;
          img.onerror = doPrint;
        }
      </script>
    </body>
    </html>
  `)
  printWindow.document.close()
}

window.renderSettings = renderSettings
