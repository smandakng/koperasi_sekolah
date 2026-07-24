const Auth = {
  currentUser: null,
  SESSION_KEY: 'waroeng_user',
  LEGACY_SESSION_KEY: 'kantin_user',

  init() {
    let stored = localStorage.getItem(this.SESSION_KEY)
    if (!stored) {
      stored = localStorage.getItem(this.LEGACY_SESSION_KEY)
      if (stored) {
        localStorage.setItem(this.SESSION_KEY, stored)
        localStorage.removeItem(this.LEGACY_SESSION_KEY)
      }
    }

    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object') {
        if ('password' in parsed) delete parsed.password
        this.currentUser = parsed
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(parsed))
      } else {
        localStorage.removeItem(this.SESSION_KEY)
        localStorage.removeItem(this.LEGACY_SESSION_KEY)
      }
    } catch {
      localStorage.removeItem(this.SESSION_KEY)
      localStorage.removeItem(this.LEGACY_SESSION_KEY)
      this.currentUser = null
    }
  },

  isLoggedIn() {
    const user = this.currentUser
    return !!(user && user.id && user.username && user.role)
  },

  getRole() {
    return this.currentUser?.role || null
  },

  getUsername() {
    return this.currentUser?.username || ''
  },

  getFullName() {
    return this.currentUser?.full_name || ''
  },

  getUserId() {
    return this.currentUser?.id || null
  },

  getSource() {
    return this.currentUser?.source || 'user'
  },

  isAdmin() {
    return this.getRole() === 'admin'
  },

  isStaff() {
    const role = this.getRole()
    return role === 'admin' || role === 'kasir'
  },

  isSelfOrder() {
    return this.getSource() === 'member' || this.getRole() === 'siswa' || this.getRole() === 'guru'
  },

  getBuyerRef() {
    if (!this.isSelfOrder()) return null
    return this.currentUser?.username || null
  },

  getCashierDisplayName() {
    if (!this.isSelfOrder()) return this.getFullName()
    const role = this.getRole() === 'guru' ? 'Guru' : 'Siswa'
    const no = this.getUsername()
    const name = this.getFullName()
    return `${role}: ${name} (${no})`
  },

  _setSession(sessionUser) {
    delete sessionUser.password
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser))
    localStorage.removeItem(this.LEGACY_SESSION_KEY)
    this.currentUser = sessionUser
  },

  async login(username, password) {
    const u = String(username || '').trim()
    const p = String(password || '')

    const { data: staff, error: staffErr } = await api.login(u, p)
    if (!staffErr && staff) {
      if (!staff.is_active) {
        return { success: false, message: 'Akun telah dinonaktifkan' }
      }
      const sessionUser = { ...staff, source: 'user' }
      this._setSession(sessionUser)
      return { success: true, role: staff.role, user: this.currentUser }
    }

    const { data: member, error: memberErr } = await api.loginMember(u, p)
    if (!memberErr && member) {
      if (!member.is_active) {
        return { success: false, message: 'Akun telah dinonaktifkan' }
      }
      const sessionUser = {
        id: member.id,
        username: member.member_no,
        full_name: member.full_name,
        role: member.member_type,
        member_type: member.member_type,
        class_name: member.class_name || null,
        is_active: member.is_active,
        source: 'member'
      }
      this._setSession(sessionUser)
      return { success: true, role: member.member_type, user: this.currentUser }
    }

    return { success: false, message: 'NIS/NIP/Username atau password salah' }
  },

  logout() {
    localStorage.removeItem(this.SESSION_KEY)
    localStorage.removeItem(this.LEGACY_SESSION_KEY)
    this.currentUser = null
    window.location.href = 'index.html'
  },

  redirectToDashboard() {
    if (!this.isLoggedIn()) {
      window.location.href = 'index.html'
      return
    }
    if (this.isAdmin()) {
      window.location.href = 'admin.html'
    } else {
      window.location.href = 'kasir.html'
    }
  },

  guard(page) {
    this.init()
    if (!this.isLoggedIn()) {
      localStorage.removeItem(this.SESSION_KEY)
      localStorage.removeItem(this.LEGACY_SESSION_KEY)
      this.currentUser = null
      window.location.href = 'index.html'
      return { ok: false, autoRedirect: true }
    }
    if (page === 'admin' && !this.isAdmin()) {
      return {
        ok: false,
        emoji: '🚫',
        title: 'Akses Admin Ditolak',
        message: 'Akun Anda tidak memiliki izin untuk membuka halaman Admin. Hanya pengguna dengan role Admin yang dapat mengakses area ini.',
        redirect: 'kasir.html',
        buttonLabel: '🛒 Ke Halaman Kasir',
        autoRedirect: false
      }
    }
    if (page === 'kasir') {
      const role = this.getRole()
      if (!['kasir', 'admin', 'siswa', 'guru'].includes(role)) {
        return {
          ok: false,
          emoji: '🚫',
          title: 'Akses Ditolak',
          message: 'Akun Anda tidak memiliki izin untuk membuka halaman Kasir.',
          redirect: 'index.html',
          buttonLabel: '🔑 Ke Halaman Login',
          autoRedirect: false
        }
      }
    }
    return { ok: true }
  },

  /** Cek akses halaman; tampilkan modal error dan hentikan jika gagal */
  requirePage(page) {
    const result = this.guard(page)
    if (result.ok) return true
    if (!result.autoRedirect) {
      showAuthErrorModal(result)
    }
    return false
  },

  async changePassword(oldPassword, newPassword) {
    if (!this.currentUser) return { success: false, message: 'Not logged in' }

    if (this.isSelfOrder()) {
      const { data, error } = await supabaseClient
        .from('members')
        .select('id')
        .eq('id', this.currentUser.id)
        .eq('password', oldPassword)
        .single()
      if (error || !data) {
        return { success: false, message: 'Password lama salah' }
      }
      const { error: updateError } = await supabaseClient
        .from('members')
        .update({ password: newPassword })
        .eq('id', this.currentUser.id)
      if (updateError) return { success: false, message: updateError.message }
      return { success: true }
    }

    const { data, error } = await supabaseClient
      .from('users')
      .select('id')
      .eq('id', this.currentUser.id)
      .eq('password', oldPassword)
      .single()
    if (error || !data) {
      return { success: false, message: 'Password lama salah' }
    }
    const { error: updateError } = await supabaseClient
      .from('users')
      .update({ password: newPassword })
      .eq('id', this.currentUser.id)
    if (updateError) return { success: false, message: updateError.message }
    return { success: true }
  }
}
