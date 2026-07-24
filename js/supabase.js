const DEFAULT_SUPABASE_URL = 'https://qlvdrlbkqgjhfztmekck.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsdmRybGJrcWdqaGZ6dG1la2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDkzNDMsImV4cCI6MjEwMDM4NTM0M30.E91l42kR2APvZSads2sgXIgr4L3SqWagAIdALdSFriw'
const DB_CONFIG_KEY = 'waroeng_db_config'
const SETTING_URL = 'supabase_url'
const SETTING_KEY = 'supabase_anon_key'

function getStoredDbConfig() {
  try {
    const raw = localStorage.getItem(DB_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.url && parsed.anonKey) return parsed
  } catch (_) { /* ignore */ }
  return null
}

function cacheDbConfigLocally(url, anonKey, meta = {}) {
  localStorage.setItem(DB_CONFIG_KEY, JSON.stringify({
    url: String(url || '').trim(),
    anonKey: String(anonKey || '').trim(),
    isCustom: meta.isCustom !== false,
    source: meta.source || 'cache',
    savedAt: new Date().toISOString()
  }))
}

function getActiveDbConfig() {
  const stored = getStoredDbConfig()
  const url = (stored?.url || DEFAULT_SUPABASE_URL).trim()
  const anonKey = (stored?.anonKey || DEFAULT_SUPABASE_ANON_KEY).trim()
  const isDefault = url === DEFAULT_SUPABASE_URL && anonKey === DEFAULT_SUPABASE_ANON_KEY
  return {
    url,
    anonKey,
    isCustom: !isDefault,
    source: stored?.source || (stored ? 'cache' : 'default'),
    defaultUrl: DEFAULT_SUPABASE_URL,
    defaultAnonKey: DEFAULT_SUPABASE_ANON_KEY
  }
}

function rowsToSettingsMap(rows) {
  const map = {}
  ;(rows || []).forEach(r => { map[r.key] = r.value })
  return map
}
const { createClient } = supabase
let SUPABASE_URL = getActiveDbConfig().url
let SUPABASE_ANON_KEY = getActiveDbConfig().anonKey
let supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const PRODUCT_PHOTO_BUCKET = 'product-photos'
const CACHE_MS = 60000
const _cache = {
  categories: null,
  products: null,
  users: null,
  members: null,
  transactions: null,
  daily_sales: null,
  best_selling: null,
  items_sold_today: null,
  incomes: null,
  expenses: null
}

function applyDbConfig(url, anonKey) {
  SUPABASE_URL = String(url || '').trim()
  SUPABASE_ANON_KEY = String(anonKey || '').trim()
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  invalidateCache(
    'categories',
    'products',
    'users',
    'members',
    'transactions',
    'daily_sales',
    'best_selling',
    'items_sold_today',
    'incomes',
    'expenses'
  )
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }
}

function invalidateCache(...keys) {
  keys.forEach(key => {
    Object.keys(_cache).forEach(k => {
      if (k === key || k.startsWith(key + '_')) {
        _cache[k] = null
      }
    })
  })
}

async function withCache(key, fetcher, ttl = CACHE_MS) {
  const entry = _cache[key]
  if (entry && Date.now() - entry.at < ttl) {
    return { data: entry.data, error: null }
  }
  const result = await fetcher()
  if (result.data && !result.error) {
    _cache[key] = { data: result.data, at: Date.now() }
  }
  return result
}

