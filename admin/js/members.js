let _membersFilter = 'all'
let _membersStatusFilter = 'all'
let _membersClassFilter = 'all'
let _membersSearch = ''

function getNumericClass(className) {
  if (!className) return Infinity; // Put teachers/empty class at the end
  const str = String(className).toUpperCase().trim();
  
  // Convert common Roman numerals to arabic numbers
  let normalized = str;
  normalized = normalized.replace(/\bXII\b/g, '12');
  normalized = normalized.replace(/\bXI\b/g, '11');
  normalized = normalized.replace(/\bIX\b/g, '9');
  normalized = normalized.replace(/\bX\b/g, '10');
  normalized = normalized.replace(/\bVIII\b/g, '8');
  normalized = normalized.replace(/\bVII\b/g, '7');
  normalized = normalized.replace(/\bVI\b/g, '6');
  normalized = normalized.replace(/\bIV\b/g, '4');
  normalized = normalized.replace(/\bV\b/g, '5');
  normalized = normalized.replace(/\bIII\b/g, '3');
  normalized = normalized.replace(/\bII\b/g, '2');
  normalized = normalized.replace(/\bI\b/g, '1');

  const match = normalized.match(/\d+/);
  return match ? parseInt(match[0], 10) : 999;
}

function getFilteredMembers(members) {
  const q = (_membersSearch || '').trim().toLowerCase()
  const filtered = (members || []).filter(m => {
    const matchType = _membersFilter === 'all' || m.member_type === _membersFilter
    if (!matchType) return false

    let matchStatus = true
    if (_membersStatusFilter === 'active') matchStatus = m.is_active !== false
    else if (_membersStatusFilter === 'inactive') matchStatus = m.is_active === false
    if (!matchStatus) return false

    const matchClass = _membersClassFilter === 'all' || String(m.class_name || '').trim() === _membersClassFilter
    if (!matchClass) return false

    if (!q) return true
    return (
      String(m.full_name || '').toLowerCase().includes(q)
      || String(m.member_no || '').toLowerCase().includes(q)
      || String(m.class_name || '').toLowerCase().includes(q)
    )
  })

  return filtered.sort((a, b) => {
    const numA = getNumericClass(a.class_name)
    const numB = getNumericClass(b.class_name)
    
    if (numA !== numB) {
      return numA - numB
    }
    
    const classA = String(a.class_name || '')
    const classB = String(b.class_name || '')
    const classComp = classA.localeCompare(classB, undefined, { numeric: true, sensitivity: 'base' })
    if (classComp !== 0) {
      return classComp
    }
    
    const nameA = String(a.full_name || '')
    const nameB = String(b.full_name || '')
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
  })
}

function getEffectiveMemberPageSize(total) {
  const size = window._memberPageSize
  if (!size || size <= 0) return Math.max(total, 1)
  return size
}

function isAllMemberPages() {
  return !window._memberPageSize || window._memberPageSize <= 0
}

function buildMemberPageNumbers(current, total) {
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

function renderMemberPagination(total, start, shown, totalPages) {
  const footer = document.getElementById('memberTableFooter')
  if (!footer) return

  if (total === 0) {
    footer.innerHTML = '<span class="products-table-info">Menampilkan 0 data</span>'
    return
  }

  const end = start + shown
  const page = window._memberPage || 1
  const pageSize = window._memberPageSize ?? 10
  const pages = buildMemberPageNumbers(page, totalPages)
  const paginationHtml = (isAllMemberPages() || totalPages <= 1) ? '' : `
    <div class="products-pagination">
      <button type="button" onclick="setMemberPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>« Prev</button>
      ${pages.map(p => {
        if (p === '...') return '<span class="products-page-ellipsis">...</span>'
        return `<button type="button" class="${p === page ? 'active' : ''}" onclick="setMemberPage(${p})">${p}</button>`
      }).join('')}
      <button type="button" onclick="setMemberPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next »</button>
    </div>
  `

  footer.innerHTML = `
    <span class="products-table-info">Menampilkan ${start + 1}-${end} dari ${total} data</span>
    <div class="products-table-controls">
      <select class="products-page-size" onchange="setMemberPageSize(Number(this.value))" aria-label="Jumlah baris per halaman">
        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / Hal</option>
        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / Hal</option>
        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / Hal</option>
      </select>
      ${paginationHtml}
    </div>
  `
}

function renderMemberTable() {
  const filtered = getFilteredMembers(window._membersCache)
  const total = filtered.length
  const pageSize = getEffectiveMemberPageSize(total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!window._memberPage || window._memberPage < 1) window._memberPage = 1
  if (window._memberPage > totalPages) window._memberPage = totalPages

  const start = total === 0 ? 0 : (window._memberPage - 1) * pageSize
  const pageItems = filtered.slice(start, start + pageSize)

  renderMemberRows(pageItems, start)
  renderMemberPagination(total, start, pageItems.length, totalPages)
}

function setMemberPage(page) {
  const total = getFilteredMembers(window._membersCache).length
  const totalPages = Math.max(1, Math.ceil(total / getEffectiveMemberPageSize(total)))
  window._memberPage = Math.min(Math.max(1, page), totalPages)
  renderMemberTable()
}

function setMemberPageSize(size) {
  window._memberPageSize = size
  window._memberPage = 1
  renderMemberTable()
}

let membersRenderToken = 0

function drawMembersUI(container, members) {
  window._membersCache = members || []

  const classes = Array.from(new Set((members || []).map(m => m.class_name).filter(Boolean)))
  classes.sort((a, b) => {
    const numA = getNumericClass(a)
    const numB = getNumericClass(b)
    if (numA !== numB) return numA - numB
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  })

  container.innerHTML = `
    ${adminPageNote('fas fa-id-card', 'Data Anggota', 'Akun siswa (NIS) dan guru (NIP) untuk self-order di kasir. Terpisah dari pengguna admin/kasir.')}
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:1;min-width:200px">
        <select id="memberTypeFilter" class="products-filter-select" onchange="setMembersFilter(this.value)">
          <option value="all" ${_membersFilter === 'all' ? 'selected' : ''}>Semua tipe</option>
          <option value="siswa" ${_membersFilter === 'siswa' ? 'selected' : ''}>Siswa</option>
          <option value="guru" ${_membersFilter === 'guru' ? 'selected' : ''}>Guru</option>
        </select>
        <select id="memberClassFilter" class="products-filter-select" onchange="setMembersClassFilter(this.value)">
          <option value="all" ${_membersClassFilter === 'all' ? 'selected' : ''}>Semua kelas</option>
          ${classes.map(c => `<option value="${escapeHtml(String(c).trim())}" ${_membersClassFilter === String(c).trim() ? 'selected' : ''}>Kelas ${escapeHtml(c)}</option>`).join('')}
        </select>
        <select id="memberStatusFilter" class="products-filter-select" onchange="setMembersStatusFilter(this.value)">
          <option value="all" ${_membersStatusFilter === 'all' ? 'selected' : ''}>Semua status</option>
          <option value="active" ${_membersStatusFilter === 'active' ? 'selected' : ''}>Aktif</option>
          <option value="inactive" ${_membersStatusFilter === 'inactive' ? 'selected' : ''}>Nonaktif</option>
        </select>
        <input type="search" id="memberSearch" class="products-filter-select" style="min-width:180px;flex:1"
          placeholder="Cari nama / NIS / NIP..." value="${escapeHtml(_membersSearch)}"
          oninput="setMembersSearch(this.value)">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="exportMembersExcel()"><i class="fas fa-file-excel text-success"></i> Ekspor</button>
        <button class="btn btn-outline" onclick="importMembersExcel()"><i class="fas fa-file-import"></i> Impor</button>
        <button class="btn btn-outline" onclick="printAllFilteredMemberCards()"><i class="fas fa-id-card text-primary"></i> Kartu PDF</button>
        <button class="btn btn-primary" onclick="showMemberModal()"><i class="fas fa-plus"></i> Tambah</button>
      </div>
    </div>
    <div class="products-table-card">
      <div class="products-table-scroll">
        <table class="products-data-table">
          <thead>
            <tr>
              <th>No</th>
              <th class="col-head-product">Nama</th>
              <th>NIS / NIP</th>
              <th class="password-col">Password</th>
              <th>Tipe</th>
              <th>Kelas</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="membersTableBody">
          </tbody>
        </table>
      </div>
      <div class="products-table-footer" id="memberTableFooter"></div>
    </div>
  `

  if (!window._memberPage) window._memberPage = 1
  if (!window._memberPageSize) window._memberPageSize = 10
  renderMemberTable()
}

async function renderMembers(container) {
  const token = ++membersRenderToken

  // Instant Cache Render
  const cachedMembers = api.getCachedData('members_all')
  if (cachedMembers) {
    drawMembersUI(container, cachedMembers)
  } else {
    container.innerHTML = '<div class="empty-state" style="padding: 40px;"><div class="icon"><i class="fas fa-spinner fa-spin text-primary"></i></div><h3>Memuat data...</h3></div>'
  }

  try {
    const { data: members, error } = await api.getMembers()
    if (error) throw error
    if (token !== membersRenderToken) return

    drawMembersUI(container, members)
  } catch (err) {
    if (token !== membersRenderToken) return
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`
  }
}

function renderMemberRows(members, startIndex = 0) {
  const tbody = document.getElementById('membersTableBody')
  if (!tbody) return
  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">🪪</div><h3>Belum ada anggota</h3><p>Tambah siswa atau guru untuk login self-order</p></div></td></tr>'
    return
  }
  tbody.innerHTML = members.map((m, i) => {
    const isSiswa = m.member_type === 'siswa'
    return `
      <tr>
        <td class="col-no">${startIndex + i + 1}</td>
        <td class="col-product">
          <div class="product-cell">
            <span class="product-thumb" style="background:${isSiswa ? 'var(--primary)' : '#7c3aed'};color:#fff;border:none">${escapeHtml(m.full_name).charAt(0).toUpperCase()}</span>
            <span><strong>${escapeHtml(m.full_name)}</strong></span>
          </div>
        </td>
        <td class="col-member-no">${escapeHtml(m.member_no)}</td>
        <td class="password-col">
          <div class="password-cell-container">
            <span class="password-masked" id="mPwSpan-${m.id}">••••••••</span>
            <button class="btn btn-sm btn-outline password-toggle-btn-table" onclick="toggleTablePasswordVisibility('${escapeHtml(m.password)}', 'mPwSpan-${m.id}', this)" style="padding:4px 8px;font-size:12px" title="Tampilkan/Sembunyikan Password">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </td>
        <td><span class="badge ${isSiswa ? 'badge-info' : 'badge-warning'}">${isSiswa ? '🎓 Siswa' : '👨‍🏫 Guru'}</span></td>
        <td>${escapeHtml(m.class_name || '-')}</td>
        <td><span class="badge ${m.is_active ? 'badge-success' : 'badge-danger'}">${m.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-outline" onclick="showMemberModal(${m.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline" onclick="printSingleMemberCard(${m.id})" title="Cetak Kartu"><i class="fas fa-id-card"></i></button>
            <button class="btn btn-sm ${m.is_active ? 'btn-primary' : 'btn-success'}" onclick="toggleMemberStatus(${m.id}, ${m.is_active})" title="${m.is_active ? 'Nonaktifkan' : 'Aktifkan'}">
              <i class="fas ${m.is_active ? 'fa-ban' : 'fa-check'}"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteMember(${m.id})" title="Hapus"><i class="fas fa-trash-alt"></i></button>
          </div>
        </td>
      </tr>
    `
  }).join('')
}

function setMembersFilter(value) {
  _membersFilter = value || 'all'
  window._memberPage = 1
  renderMemberTable()
}

function setMembersSearch(value) {
  _membersSearch = value || ''
  window._memberPage = 1
  renderMemberTable()
}

function setMembersStatusFilter(value) {
  _membersStatusFilter = value || 'all'
  window._memberPage = 1
  renderMemberTable()
}

function setMembersClassFilter(value) {
  _membersClassFilter = value || 'all'
  window._memberPage = 1
  renderMemberTable()
}

async function showMemberModal(id = null) {
  const isEdit = id !== null
  let member = null
  if (isEdit) {
    const { data } = await supabaseClient.from('members').select('*').eq('id', id).single()
    member = data
    if (!member) {
      showToast('Anggota tidak ditemukan', 'error')
      return
    }
  }

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.display = 'flex'
  const type = isEdit ? member.member_type : 'siswa'
  overlay.innerHTML = `
    <div class="modal modal-lg">
      ${modalHeader(isEdit ? '✏️' : '🪪', isEdit ? 'Edit Anggota' : 'Tambah Anggota', isEdit ? 'Perbarui data siswa/guru' : 'Buat akun self-order baru', isEdit ? 'info' : 'primary')}
      <div class="modal-body">
      <form id="memberForm">
        <div class="form-group">
          <label>Tipe</label>
          <select id="mType" ${isEdit ? 'disabled' : ''}>
            <option value="siswa" ${type === 'siswa' ? 'selected' : ''}>🎓 Siswa (NIS)</option>
            <option value="guru" ${type === 'guru' ? 'selected' : ''}>👨‍🏫 Guru (NIP)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nama Lengkap</label>
          <input type="text" id="mName" value="${isEdit ? escapeHtml(member.full_name) : ''}" required>
        </div>
        <div class="form-group">
          <label id="mNoLabel">${type === 'guru' ? 'NIP' : 'NIS'}</label>
          <input type="text" id="mNo" value="${isEdit ? escapeHtml(member.member_no) : ''}" ${isEdit ? 'readonly' : ''} required>
        </div>
        <div class="form-group" id="mClassGroup" style="${type === 'guru' ? 'display:none' : ''}">
          <label>Kelas <span style="font-weight:400;color:var(--text-light)">(opsional)</span></label>
          <input type="text" id="mClass" value="${isEdit ? escapeHtml(member.class_name || '') : ''}" placeholder="Contoh: 7A, X MIPA 1">
        </div>
        <div class="form-group">
          <label>Password${isEdit ? ' <span style="font-weight:400;color:var(--text-light)">(kosongkan jika tidak diubah)</span>' : ''}</label>
          <div class="password-input-container">
            <input type="password" id="mPassword" ${isEdit ? '' : 'required'} autocomplete="new-password" placeholder="${isEdit ? 'Password baru (opsional)' : ''}">
            <button type="button" class="password-toggle-btn" onclick="togglePasswordVisibility('mPassword', this)" tabindex="-1">
              <i class="fas fa-eye"></i>
            </button>
          </div>
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

  const typeSelect = document.getElementById('mType')
  const syncTypeUi = () => {
    const t = typeSelect.value
    document.getElementById('mNoLabel').textContent = t === 'guru' ? 'NIP' : 'NIS'
    document.getElementById('mClassGroup').style.display = t === 'guru' ? 'none' : ''
  }
  typeSelect.addEventListener('change', syncTypeUi)

  document.getElementById('memberForm').onsubmit = async (e) => {
    e.preventDefault()
    const btn = overlay.querySelector('button[type="submit"]')
    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'

    const memberType = isEdit ? member.member_type : document.getElementById('mType').value
    if (isEdit) {
      const data = {
        full_name: document.getElementById('mName').value.trim(),
        class_name: memberType === 'siswa'
          ? (document.getElementById('mClass').value.trim() || null)
          : null
      }
      const newPassword = document.getElementById('mPassword').value.trim()
      if (newPassword) data.password = newPassword
      const { error } = await api.updateMember(id, data)
      if (error) {
        showToast('Gagal: ' + error.message, 'error')
        btn.disabled = false
        btn.innerHTML = 'Simpan'
        return
      }
    } else {
      const data = {
        full_name: document.getElementById('mName').value.trim(),
        member_no: document.getElementById('mNo').value.trim(),
        password: document.getElementById('mPassword').value,
        member_type: memberType,
        class_name: memberType === 'siswa'
          ? (document.getElementById('mClass').value.trim() || null)
          : null,
        is_active: true
      }
      if (!data.member_no) {
        showToast('NIS/NIP wajib diisi', 'error')
        btn.disabled = false
        btn.innerHTML = 'Tambah'
        return
      }
      const { error } = await api.addMember(data)
      if (error) {
        showToast('Gagal: ' + error.message, 'error')
        btn.disabled = false
        btn.innerHTML = 'Tambah'
        return
      }
    }
    overlay.remove()
    showToast(isEdit ? 'Anggota diperbarui' : 'Anggota ditambahkan', 'success')
    renderMembers(document.getElementById('pageContent'))
  }
}

async function toggleMemberStatus(id, currentStatus) {
  const action = currentStatus ? 'nonaktifkan' : 'aktifkan'
  const confirmText = currentStatus ? 'Nonaktifkan' : 'Aktifkan'
  const confirmIcon = currentStatus ? '🚫' : '✅'
  const confirm = await confirmDialog(`Yakin ingin ${action} anggota ini?`, { confirmText, confirmIcon })
  if (!confirm) return
  const { error } = await api.updateMember(id, { is_active: !currentStatus })
  if (error) showToast('Gagal: ' + error.message, 'error')
  else {
    showToast(`Anggota berhasil di${action}`, 'success')
    renderMembers(document.getElementById('pageContent'))
  }
}

async function deleteMember(id) {
  const confirm = await confirmDialog('Yakin ingin menghapus anggota ini secara permanen dari database?')
  if (!confirm) return
  const { error } = await api.deleteMember(id)
  if (error) showToast('Gagal: ' + error.message, 'error')
  else {
    showToast('Anggota berhasil dihapus secara permanen', 'success')
    renderMembers(document.getElementById('pageContent'))
  }
}

function exportMembersExcel() {
  const filtered = getFilteredMembers(window._membersCache)
  const headers = ['NIS / NIP', 'Nama Lengkap', 'Tipe', 'Kelas', 'Status', 'Password']
  const rows = filtered.map(m => [
    m.member_no,
    m.full_name,
    m.member_type,
    m.class_name || '',
    m.is_active ? 'Aktif' : 'Nonaktif',
    m.password || ''
  ])
  downloadExcel('daftar_anggota.xlsx', headers, rows)
}

function exportMembersPDF() {
  const filtered = getFilteredMembers(window._membersCache)
  const headers = ['Nama Lengkap', 'NIS / NIP', 'Tipe', 'Kelas', 'Status']
  const rows = filtered.map(m => [
    m.full_name,
    m.member_no,
    m.member_type === 'siswa' ? 'Siswa' : 'Guru',
    m.class_name || '-',
    m.is_active ? 'Aktif' : 'Nonaktif'
  ])
  printTableToPDF('Laporan Daftar Anggota Koperasi Sekolah', headers, rows)
}

function printMemberCards(members) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    showToast('Gagal membuka jendela cetak. Periksa pop-up blocker browser Anda.', 'error')
    return
  }

  const pagesHtml = []
  const cardsPerPage = 10
  for (let i = 0; i < members.length; i += cardsPerPage) {
    const chunk = members.slice(i, i + cardsPerPage)
    const pageContent = chunk.map(m => {
      const isSiswa = m.member_type === 'siswa'
      const roleBadge = isSiswa ? '🎓 SISWA' : '👨‍🏫 GURU'
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent('https://smandakng.github.io/koperasi_sekolah')}`

      return `
        <div class="card-container">
          <div class="card-header">
            <img src="https://iili.io/B5MMKiX.png" class="card-logo" alt="Logo">
            <div class="card-title">KOPERASI SEKOLAH</div>
          </div>
          <div class="card-body">
            <div class="card-details">
              <div class="field-label">NAMA ANGGOTA</div>
              <div class="field-value">${escapeHtml(m.full_name)}</div>
              <div class="field-label">${isSiswa ? 'NIS' : 'NIP'}</div>
              <div class="field-value">${escapeHtml(m.member_no)}</div>
              ${isSiswa ? `
                <div class="field-label">KELAS</div>
                <div class="field-value">${escapeHtml(m.class_name || '-')}</div>
              ` : ''}
            </div>
            <div class="card-qr">
              <img src="${qrUrl}" alt="QR Code">
              <span class="qr-label">${roleBadge}</span>
            </div>
          </div>
        </div>
      `
    }).join('')
    pagesHtml.push(`<div class="print-page">${pageContent}</div>`)
  }
  const cardsHtml = pagesHtml.join('')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Cetak Kartu Anggota</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');
        @page {
          size: A4;
          margin: 10mm;
        }
        body {
          font-family: 'Outfit', sans-serif;
          margin: 0;
          background: #f3f4f6;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          padding: 20px;
        }
        .print-page {
          background: white;
          width: 190mm;
          height: 277mm;
          padding: 10mm 15mm;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: repeat(2, 80mm);
          grid-template-rows: repeat(5, 48mm);
          gap: 4mm 10mm;
          justify-content: center;
          align-content: start;
          box-shadow: 0 4px 10px rgba(0,0,0,0.1);
          page-break-after: always;
        }
        .print-page:last-child {
          page-break-after: avoid;
        }
        .card-container {
          width: 80mm;
          height: 48mm;
          border-radius: 10px;
          background: #ffffff;
          border: 1.5px solid #1e3a8a;
          color: #0f172a;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }
        .card-header {
          background: #1e3a8a;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
        }
        .card-logo {
          width: 16px;
          height: 16px;
          object-fit: contain;
          background: #ffffff;
          border-radius: 50%;
          padding: 2px;
        }
        .card-title {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .card-body {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          padding: 8px 12px;
          background: #ffffff;
        }
        .card-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .field-label {
          font-size: 8px;
          color: #64748b;
          font-weight: 600;
          text-align: left;
          letter-spacing: 0.3px;
        }
        .field-value {
          font-size: 12px;
          color: #0f172a;
          font-weight: 700;
          white-space: normal;
          word-break: break-word;
          line-height: 1.2;
          text-align: left;
        }
        .card-qr {
          width: 66px;
          height: 66px;
          background: white;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid #cbd5e1;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .card-qr img {
          width: 52px;
          height: 52px;
        }
        .qr-label {
          font-size: 5px;
          color: #1e3a8a;
          font-weight: 700;
          margin-top: 2px;
        }
        @media print {
          body {
            background: none;
            margin: 0;
            padding: 0;
          }
          .print-page {
            box-shadow: none;
            padding: 10mm 15mm;
            width: 190mm;
            height: 277mm;
            page-break-after: always;
          }
          .print-page:last-child {
            page-break-after: avoid;
          }
          .card-container {
            border: 1.5px solid #1e3a8a;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      </style>
    </head>
    <body>
      ${cardsHtml}
      <script>
        function checkImages() {
          const imgs = document.getElementsByTagName('img');
          let loaded = 0;
          if (imgs.length === 0) {
            triggerPrint();
            return;
          }
          for (let i = 0; i < imgs.length; i++) {
            if (imgs[i].complete) {
              loaded++;
            } else {
              imgs[i].onload = function() {
                loaded++;
                if (loaded === imgs.length) {
                  triggerPrint();
                }
              };
              imgs[i].onerror = function() {
                loaded++;
                if (loaded === imgs.length) {
                  triggerPrint();
                }
              };
            }
          }
          if (loaded === imgs.length) {
            triggerPrint();
          }
        }
        
        function triggerPrint() {
          setTimeout(function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }, 300);
        }

        window.onload = checkImages;
      </script>
    </body>
    </html>
  `)
  printWindow.document.close()
}

function printAllFilteredMemberCards() {
  const filtered = getFilteredMembers(window._membersCache)
  if (!filtered.length) {
    showToast('Tidak ada data anggota untuk dicetak', 'error')
    return
  }
  printMemberCards(filtered)
}

function printSingleMemberCard(id) {
  const member = (window._membersCache || []).find(m => m.id === id)
  if (!member) {
    showToast('Anggota tidak ditemukan', 'error')
    return
  }
  printMemberCards([member])
}

function importMembersExcel() {
  const desc = 'Format Excel harus memiliki header kolom berikut: <strong>NIS / NIP, Nama Lengkap, Tipe, Kelas, Status, Password</strong>.<br>Tipe harus bernilai "siswa" atau "guru".'
  openExcelImportModal('Impor Anggota dari Excel', desc, async (rows) => {
    const membersToInsert = []
    for (const row of rows) {
      const rawNisNip = row['nis / nip'] !== undefined ? row['nis / nip'] : row['nis/nip']
      const fullName = row['nama lengkap']
      const password = row['password']
      const memberType = row['tipe']
      const className = row['kelas']
      const statusText = String(row['status'] || '').trim().toLowerCase()

      if (!fullName || !rawNisNip || !password || !memberType) continue

      membersToInsert.push({
        full_name: String(fullName).trim(),
        member_no: String(rawNisNip).trim(),
        password: String(password).trim(),
        member_type: String(memberType).trim().toLowerCase() === 'guru' ? 'guru' : 'siswa',
        class_name: className ? String(className).trim() : null,
        is_active: statusText === 'nonaktif' ? false : true
      })
    }

    if (membersToInsert.length === 0) {
      showToast('Tidak ada data anggota yang valid untuk diimpor', 'error')
      return
    }

    const { error } = await api.addMembersBulk(membersToInsert)
    if (error) {
      showToast(`Gagal mengimpor anggota: ${error.message}`, 'error')
    } else {
      showToast(`Berhasil mengimpor ${membersToInsert.length} anggota sekaligus!`, 'success')
      renderMembers(document.getElementById('pageContent'))
    }
  })
}

window.renderMembers = renderMembers
window.showMemberModal = showMemberModal
window.toggleMemberStatus = toggleMemberStatus
window.deleteMember = deleteMember
window.setMembersFilter = setMembersFilter
window.setMembersSearch = setMembersSearch
window.setMembersStatusFilter = setMembersStatusFilter
window.setMembersClassFilter = setMembersClassFilter
window.exportMembersExcel = exportMembersExcel
window.exportMembersPDF = exportMembersPDF
window.importMembersExcel = importMembersExcel
window.setMemberPage = setMemberPage
window.setMemberPageSize = setMemberPageSize
window.printAllFilteredMemberCards = printAllFilteredMemberCards
window.printSingleMemberCard = printSingleMemberCard