const api = {
  getCachedData(key, ttl = CACHE_MS) {
    const entry = _cache[key]
    if (entry && Date.now() - entry.at < ttl) {
      return entry.data
    }
    return null
  },
  // ---- AUTH ----
  async login(username, password) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single()
    return { data, error }
  },

  // ---- CATEGORIES ----
  async getCategories({ fresh = false } = {}) {
    if (fresh) invalidateCache('categories')
    return withCache('categories', async () => {
      const { data, error } = await supabaseClient
        .from('categories')
        .select('*')
        .order('name', { ascending: true })
      return { data, error }
    })
  },
  async addCategory(nameOrPayload) {
    invalidateCache('categories', 'products')
    const name = typeof nameOrPayload === 'string' ? nameOrPayload : nameOrPayload.name
    return await supabaseClient.from('categories').insert({ name }).select().single()
  },
  async updateCategory(id, updates) {
    invalidateCache('categories', 'products')
    const safe = { ...updates }
    delete safe.icon
    delete safe.icon_id
    delete safe.sort_order
    return await supabaseClient.from('categories').update(safe).eq('id', id).select().single()
  },
  async deleteCategory(id) {
    invalidateCache('categories', 'products')
    return await supabaseClient.from('categories').delete().eq('id', id)
  },

  // ---- PRODUCTS ----
  getProductPhotoUrl(photoId, { bust } = {}) {
    if (!photoId) return null
    const { data } = supabaseClient.storage
      .from(PRODUCT_PHOTO_BUCKET)
      .getPublicUrl(`${photoId}.jpg`)
    const url = data?.publicUrl || null
    if (!url) return null
    // photo_id is the cache key; optional bust helps after in-place replace
    if (bust != null && bust !== '') {
      const sep = url.includes('?') ? '&' : '?'
      return `${url}${sep}v=${encodeURIComponent(bust)}`
    }
    return url
  },
  async getProducts({ fresh = false } = {}) {
    if (fresh) invalidateCache('products')
    return withCache('products', async () => {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*, categories(name)')
        .order('name', { ascending: true })
      return { data, error }
    })
  },
  async uploadProductPhoto(photoId, blob) {
    const path = `${photoId}.jpg`
    return await supabaseClient.storage
      .from(PRODUCT_PHOTO_BUCKET)
      .upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
        cacheControl: '60'
      })
  },
  async deleteProductPhoto(photoId) {
    if (!photoId) return { error: null }
    return await supabaseClient.storage
      .from(PRODUCT_PHOTO_BUCKET)
      .remove([`${photoId}.jpg`])
  },
  async addProduct(product) {
    invalidateCache('products')
    return await supabaseClient.from('products').insert(product).select().single()
  },
  async addProductsBulk(products) {
    invalidateCache('products')
    return await supabaseClient.from('products').insert(products)
  },
  async updateProduct(id, updates) {
    invalidateCache('products')
    return await supabaseClient.from('products').update(updates).eq('id', id).select().single()
  },
  async deleteProduct(id) {
    invalidateCache('products')
    return await supabaseClient.from('products').delete().eq('id', id)
  },

  // ---- TRANSACTIONS ----
  async getTransactions(limit = 50, { fresh = false } = {}) {
    if (fresh) invalidateCache('transactions')
    return withCache('transactions', async () => {
      const { data, error } = await supabaseClient
        .from('transactions')
        .select('*, transaction_items(*)')
        .order('created_at', { ascending: false })
        .limit(limit)
      return { data, error }
    }, 15000)
  },
  async getTransactionById(id) {
    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('id', id)
      .single()
    return { data, error }
  },
  async addTransaction(transaction) {
    invalidateCache('transactions', 'daily_sales', 'best_selling', 'items_sold_today')
    return await supabaseClient.from('transactions').insert(transaction).select().single()
  },
  async addTransactionItems(items) {
    return await supabaseClient.from('transaction_items').insert(items).select()
  },

  async deleteTransaction(id) {
    invalidateCache('transactions', 'daily_sales', 'best_selling', 'items_sold_today')
    return await supabaseClient.from('transactions').delete().eq('id', id)
  },

  /** Proses penjualan atomik via RPC; fallback ke metode berurutan jika RPC belum ada */
  async processSale(transaction, items) {
    const itemPayload = items.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal
    }))

    const basePayload = {
      p_total_amount: transaction.total_amount,
      p_payment_method: transaction.payment_method,
      p_cashier_name: transaction.cashier_name,
      p_cashier_id: transaction.cashier_id,
      p_transaction_number: transaction.transaction_number,
      p_items: itemPayload
    }

    let result = await supabaseClient.rpc('process_sale', {
      ...basePayload,
      p_buyer_ref: transaction.buyer_ref || null
    })

    // RPC lama tanpa p_buyer_ref
    if (result.error && (
      result.error.code === 'PGRST202'
      || /buyer_ref|Could not find the function|function.*process_sale/i.test(result.error.message || '')
    )) {
      result = await supabaseClient.rpc('process_sale', basePayload)
      if (!result.error && transaction.buyer_ref && (result.data?.id ?? result.data)) {
        const txId = result.data?.id ?? result.data
        await supabaseClient.from('transactions').update({ buyer_ref: transaction.buyer_ref }).eq('id', txId)
      }
    }

    if (!result.error) {
      invalidateCache('products', 'transactions', 'daily_sales', 'best_selling', 'items_sold_today')
      const txId = result.data?.id ?? result.data
      const { data: savedTx } = await this.getTransactionById(txId)
      return {
        data: savedTx || { ...transaction, id: txId, created_at: nowISO() },
        error: null
      }
    }

    const missingRpc = result.error.code === 'PGRST202'
      || /function.*process_sale/i.test(result.error.message || '')
      || /Could not find the function/i.test(result.error.message || '')

    if (missingRpc) {
      return this.processSaleLegacy(transaction, items)
    }

    return { data: null, error: result.error }
  },

  async processSaleLegacy(transaction, items) {
    let txId = null
    const deducted = []
    try {
      for (const item of items) {
        const { data: product, error: fetchErr } = await supabaseClient
          .from('products')
          .select('stock, is_available')
          .eq('id', item.product_id)
          .single()
        if (fetchErr) throw fetchErr
        if (product?.is_available === false) {
          throw new Error(`${item.product_name} tidak tersedia`)
        }
        const currentStock = Number(product?.stock ?? 0)
        if (currentStock < item.quantity) {
          throw new Error(`Stok tidak cukup untuk ${item.product_name}`)
        }
      }

      const { data: tx, error: txError } = await this.addTransaction(transaction)
      if (txError) throw txError
      txId = tx.id

      const rows = items.map(item => ({ ...item, transaction_id: tx.id }))
      const { error: itemsError } = await this.addTransactionItems(rows)
      if (itemsError) throw itemsError

      for (const item of items) {
        const { data: product, error: fetchErr } = await supabaseClient
          .from('products')
          .select('stock, is_available')
          .eq('id', item.product_id)
          .single()
        if (fetchErr) throw fetchErr
        if (product?.is_available === false) {
          throw new Error(`${item.product_name} tidak tersedia`)
        }
        const currentStock = Number(product?.stock ?? 0)
        if (currentStock < item.quantity) {
          throw new Error(`Stok tidak cukup untuk ${item.product_name}`)
        }
        const newStock = currentStock - item.quantity
        const { data: updated, error: stockErr } = await supabaseClient
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.product_id)
          .gte('stock', item.quantity)
          .select('id')
        if (stockErr || !updated?.length) {
          throw new Error(`Stok tidak cukup untuk ${item.product_name}`)
        }
        deducted.push({ product_id: item.product_id, quantity: item.quantity })
      }

      invalidateCache('products', 'transactions', 'daily_sales', 'best_selling', 'items_sold_today')
      return { data: tx, error: null }
    } catch (err) {
      for (const d of deducted) {
        try {
          const { data: product } = await supabaseClient
            .from('products')
            .select('stock')
            .eq('id', d.product_id)
            .single()
          if (product) {
            await supabaseClient
              .from('products')
              .update({ stock: Number(product.stock ?? 0) + d.quantity })
              .eq('id', d.product_id)
          }
        } catch (_) { /* best-effort rollback */ }
      }
      if (deducted.length) invalidateCache('products', 'transactions', 'daily_sales', 'best_selling', 'items_sold_today')
      if (txId) await this.deleteTransaction(txId)
      return { data: null, error: err }
    }
  },

  // ---- REPORTS ----
  async getTransactionsByDateRange(startDate, endDate, { withItems = true } = {}) {
    const plainDate = /^\d{4}-\d{2}-\d{2}$/
    const start = plainDate.test(startDate) ? jakartaDayRangeISO(startDate).start : startDate
    const end = plainDate.test(endDate) ? jakartaDayRangeISO(endDate).end : endDate
    const select = withItems
      ? '*, transaction_items(*)'
      : 'id, total_amount, created_at'
    const { data, error } = await supabaseClient
      .from('transactions')
      .select(select)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
    return { data, error }
  },

  async getDailySalesSummary(startDate, endDate) {
    const key = `daily_sales_${startDate}_${endDate}`
    return withCache(key, async () => {
      const { data, error } = await supabaseClient
        .from('view_daily_sales')
        .select('*')
        .gte('date_local', startDate)
        .lte('date_local', endDate)
        .order('date_local', { ascending: true })
      return { data, error }
    }, 15000)
  },

  async getDailyIncomesSummary(startDate, endDate) {
    const { data, error } = await supabaseClient
      .from('view_daily_incomes')
      .select('*')
      .gte('date_local', startDate)
      .lte('date_local', endDate)
      .order('date_local', { ascending: true })
    return { data, error }
  },

  async getDailyExpensesSummary(startDate, endDate) {
    const { data, error } = await supabaseClient
      .from('view_daily_expenses')
      .select('*')
      .gte('date_local', startDate)
      .lte('date_local', endDate)
      .order('date_local', { ascending: true })
    return { data, error }
  },

  async getBestSellingProduct7Days() {
    return withCache('best_selling', async () => {
      const { data, error } = await supabaseClient
        .from('view_product_sales_7days')
        .select('product_name')
        .limit(1)
        .maybeSingle()
      return { data, error }
    }, 15000)
  },

  async getItemsSoldToday() {
    return withCache('items_sold_today', async () => {
      const { data, error } = await supabaseClient
        .from('view_items_sold_today')
        .select('total_qty')
        .maybeSingle()
      return { data, error }
    }, 15000)
  },

  // ---- USERS ----
  async getUsers({ fresh = false } = {}) {
    if (fresh) invalidateCache('users')
    return withCache('users', async () => {
      const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .order('full_name', { ascending: true })
      return { data, error }
    }, 60000)
  },
  async addUser(user) {
    invalidateCache('users')
    return await supabaseClient.from('users').insert(user).select().single()
  },
  async updateUser(id, updates) {
    invalidateCache('users')
    return await supabaseClient.from('users').update(updates).eq('id', id).select().single()
  },
  async deleteUser(id) {
    invalidateCache('users')
    return await supabaseClient.from('users').delete().eq('id', id)
  },

  /** Nomor WA kasir aktif untuk konfirmasi pesanan self-order */
  async getCashierWhatsApp() {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, full_name, whatsapp, role')
      .eq('is_active', true)
      .eq('role', 'kasir')
      .not('whatsapp', 'is', null)
      .order('full_name', { ascending: true })
    if (error) return { data: null, error }
    const withWa = (data || []).find(u => String(u.whatsapp || '').trim())
    if (withWa) return { data: withWa, error: null }

    // Fallback: admin yang punya WA
    const { data: admins, error: adminErr } = await supabaseClient
      .from('users')
      .select('id, full_name, whatsapp, role')
      .eq('is_active', true)
      .eq('role', 'admin')
      .not('whatsapp', 'is', null)
      .order('full_name', { ascending: true })
    if (adminErr) return { data: null, error: adminErr }
    const adminWa = (admins || []).find(u => String(u.whatsapp || '').trim())
    return { data: adminWa || null, error: null }
  },

  // ---- MEMBERS (siswa / guru) ----
  async loginMember(memberNo, password) {
    const no = String(memberNo || '').trim()
    if (!no) return { data: null, error: { message: 'NIS/NIP kosong' } }
    const { data, error } = await supabaseClient
      .from('members')
      .select('*')
      .eq('member_no', no)
      .eq('password', password)
      .eq('is_active', true)
      .limit(2)
    if (error) return { data: null, error }
    if (!data || data.length === 0) {
      return { data: null, error: { message: 'NIS/NIP atau password salah' } }
    }
    if (data.length > 1) {
      // Ambiguous across types — prefer exact single match by trying siswa then guru order
      const siswa = data.find(m => m.member_type === 'siswa')
      return { data: siswa || data[0], error: null }
    }
    return { data: data[0], error: null }
  },
  async getMembers({ memberType = null, fresh = false } = {}) {
    if (fresh) invalidateCache('members')
    const key = `members_${memberType || 'all'}`
    return withCache(key, async () => {
      let q = supabaseClient
        .from('members')
        .select('*')
        .order('full_name', { ascending: true })
      if (memberType) q = q.eq('member_type', memberType)
      const { data, error } = await q
      return { data, error }
    }, 60000)
  },
  async addMember(member) {
    invalidateCache('members')
    return await supabaseClient.from('members').insert(member).select().single()
  },
  async addMembersBulk(members) {
    invalidateCache('members')
    return await supabaseClient.from('members').insert(members)
  },
  async updateMember(id, updates) {
    invalidateCache('members')
    return await supabaseClient.from('members').update(updates).eq('id', id).select().single()
  },
  async deleteMember(id) {
    invalidateCache('members')
    return await supabaseClient.from('members').delete().eq('id', id)
  },
  async getTransactionsByBuyerRef(buyerRef, startDate, endDate) {
    const plainDate = /^\d{4}-\d{2}-\d{2}$/
    const start = plainDate.test(startDate) ? jakartaDayRangeISO(startDate).start : startDate
    const end = plainDate.test(endDate) ? jakartaDayRangeISO(endDate).end : endDate
    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('buyer_ref', buyerRef)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
    return { data, error }
  },

  // ---- SETTINGS / MAINTENANCE ----
  async getDatabaseSize() {
    try {
      const { data, error } = await supabaseClient.rpc('get_database_size')
      if (!error && data !== null) {
        return { data: Number(data), error: null }
      }
    } catch (_) {}

    try {
      const tables = ['categories', 'products', 'users', 'members', 'transactions', 'transaction_items', 'app_settings']
      let totalEstimatedBytes = 0
      const rowSizeEstimates = {
        categories: 150,
        products: 350,
        users: 250,
        members: 250,
        transactions: 200,
        transaction_items: 200,
        app_settings: 500
      }
      for (const table of tables) {
        const { count, error } = await supabaseClient
          .from(table)
          .select('*', { count: 'exact', head: true })
        if (!error && count !== null) {
          totalEstimatedBytes += count * (rowSizeEstimates[table] || 200)
        }
      }
      totalEstimatedBytes += 500 * 1024
      return { data: totalEstimatedBytes, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  getDbConfig() {
    return getActiveDbConfig()
  },

  /** Muat konfigurasi dari tabel app_settings (bootstrap lewat default/cache lokal) */
  async loadDbConfigFromDatabase() {
    const cfg = getActiveDbConfig()
    const client = createClient(cfg.url, cfg.anonKey)
    let data = null
    let error = null

    try {
      const res = await client
        .from('app_settings')
        .select('key, value')
        .in('key', [SETTING_URL, SETTING_KEY])
      data = res.data
      error = res.error
    } catch (e) {
      error = e
    }

    if (error) {
      // Coba default database sebagai fallback jika target saat ini gagal
      if (cfg.url !== DEFAULT_SUPABASE_URL) {
        try {
          const fallbackClient = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY)
          const { data: fbData, error: fbErr } = await fallbackClient
            .from('app_settings')
            .select('key, value')
            .in('key', [SETTING_URL, SETTING_KEY])
          if (!fbErr && fbData && fbData.length > 0) {
            const map = rowsToSettingsMap(fbData)
            const url = (map[SETTING_URL] || DEFAULT_SUPABASE_URL).trim()
            const anonKey = (map[SETTING_KEY] || DEFAULT_SUPABASE_ANON_KEY).trim()
            const isDefault = url === DEFAULT_SUPABASE_URL && anonKey === DEFAULT_SUPABASE_ANON_KEY
            applyDbConfig(url, anonKey)
            cacheDbConfigLocally(url, anonKey, { isCustom: !isDefault, source: 'database' })
            return { data: getActiveDbConfig(), error: null }
          }
        } catch (_) {}
      }
      return { data: getActiveDbConfig(), error }
    }

    const map = rowsToSettingsMap(data)
    const url = (map[SETTING_URL] || cfg.url).trim()
    const anonKey = (map[SETTING_KEY] || cfg.anonKey).trim()
    const isDefault = url === DEFAULT_SUPABASE_URL && anonKey === DEFAULT_SUPABASE_ANON_KEY

    applyDbConfig(url, anonKey)
    cacheDbConfigLocally(url, anonKey, {
      isCustom: !isDefault,
      source: 'database'
    })

    return {
      data: getActiveDbConfig(),
      error: null
    }
  },
  async exportBackup() {
    const tables = [
      'categories',
      'products',
      'users',
      'members',
      'transactions',
      'transaction_items',
      'app_settings'
    ]
    const payload = {
      app: 'Koperasi Sekolah',
      version: 1,
      exported_at: new Date().toISOString(),
      supabase_url: SUPABASE_URL,
      tables: {}
    }
    for (const table of tables) {
      const { data, error } = await supabaseClient.from(table).select('*')
      if (error) {
        if (table === 'app_settings' || table === 'incomes' || table === 'expenses') {
          payload.tables[table] = []
          continue
        }
        return { data: null, error: { message: `${table}: ${error.message}` } }
      }
      payload.tables[table] = data || []
    }
    return { data: payload, error: null }
  },

  async importBackup(payload) {
    if (!payload || (payload.app !== 'Waroeng Sekolah' && payload.app !== 'Koperasi Sekolah') || !payload.tables) {
      return { data: null, error: { message: 'Format file backup tidak valid' } }
    }
    const order = [
      'app_settings',
      'categories',
      'products',
      'users',
      'members',
      'incomes',
      'expenses',
      'transactions',
      'transaction_items'
    ]
    const results = {}
    for (const table of order) {
      const rows = payload.tables[table]
      if (!rows || rows.length === 0) continue
      const options = table === 'app_settings' ? { onConflict: 'key' } : { onConflict: 'id' }
      const { error } = await supabaseClient.from(table).upsert(rows, options)
      if (error) {
        return { data: null, error: { message: `Gagal impor tabel ${table}: ${error.message}` } }
      }
      results[table] = rows.length

      // Sync sequence if it's a table with serial id
      if (['categories', 'products', 'users', 'members', 'incomes', 'expenses', 'transactions', 'transaction_items'].includes(table)) {
        try {
          await supabaseClient.rpc('reset_table_sequence', { p_table: table })
        } catch (seqErr) {
          console.warn(`Gagal sinkronisasi sequence untuk tabel ${table}:`, seqErr)
        }
      }
    }
    invalidateCache('products', 'categories')
    return { data: results, error: null }
  },

  async purgeTable(table) {
    const allowed = {
      transaction_items: true,
      transactions: true,
      products: true,
      categories: true,
      members: true,
      incomes: true,
      expenses: true
    }
    if (!allowed[table]) {
      return { data: null, error: { message: 'Tabel tidak diizinkan dihapus' } }
    }
    const { error } = await supabaseClient.from(table).delete().not('id', 'is', null)
    if (error) return { data: null, error }

    // Reset sequence/auto-increment kembali ke awal (1)
    try {
      await supabaseClient.rpc('reset_table_sequence', { p_table: table })
      if (table === 'transactions') {
        await supabaseClient.rpc('reset_table_sequence', { p_table: 'transaction_items' })
      }
    } catch (e) {
      console.warn('Failed to reset sequence:', e)
    }

    if (table === 'products' || table === 'categories') {
      invalidateCache('products', 'categories')
    }
    return { data: { table }, error: null }
  },

  async purgeData(scope) {
    const orderByScope = {
      transactions: ['transaction_items', 'transactions'],
      catalog: ['products', 'categories'],
      members: ['members'],
      all_except_users: ['transaction_items', 'transactions', 'products', 'categories', 'members', 'incomes', 'expenses']
    }
    const tables = orderByScope[scope]
    if (!tables) {
      return { data: null, error: { message: 'Scope hapus data tidak valid' } }
    }
    const cleared = []
    for (const table of tables) {
      const { error } = await this.purgeTable(table)
      if (error) {
        return {
          data: { cleared },
          error: { message: `Gagal hapus ${table}: ${error.message}` }
        }
      }
      cleared.push(table)
    }
    invalidateCache('products', 'categories')
    return { data: { cleared, scope }, error: null }
  },

  // ---- INCOMES ----
  async getIncomes(limit = 100, { fresh = false } = {}) {
    if (fresh) invalidateCache('incomes')
    return withCache('incomes', async () => {
      const { data, error } = await supabaseClient
        .from('incomes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      return { data, error }
    }, 30000)
  },
  async getIncomesByDateRange(start, end) {
    const { data, error } = await supabaseClient
      .from('incomes')
      .select('*')
      .gte('created_at', start + 'T00:00:00Z')
      .lte('created_at', end + 'T23:59:59Z')
      .order('created_at', { ascending: true })
    return { data, error }
  },
  async addIncome(income) {
    invalidateCache('incomes')
    return await supabaseClient.from('incomes').insert(income).select().single()
  },
  async deleteIncome(id) {
    invalidateCache('incomes')
    return await supabaseClient.from('incomes').delete().eq('id', id)
  },

  // ---- EXPENSES ----
  async getExpenses(limit = 100, { fresh = false } = {}) {
    if (fresh) invalidateCache('expenses')
    return withCache('expenses', async () => {
      const { data, error } = await supabaseClient
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      return { data, error }
    }, 30000)
  },
  async getExpensesByDateRange(start, end) {
    const { data, error } = await supabaseClient
      .from('expenses')
      .select('*')
      .gte('created_at', start + 'T00:00:00Z')
      .lte('created_at', end + 'T23:59:59Z')
      .order('created_at', { ascending: true })
    return { data, error }
  },
  async addExpense(expense) {
    invalidateCache('expenses')
    return await supabaseClient.from('expenses').insert(expense).select().single()
  },
  async deleteExpense(id) {
    invalidateCache('expenses')
    return await supabaseClient.from('expenses').delete().eq('id', id)
  }
}
