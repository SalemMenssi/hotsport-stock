(function () {
  const content = document.getElementById('content');
  const nav = document.getElementById('nav');
  const toast = document.getElementById('toast');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('backdrop');
  const menuToggle = document.getElementById('menuToggle');
  const appModal = document.getElementById('appModal');
  const modalBody = document.getElementById('modalBody');
  const modalFoot = document.getElementById('modalFoot');
  const adjustModal = document.getElementById('adjustModal');

  const { t, getLang, setLang, applyDocument, statusLabel } = window.HS_I18N;

  let modules = [];
  let current = 'dashboard';
  let currentUser = null;
  let permissions = { approveHr: false, settings: false, createProducts: false, manageUsers: false, manageCaisses: false, manageSponsors: false, managePurchases: false, crud: {} };
  let cache = { products: [], customers: [], orders: [], employees: [], caisses: [], sponsors: [], users: [], sessions: [], purchases: [], suppliers: [] };
  let selectedCaisseId = localStorage.getItem('hs_caisse_id') || '';
  let sponsorFilter = 'all';
  let userRoleFilter = 'all';
  let stockFilter = 'all';
  let stockSearch = '';
  let stockCategory = 'all';
  let orderFilter = 'all';
  let orderSearch = '';
  let itemsCategory = 'all';
  let calendarMonth = new Date().toISOString().slice(0, 7);
  let lastReceipt = null;
  let posCart = [];
  let posCustomerId = '';
  let posPay = 'cash';
  let html5Qr = null;
  let lastScanCode = '';
  let lastScanAt = 0;
  let scanTimer = null;
  let scanStream = null;
  let cameraGranted = false;
  let pendingScan = null;
  let lastNoticeAt = localStorage.getItem('hs_notice_since') || new Date(Date.now() - 60000).toISOString();

  const GROUP_KEYS = ['main', 'sales', 'inventory', 'finance', 'hr', 'system'];
  const MODULE_LABEL = {
    dashboard: 'dashboard', orders: 'orders', pos: 'pos', caisse: 'caisse', invoices: 'invoices',
    customers: 'customers', sponsors: 'sponsors', stock: 'stock', items: 'items', purchases: 'purchases',
    suppliers: 'suppliers', returns: 'returns', banks: 'banks', accounts: 'accounts',
    reports: 'reports', hrm: 'hrm', requests: 'requests', calendar: 'calendar', users: 'users', settings: 'settings'
  };

  function money(n) { return `${Number(n || 0).toFixed(3)} TND`; }
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2500);
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    if (res.status === 401) { location.href = '/login.html'; return null; }
    return res.json();
  }

  function openModal(title, bodyHtml, footHtml = '', wide = false) {
    document.getElementById('modalTitle').textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFoot.innerHTML = footHtml;
    document.getElementById('modalPanel').classList.toggle('wide', !!wide);
    appModal.hidden = false;
    icons();
  }
  function closeModal() {
    const stopping = stopCheckoutScan();
    appModal.hidden = true;
    return stopping;
  }

  function statusTag(status) {
    return `<span class="tag ${esc(status)}">${esc(statusLabel(status))}</span>`;
  }

  function dataTable(headers, rowsHtml) {
    return `<div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="12" class="empty">${esc(t('noData'))}</td></tr>`}</tbody>
    </table></div></div>`;
  }

  function icons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function icon(name, cls = '') {
    return `<i data-lucide="${name}" class="${cls}"></i>`;
  }

  function productThumb(p, cls = 'product-thumb') {
    if (p?.imageUrl) {
      return `<img class="${cls}" src="${esc(p.imageUrl)}" alt="${esc(p.name || '')}" loading="lazy" referrerpolicy="no-referrer" />`;
    }
    return `<span class="${cls} emoji">${esc(p?.imageEmoji || '📦')}</span>`;
  }

  function applyChrome() {
    const lang = getLang();
    applyDocument(lang);
    document.querySelectorAll('.lang-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    const brandSub = document.getElementById('brandSub');
    if (brandSub) brandSub.textContent = t('brandSub');
    document.getElementById('pageEyebrow').textContent = t('eyebrow');
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('#adjustReason option[data-i18n]').forEach((opt) => {
      opt.textContent = t(opt.getAttribute('data-i18n'));
    });
    document.title = t('appName');
  }

  function pageHead(title, actionsHtml = '', subtitle = '') {
    document.getElementById('pageTitle').textContent = title;
    return `<div class="page-head">
      <div class="page-intro">
        ${subtitle ? `<p class="page-sub">${subtitle}</p>` : ''}
      </div>
      <div class="actions">${actionsHtml}</div>
    </div>`;
  }

  function renderNav() {
    const byGroup = {};
    modules.forEach((m) => {
      const g = m.group || 'main';
      (byGroup[g] ||= []).push(m);
    });
    nav.innerHTML = GROUP_KEYS.map((g) => {
      if (!byGroup[g]) return '';
      return `<div class="nav-group"><div class="nav-group-title">${t('group_' + g)}</div>
        ${byGroup[g].map((m) => `
          <button type="button" class="nav-btn ${m.id === current ? 'active' : ''}" data-id="${m.id}">
            ${icon(m.icon, 'nav-ico')}
            <span>${t(MODULE_LABEL[m.id] || m.id, m.label)}</span>
          </button>`).join('')}
      </div>`;
    }).join('');
    icons();
  }

  async function renderDashboard() {
    const data = await api('/api/dashboard');
    if (!data) return;
    const s = data.stats;
    const inbox = data.inbox || { leaves: [], advances: [] };
    const inboxCount = (inbox.leaves?.length || 0) + (inbox.advances?.length || 0);
    content.innerHTML = `
      ${pageHead(t('dashboard'), `
        <button type="button" class="btn primary goto" data-id="orders">${icon('shopping-bag')} ${t('seeOrders')}</button>
        <button type="button" class="btn outline goto" data-id="items">${icon('tags')} ${t('products')}</button>
      `, t('dashboardSub'))}
      <div class="hero-card">
        <div class="hero-row">
          <div>
            <p class="hero-kicker">${icon('flame')} ${t('appName')}</p>
            <h2>${t('heroTitle')}</h2>
            <p>${t('heroText')} <a href="https://hotsport.tn/" target="_blank" rel="noopener">hotsport.tn</a></p>
          </div>
          <div class="hero-badge">${icon('database')}<span>${t('mongoLive')}</span></div>
        </div>
        <div class="stats">
          <div class="stat"><span>${s.stock.totalProducts}</span><label>${icon('package')} ${t('productsLabel')}</label></div>
          <div class="stat warn"><span>${s.pendingOrders || 0}</span><label>${icon('clock')} ${t('ordersInProgress')}</label></div>
          <div class="stat ok"><span>${s.stock.inStock}</span><label>${icon('circle-check')} ${t('stockOk')}</label></div>
          <div class="stat bad"><span>${s.stock.outOfStock}</span><label>${icon('circle-alert')} ${t('outOfStock')}</label></div>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-ico">${icon('shopping-bag')}</div><span>${s.orders || 0}</span><label>${t('orders')}</label></div>
        <div class="kpi"><div class="kpi-ico">${icon('receipt')}</div><span>${s.invoices}</span><label>${t('invoices')} / ${t('pos')}</label></div>
        <div class="kpi"><div class="kpi-ico">${icon('users')}</div><span>${s.customers}</span><label>${t('customers')}</label></div>
        <div class="kpi"><div class="kpi-ico">${icon('clipboard-list')}</div><span>${s.purchases}</span><label>${t('purchases')}</label></div>
        <div class="kpi ok"><div class="kpi-ico">${icon('trending-up')}</div><span>${money(s.salesTotal)}</span><label>${t('sales')}</label></div>
        <div class="kpi"><div class="kpi-ico">${icon('truck')}</div><span>${money(s.purchaseTotal)}</span><label>${t('purchasesAmt')}</label></div>
        <div class="kpi warn"><div class="kpi-ico">${icon('wallet')}</div><span>${money(s.customerReceivables)}</span><label>${t('receivables')}</label></div>
        <div class="kpi"><div class="kpi-ico">${icon('badge-check')}</div><span>${s.employees}</span><label>${t('employees')}</label></div>
        <div class="kpi"><div class="kpi-ico">${icon('banknote')}</div><span>${s.caisseCount || s.openTills || 0}</span><label>${t('caisse')}</label></div>
        <div class="kpi"><div class="kpi-ico">${icon('handshake')}</div><span>${s.sponsors || 0}</span><label>${t('sponsors')}</label></div>
      </div>
      ${permissions.approveHr && inboxCount ? `
      <div class="panel inbox-panel">
        <div class="panel-head"><h3>${icon('inbox')} ${t('pendingInbox')} (${inboxCount})</h3>
          <button type="button" class="btn small primary goto" data-id="hrm">${t('hrm')}</button>
        </div>
        ${inbox.leaves.map((l) => `
          <div class="inbox-row">
            <div><strong>${esc(l.employeeName || l.userEmail)}</strong> · ${esc(l.userRole || '')}
              <div class="muted">${t('askLeave')} · ${esc(l.type)} · ${new Date(l.fromDate).toLocaleDateString(getLang())}</div></div>
            <div class="actions-cell">
              <button class="btn small primary leave-action" data-id="${l._id}" data-status="approved">${t('approve')}</button>
              <button class="btn small danger leave-action" data-id="${l._id}" data-status="rejected">${t('reject')}</button>
            </div>
          </div>`).join('')}
        ${inbox.advances.map((a) => `
          <div class="inbox-row">
            <div><strong>${esc(a.userName)}</strong> · ${esc(a.userRole || '')}
              <div class="muted">${t('salaryAdvance')} · ${money(a.amount)} · ${esc(a.month || '')}</div></div>
            <div class="actions-cell">
              <button class="btn small primary advance-action" data-id="${a._id}" data-status="approved">${t('approve')}</button>
              <button class="btn small danger advance-action" data-id="${a._id}" data-status="rejected">${t('reject')}</button>
            </div>
          </div>`).join('')}
      </div>` : ''}
      <div class="panel">
        <div class="panel-head"><h3>${icon('zap')} ${t('shortcuts')}</h3></div>
        <div class="filters">
          ${[['orders','shopping-bag'],['pos','monitor-smartphone'],['caisse','banknote'],['sponsors','handshake'],['users','user-cog'],['stock','package'],['items','tags'],['reports','bar-chart-3'],['settings','settings']].filter(([id]) => modules.some((m) => m.id === id)).map(([id, ico]) =>
            `<button class="chip goto" data-id="${id}">${icon(ico)} ${t(id)}</button>`).join('')}
        </div>
      </div>`;
    icons();
  }

  async function renderOrders() {
    const qs = new URLSearchParams();
    if (orderFilter !== 'all') qs.set('status', orderFilter);
    if (orderSearch) qs.set('q', orderSearch);
    const data = await api('/api/orders?' + qs.toString());
    cache.orders = data?.orders || [];
    content.innerHTML = `
      ${pageHead(t('orders'), `<button type="button" class="btn primary" id="btnNewOrder">${icon('plus')} ${t('newOrder')}</button>`, t('ordersSub'))}
      <div class="page-tools">
        <input type="search" id="orderSearch" value="${esc(orderSearch)}" placeholder="${esc(t('searchOrders'))}" />
        <div class="filters" id="orderFilters">
          ${['all', 'pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'].map((s) =>
            `<button type="button" class="chip ${orderFilter === s ? 'active' : ''}" data-status="${s}">${s === 'all' ? icon('list-filter') + ' ' + t('all') : statusLabel(s)}</button>`
          ).join('')}
        </div>
      </div>
      ${dataTable(
        [t('order'), t('client'), t('source'), t('total'), t('payment'), t('status'), t('date'), ''],
        cache.orders.map((o) => `
          <tr>
            <td><strong>${esc(o.orderNo)}</strong>${o.wooOrderId ? `<div class="muted">Woo #${o.wooOrderId}</div>` : ''}</td>
            <td>${esc(o.customerName)}<div class="muted">${esc(o.phone || '')} · ${esc(o.city || '')}</div></td>
            <td>${esc(o.source)}</td>
            <td><strong>${money(o.totalAmount)}</strong></td>
            <td>${statusTag(o.paymentStatus)}<div class="muted">${esc(o.paymentMethod)}</div></td>
            <td>${statusTag(o.status)}</td>
            <td>${new Date(o.orderedAt || o.createdAt).toLocaleString(getLang())}</td>
            <td class="actions-cell">
              <button type="button" class="btn small outline view-order" data-id="${o._id}">${t('view')}</button>
              <button type="button" class="btn small dark edit-order-status" data-id="${o._id}">${t('status')}</button>
            </td>
          </tr>`).join('')
      )}`;
  }

  function orderDetailHtml(o) {
    return `
      <div class="detail-rows">
        <div><span>${t('client')}</span><strong>${esc(o.customerName)}</strong></div>
        <div><span>${t('phone')}</span><strong>${esc(o.phone || '—')}</strong></div>
        <div><span>${t('address')}</span><strong>${esc(o.address || '')}, ${esc(o.city || '')}</strong></div>
        <div><span>${t('source')}</span><strong>${esc(o.source)}</strong></div>
        <div><span>${t('payment')}</span><strong>${esc(o.paymentMethod)} · ${statusLabel(o.paymentStatus)}</strong></div>
        <div><span>${t('status')}</span><strong>${statusLabel(o.status)}</strong></div>
        <div><span>${t('note')}</span><strong>${esc(o.note || '—')}</strong></div>
      </div>
      ${dataTable([t('sku'), t('product'), t('qty'), t('price'), t('total')], (o.lines || []).map((l) => `
        <tr><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(l.total)}</td></tr>
      `).join(''))}
      <div class="detail-rows" style="margin-top:0.75rem">
        <div><span>${t('shipping')}</span><strong>${money(o.shippingFee)}</strong></div>
        <div><span>${t('discount')}</span><strong>${money(o.discount)}</strong></div>
        <div><span>${t('total')}</span><strong>${money(o.totalAmount)}</strong></div>
        <div><span>${t('paid')}</span><strong>${money(o.paidAmount)}</strong></div>
      </div>`;
  }

  async function showOrder(id) {
    const data = await api('/api/orders/' + id);
    if (!data?.order) return;
    const o = data.order;
    openModal(`${t('order')} ${o.orderNo}`, orderDetailHtml(o), `
      <button type="button" class="btn outline" id="modalCancel">${t('close')}</button>
      <button type="button" class="btn primary edit-order-status" data-id="${o._id}">${t('changeStatus')}</button>
    `, true);
  }

  function showOrderStatusModal(id) {
    const o = cache.orders.find((x) => x._id === id);
    if (!o) return;
    openModal(t('orderStatus'), `
      <form id="statusForm">
        <input type="hidden" name="id" value="${o._id}" />
        <label>${t('status')}
          <select name="status">
            ${['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'].map((st) =>
              `<option value="${st}" ${o.status === st ? 'selected' : ''}>${statusLabel(st)}</option>`).join('')}
          </select>
        </label>
        <label>${t('paymentStatus')}
          <select name="paymentStatus">
            ${['unpaid', 'partial', 'paid'].map((st) =>
              `<option value="${st}" ${o.paymentStatus === st ? 'selected' : ''}>${statusLabel(st)}</option>`).join('')}
          </select>
        </label>
        <label>${t('amountPaid')}<input type="number" step="0.001" name="paidAmount" value="${o.paidAmount}" /></label>
      </form>`, `
      <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
      <button type="button" class="btn primary" id="saveOrderStatus">${t('save')}</button>`);
  }

  function showNewOrderModal() {
    const products = cache.products.length ? cache.products : [];
    openModal(t('newOrder'), `
      <form id="orderForm" class="form-grid">
        <label>${t('client')}<input name="customerName" required placeholder="${esc(t('name'))}" /></label>
        <label>${t('phone')}<input name="phone" placeholder="+216…" /></label>
        <label>${t('city')}<input name="city" value="Tunis" /></label>
        <label>${t('source')}
          <select name="source"><option>web</option><option>whatsapp</option><option>phone</option><option>shop</option></select>
        </label>
        <label class="full">${t('address')}<input name="address" placeholder="${esc(t('address'))}" /></label>
        <label class="full">${t('product')}
          <select name="productSku" id="orderProductSku">
            ${products.map((p) => `<option value="${esc(p.sku)}" data-price="${p.priceTnd}" data-name="${esc(p.name)}" data-id="${p._id}">${esc(p.sku)} — ${esc(p.name)} (${p.stockQty})</option>`).join('')}
          </select>
        </label>
        <label>${t('quantity')}<input type="number" name="qty" value="1" min="1" /></label>
        <label>${t('shippingFee')}<input type="number" name="shippingFee" value="8" step="0.001" /></label>
        <label>${t('payment')}
          <select name="paymentMethod"><option value="cod">COD</option><option value="card">Card</option><option value="cash">Cash</option><option value="bank">Bank</option></select>
        </label>
        <label class="full">${t('note')}<input name="note" placeholder="${esc(t('note'))}" /></label>
      </form>`, `
      <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
      <button type="button" class="btn primary" id="saveOrder">${t('createOrder')}</button>`, true);
  }

  async function renderStock() {
    const qs = new URLSearchParams({ filter: stockFilter, q: stockSearch });
    if (stockCategory !== 'all') qs.set('category', stockCategory);
    const [prod, hist] = await Promise.all([api('/api/products?' + qs), api('/api/history')]);
    cache.products = prod?.products || [];
    const cats = [...new Set((prod?.products || cache.products).map((p) => p.category).filter(Boolean))];
    const allCats = [...new Set([...(await api('/api/products')).products.map((p) => p.category), ...cats])];
    const s = prod.summary;
    content.innerHTML = `
      ${pageHead(t('stock'), `
        <a class="btn outline" href="/api/export/products">${icon('download')} Export</a>
      `)}
      <div class="hero-card">
        <h2>${t('stockQuick')}</h2>
        <p>${t('stockQuickSub')}</p>
        <div class="stats">
          <div class="stat"><span>${s.totalProducts}</span><label>${t('productsLabel')}</label></div>
          <div class="stat ok"><span>${s.inStock}</span><label>${t('ok')}</label></div>
          <div class="stat warn"><span>${s.lowStock}</span><label>${t('low')}</label></div>
          <div class="stat bad"><span>${s.outOfStock}</span><label>${t('out')}</label></div>
        </div>
      </div>
      <div class="panel scan-panel">
        <h3>${icon('scan-barcode')} Receive by barcode</h3>
        <form id="stockReceiveForm" class="form-grid scan-form">
          <label>Barcode / code<input name="barcode" id="receiveBarcode" placeholder="Scan or type HS…" autofocus /></label>
          <label>${t('name')}<input name="name" placeholder="New product name if unknown" /></label>
          <label>${t('qty')}<input type="number" name="qty" value="1" min="1" required /></label>
          <label>${t('category')}
            <select name="category">
              <option value="Pack">Pack</option>
              <option value="Box">Box</option>
              <option value="MMA">MMA</option>
              <option value="Fitness">Fitness</option>
              <option value="sport">sport</option>
            </select>
          </label>
          <div class="full actions"><button type="submit" class="btn primary">${icon('plus')} Add stock</button></div>
        </form>
      </div>
      <div class="page-tools">
        <input type="search" id="stockSearch" value="${esc(stockSearch)}" placeholder="${esc(t('searchStock'))} / barcode" />
        <select id="stockCategory">
          <option value="all">${t('all')} categories</option>
          ${allCats.map((c) => `<option value="${esc(c)}" ${stockCategory === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <div class="filters" id="stockFilters">
          ${['all', 'low', 'out', 'ok'].map((f) =>
            `<button type="button" class="chip ${stockFilter === f ? 'active' : ''}" data-filter="${f}">${t(f)}</button>`).join('')}
        </div>
      </div>
      <div class="list">
        ${cache.products.map((p) => `
          <article class="card" data-id="${p._id}">
            <div class="card-media">${productThumb(p)}</div>
            <div>
              <div class="card-title">
                <h3>${esc(p.name)}</h3>
                <span class="badge ${p.isOut ? 'bad' : p.isLow ? 'warn' : ''}">${p.stockQty}</span>
              </div>
              <p class="meta"><span>${esc(p.sku)}</span><span class="barcode-chip">${esc(p.barcode || '—')}</span><span>${esc(p.category)}</span></p>
              ${productParamsChips(p)}
              <p class="price">${money(p.priceTnd)}</p>
            </div>
            <div class="qty-actions">
              <button type="button" class="qty" data-delta="-1">−</button>
              <button type="button" class="qty plus" data-delta="1">+</button>
              <button type="button" class="link adjust-open">${t('adjust')}</button>
              <button type="button" class="btn small primary sell-product" data-id="${p._id}">${t('sell')}</button>
            </div>
          </article>`).join('') || `<div class="panel empty">${esc(t('noProducts'))}</div>`}
      </div>
      <div class="panel">
        <h3>${t('stockHistory')}</h3>
        <ul style="list-style:none;margin:0;padding:0">
          ${(hist?.history || []).slice(0, 12).map((h) => `
            <li style="display:flex;justify-content:space-between;gap:.5rem;padding:.45rem 0;border-top:1px solid #f0ece8">
              <span><strong>${esc(h.product?.name || t('product'))}</strong> · ${esc(t(h.reason) !== h.reason ? t(h.reason) : h.reason)}</span>
              <span class="${h.qtyChange >= 0 ? 'plus' : 'minus'}">${h.qtyChange >= 0 ? '+' : ''}${h.qtyChange}</span>
            </li>`).join('') || `<li class="muted">${esc(t('noData'))}</li>`}
        </ul>
      </div>`;
  }

  async function renderItems() {
    const qs = new URLSearchParams();
    if (itemsCategory !== 'all') qs.set('category', itemsCategory);
    const [prod, cats] = await Promise.all([api('/api/products?' + qs), api('/api/categories')]);
    cache.products = prod?.products || [];
    const catOpts = (cats?.categories || []).map((c) => c.name);
    content.innerHTML = `
      ${pageHead(t('items'), `
        ${permissions.createProducts ? `<button type="button" class="btn primary" id="btnNewProduct">+ ${t('addProduct')}</button>` : ''}
        <a class="btn outline" href="/api/export/products">${icon('download')} Export CSV</a>
        <label class="btn outline file-btn">${icon('upload')} Import<input type="file" id="importProducts" accept=".json,.csv,application/json,text/csv" hidden /></label>
      `)}
      <div class="page-tools">
        <select id="itemsCategory">
          <option value="all">${t('all')}</option>
          ${catOpts.map((c) => `<option value="${esc(c)}" ${itemsCategory === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>${t('categoriesUnits')}</h3></div>
        <div class="meta">
          ${(cats?.categories || []).map((c) => `<span>${esc(c.name)}</span>`).join('')}
          ${(cats?.units || []).map((u) => `<span>${esc(u.name)}</span>`).join('')}
        </div>
      </div>
      ${dataTable(
        ['', t('sku'), 'Barcode', t('product'), t('category'), t('cost'), t('price'), t('stock'), t('min'), ''],
        cache.products.map((p) => `
          <tr>
            <td class="thumb-cell">${productThumb(p, 'product-thumb sm')}</td>
            <td>${esc(p.sku)}</td>
            <td><code>${esc(p.barcode || '—')}</code></td>
            <td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.discipline)}</div>${productParamsChips(p)}</td>
            <td>${esc(p.category)}</td>
            <td>${money(p.costTnd)}</td>
            <td>${money(p.priceTnd)}</td>
            <td><strong class="${p.isOut ? 'minus' : p.isLow ? '' : 'plus'}">${p.stockQty}</strong></td>
            <td>${p.minStock}</td>
            <td class="actions-cell">
              <button type="button" class="btn small primary sell-product" data-id="${p._id}">${t('sell')}</button>
              <button type="button" class="btn small outline show-qr" data-id="${p._id}" data-code="${esc(p.barcode || p.sku)}">${t('qrCode')}</button>
              ${permissions.createProducts ? `<button type="button" class="btn small outline edit-product" data-id="${p._id}">${t('edit')}</button>
              <button type="button" class="btn small danger archive-product" data-id="${p._id}">${t('archive')}</button>` : ''}
            </td>
          </tr>`).join('')
      )}`;
  }

  function productParamsChips(p) {
    const params = (p?.params || []).filter((sp) => sp?.name);
    if (!params.length) return '';
    return `<div class="param-chips">${params.map((sp) =>
      `<span class="spec-chip"><strong>${esc(sp.name)}</strong>${(sp.values || []).length ? ' · ' + esc(sp.values.join(' / ')) : ''}</span>`
    ).join('')}</div>`;
  }

  function paramRowHtml(sp = {}) {
    return `<div class="param-row">
      <label>${t('name')}<input class="param-name" value="${esc(sp.name || '')}" placeholder="${esc(t('paramColor'))}" /></label>
      <label>${t('paramValues')}<input class="param-values" value="${esc((sp.values || []).join(', '))}" placeholder="Noir, Blanc · S, M, L" /></label>
      <button type="button" class="btn small outline drop-param" aria-label="${esc(t('delete'))}">×</button>
    </div>`;
  }

  function collectProductParams() {
    return [...document.querySelectorAll('#productParams .param-row')].map((row) => ({
      name: row.querySelector('.param-name')?.value?.trim() || '',
      values: String(row.querySelector('.param-values')?.value || '')
        .split(/[,;/|]/).map((v) => v.trim()).filter(Boolean)
    })).filter((row) => row.name);
  }

  function productHasParams(p) {
    return (p?.params || []).some((sp) => sp?.name && (sp.values || []).length);
  }

  function productForm(p = null) {
    const params = (p?.params || []).filter((sp) => sp?.name);
    const rows = params.length ? params : [
      { name: t('paramColor'), values: [] },
      { name: t('paramSize'), values: [] }
    ];
    return `<form id="productForm" class="form-grid">
      <label>${t('sku')}<input name="sku" value="${esc(p?.sku || '')}" ${p ? 'readonly' : ''} placeholder="${esc(t('autoCode'))}" /></label>
      <label>${t('emoji')}<input name="imageEmoji" value="${esc(p?.imageEmoji || '📦')}" /></label>
      <label class="full">${t('name')}<input name="name" required value="${esc(p?.name || '')}" /></label>
      <label class="full">Image URL<input name="imageUrl" value="${esc(p?.imageUrl || '')}" placeholder="https://hotsport.tn/wp-content/uploads/..." /></label>
      <label>Barcode<input name="barcode" value="${esc(p?.barcode || '')}" placeholder="${esc(t('autoBarcode'))}" /></label>
      ${p?.imageUrl ? `<div class="full form-preview">${productThumb(p, 'product-thumb lg')}</div>` : ''}
      <label>${t('category')}<input name="category" value="${esc(p?.category || 'Pack')}" /></label>
      <label>${t('discipline')}<input name="discipline" value="${esc(p?.discipline || 'sport')}" /></label>
      <label>${t('price')} TND<input type="number" step="0.001" name="priceTnd" value="${p?.priceTnd ?? 0}" /></label>
      <label>${t('cost')} TND<input type="number" step="0.001" name="costTnd" value="${p?.costTnd ?? 0}" /></label>
      <label>${t('stock')}<input type="number" name="stockQty" value="${p?.stockQty ?? 0}" /></label>
      <label>${t('min')}<input type="number" name="minStock" value="${p?.minStock ?? 5}" /></label>
      <label>${t('wooId')}<input type="number" name="wooProductId" value="${p?.wooProductId || ''}" /></label>
      <label class="full">${t('description')}<textarea name="description" rows="2">${esc(p?.description || '')}</textarea></label>
      <div class="param-block">
        <strong>${t('paramSection')}</strong>
        <p class="muted">${esc(t('paramHint'))}</p>
        <div class="param-quick">
          <button type="button" class="btn small outline add-preset-param" data-name="${esc(t('paramColor'))}">+ ${t('paramColor')}</button>
          <button type="button" class="btn small outline add-preset-param" data-name="${esc(t('paramSize'))}">+ ${t('paramSize')}</button>
          <button type="button" class="btn small outline add-preset-param" data-name="${esc(t('paramShoe'))}">+ ${t('paramShoe')}</button>
          <button type="button" class="btn small outline add-preset-param" data-name="${esc(t('paramGender'))}">+ ${t('paramGender')}</button>
          <button type="button" class="btn small outline add-preset-param" data-name="${esc(t('paramMaterial'))}">+ ${t('paramMaterial')}</button>
        </div>
        <div id="productParams">${rows.map((sp) => paramRowHtml(sp)).join('')}</div>
        <button type="button" class="btn outline" id="addParamRow">${icon('plus')} ${t('addParam')}</button>
      </div>
      ${p ? `<input type="hidden" name="id" value="${p._id}" />` : ''}
    </form>`;
  }

  async function renderCustomers() {
    const data = await api('/api/customers');
    cache.customers = data?.customers || [];
    content.innerHTML = `
      ${pageHead(t('customers'), `<button type="button" class="btn primary" id="btnNewCustomer">+ ${t('newCustomer')}</button>`)}
      ${dataTable(
        [t('code'), t('name'), t('mobile'), 'Email', t('address'), t('balance'), ''],
        cache.customers.map((c) => `
          <tr>
            <td>${esc(c.code)}</td>
            <td><strong>${esc(c.name)}</strong></td>
            <td>${esc(c.mobile)}</td>
            <td>${esc(c.email)}</td>
            <td>${esc(c.address)}</td>
            <td class="${c.balance > 0 ? 'minus' : ''}">${money(c.balance)}</td>
            <td class="actions-cell"><button type="button" class="btn small outline edit-customer" data-id="${c._id}">${t('edit')}</button></td>
          </tr>`).join('')
      )}`;
  }

  function customerForm(c = null) {
    return `<form id="customerForm" class="form-grid">
      <label>${t('code')}<input name="code" value="${esc(c?.code || '')}" ${c ? 'readonly' : ''} placeholder="${esc(t('autoCode'))}" /></label>
      <label>${t('name')}<input name="name" required value="${esc(c?.name || '')}" /></label>
      <label>${t('mobile')}<input name="mobile" value="${esc(c?.mobile || '')}" /></label>
      <label>Email<input name="email" value="${esc(c?.email || '')}" /></label>
      <label class="full">${t('address')}<input name="address" value="${esc(c?.address || '')}" /></label>
      <label>${t('balance')}<input type="number" step="0.001" name="balance" value="${c?.balance ?? 0}" /></label>
      ${c ? `<input type="hidden" name="id" value="${c._id}" />` : ''}
    </form>`;
  }

  async function renderSuppliers() {
    const data = await api('/api/suppliers');
    content.innerHTML = pageHead(t('suppliers')) + dataTable(
      [t('code'), t('name'), t('mobile'), 'Email', t('address'), t('payable')],
      (data?.suppliers || []).map((sup) => `
        <tr><td>${esc(sup.code)}</td><td>${esc(sup.name)}</td><td>${esc(sup.mobile)}</td>
        <td>${esc(sup.email)}</td><td>${esc(sup.address)}</td>
        <td class="${sup.balance > 0 ? 'minus' : ''}">${money(sup.balance)}</td></tr>`).join('')
    );
  }

  function purchaseLineHtml(line = {}, products) {
    const pid = String(line.product?._id || line.product || '');
    return `<div class="purchase-line form-grid">
      <label class="full">${t('item')}<select class="pl-product">
        ${(products || []).map((p) => `<option value="${p._id}" data-cost="${p.costTnd || 0}" ${pid === String(p._id) ? 'selected' : ''}>${esc(p.name)} · ${esc(p.sku)}</option>`).join('')}
      </select></label>
      <label>${t('qty')}<input class="pl-qty" type="number" min="1" value="${line.qty || 1}" /></label>
      <label>${t('rate')}<input class="pl-rate" type="number" step="0.001" min="0" value="${line.rate ?? ''}" /></label>
      <div class="full"><button type="button" class="btn small outline drop-purchase-line">×</button></div>
    </div>`;
  }

  function purchaseForm(p = null) {
    const products = cache.products || [];
    const suppliers = cache.suppliers || [];
    const lines = (p?.lines?.length ? p.lines : [{}]);
    return `<form id="purchaseForm" class="form-grid">
      <label>${t('supplier')}<select name="supplierId">
        ${suppliers.map((s) => `<option value="${s._id}" ${String(p?.supplier) === String(s._id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select></label>
      <label>${t('date')}<input type="date" name="date" value="${isoDate(p?.date) || new Date().toISOString().slice(0, 10)}" /></label>
      <label>${t('payment')}<select name="paymentType">
        <option value="cash" ${p?.paymentType === 'cash' ? 'selected' : ''}>${t('cash')}</option>
        <option value="bank" ${p?.paymentType === 'bank' ? 'selected' : ''}>${t('card')}</option>
      </select></label>
      <label>${t('status')}<select name="status">
        <option value="received" ${!p || p.status === 'received' ? 'selected' : ''}>${t('received')}</option>
        <option value="ordered" ${p?.status === 'ordered' ? 'selected' : ''}>${t('ordered')}</option>
        <option value="pending" ${p?.status === 'pending' ? 'selected' : ''}>${t('pending')}</option>
        <option value="cancelled" ${p?.status === 'cancelled' ? 'selected' : ''}>${t('cancelled')}</option>
      </select></label>
      <label>${t('discount')}<input type="number" step="0.001" name="discount" value="${p?.discount ?? 0}" /></label>
      <label>${t('paid')}<input type="number" step="0.001" name="paidAmount" value="${p?.paidAmount ?? 0}" /></label>
      <label class="full">${t('note')}<input name="note" value="${esc(p?.note || '')}" /></label>
      <div class="full" id="purchaseLines">${lines.map((l) => purchaseLineHtml(l, products)).join('')}</div>
      <div class="full"><button type="button" class="btn outline" id="addPurchaseLine">${icon('plus')} ${t('addLine')}</button></div>
      ${p ? `<input type="hidden" name="id" value="${p._id}" />` : ''}
    </form>`;
  }

  async function openPurchaseModal(p = null) {
    if (!(cache.products || []).length) {
      const prod = await api('/api/products');
      cache.products = prod?.products || [];
    }
    if (!(cache.suppliers || []).length) {
      const sup = await api('/api/suppliers');
      cache.suppliers = sup?.suppliers || [];
    }
    openModal(p ? t('editPurchase') : t('newPurchase'), purchaseForm(p), `
      <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
      <button type="button" class="btn primary" id="savePurchase">${p ? t('save') : t('create')}</button>`, true);
  }

  async function renderPurchases() {
    const can = !!permissions.managePurchases;
    const [data, prod, sup] = await Promise.all([
      api('/api/purchases'),
      api('/api/products'),
      api('/api/suppliers')
    ]);
    cache.purchases = data?.purchases || [];
    cache.products = prod?.products || cache.products || [];
    cache.suppliers = sup?.suppliers || [];
    content.innerHTML = pageHead(
      t('purchases'),
      can ? `<button type="button" class="btn primary" id="btnNewPurchase">${icon('plus')} ${t('newPurchase')}</button>` : '',
      t('purchaseSub')
    ) + (cache.purchases.map((p) => `
      <div class="panel">
        <div class="panel-head"><h3>${esc(p.purchaseNo)} · ${esc(p.supplierName)}</h3>${statusTag(p.status)}</div>
        <p class="muted">${new Date(p.date).toLocaleDateString(getLang())} · ${esc(p.paymentType)} · ${esc(p.note || '')}</p>
        ${dataTable([t('sku'), t('item'), t('qty'), t('rate'), t('total')], (p.lines || []).map((l) => `
          <tr><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td>${l.qty}</td><td>${money(l.rate)}</td><td>${money(l.total)}</td></tr>`).join(''))}
        <p><strong>${t('total')}</strong> ${money(p.grandTotal)} · ${t('paid')} ${money(p.paidAmount)} · ${t('due')} ${money(p.dueAmount)}</p>
        ${can ? `<div class="actions-cell">
          <button type="button" class="btn small outline edit-purchase" data-id="${p._id}">${t('edit')}</button>
          <button type="button" class="btn small danger delete-purchase" data-id="${p._id}">${t('delete')}</button>
        </div>` : ''}
      </div>`).join('') || `<div class="panel empty">${esc(t('noPurchases'))}</div>`);
  }

  async function renderInvoices() {
    const data = await api('/api/invoices');
    content.innerHTML = pageHead(t('invoices')) + dataTable(
      [t('number'), t('client'), t('source'), t('caisse'), t('total'), t('paid'), t('due'), t('status'), t('date')],
      (data?.invoices || []).map((inv) => `
        <tr>
          <td><strong>${esc(inv.invoiceNo)}</strong></td>
          <td>${esc(inv.customerName)}</td>
          <td>${statusTag(inv.source)}</td>
          <td>${esc(inv.caisseName || '—')}</td>
          <td>${money(inv.totalAmount)}</td>
          <td>${money(inv.paidAmount)}</td>
          <td class="${inv.dueAmount > 0 ? 'minus' : ''}">${money(inv.dueAmount)}</td>
          <td>${statusTag(inv.status)}</td>
          <td>${new Date(inv.date).toLocaleString(getLang())}</td>
        </tr>`).join('')
    );
  }

  async function renderPos() {
    loadJsQr().catch(() => {});
    const [data, desk, cust] = await Promise.all([
      api('/api/products?filter=ok'),
      api('/api/caisses'),
      api('/api/customers')
    ]);
    cache.products = data?.products || [];
    cache.caisses = desk?.caisses || [];
    cache.customers = cust?.customers || [];
    const currentSession = desk?.currentSession || null;
    if (currentSession) {
      selectedCaisseId = String(currentSession.caisse);
      localStorage.setItem('hs_caisse_id', selectedCaisseId);
    }
    content.innerHTML = `
      ${pageHead(t('pos'), `
        <button type="button" class="btn outline" id="posScanCam">${icon('scan-line')} ${t('scanCode')}</button>
        <button type="button" class="btn outline" id="posAddClient">${icon('user-plus')} ${t('newCustomer')}</button>
        <button type="button" class="btn primary" id="posCheckout">${icon('receipt')} ${t('passCommand')}</button>
      `, t('posEasySub'))}
      <div class="till-switch">
        ${cache.caisses.map((c) => {
          const open = !!c.openSession;
          const mine = currentSession && String(currentSession.caisse) === String(c._id);
          return `<button type="button" class="till-pill ${mine ? 'active' : ''} ${open ? 'open' : ''}" data-caisse="${c._id}">
            <span class="pulse"></span>
            <strong>${esc(c.name)}</strong>
            <small>${open ? t('tillOpen') : t('tillClosed')}</small>
          </button>`;
        }).join('') || `<p class="muted">${esc(t('noCaisse'))}</p>`}
      </div>
      <div class="panel scan-panel">
        <form id="posScanForm" class="form-grid scan-form">
          <input type="hidden" name="caisseId" value="${esc(selectedCaisseId || String(currentSession?.caisse || ''))}" />
          <input type="hidden" name="sessionId" value="${esc(String(currentSession?._id || ''))}" />
          <label>${t('client')}<select id="posCustomer" name="customerId">
            ${(cache.customers || []).map((c) => `<option value="${c._id}" ${posCustomerId === String(c._id) || (!posCustomerId && c.code === 'CUS-WALK') ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></label>
          <label>${t('payment')}<select id="posPay" name="paymentMethod">
            <option value="cash" ${posPay === 'cash' ? 'selected' : ''}>${t('cash')}</option>
            <option value="card" ${posPay === 'card' ? 'selected' : ''}>${t('card')}</option>
          </select></label>
          <label>Barcode / QR<input id="posBarcode" name="barcode" placeholder="${esc(t('scanOrType'))}" autofocus /></label>
          <label>${t('qty')}<input type="number" id="posQty" name="qty" value="1" min="1" /></label>
          <div class="full actions">
            <button type="submit" class="btn primary">${icon('plus')} ${t('addToCart')}</button>
            <button type="button" class="btn outline" id="posRescan">${icon('refresh-cw')} ${t('clearCart')}</button>
          </div>
        </form>
        <div id="scannerBox" class="scanner-box" hidden>
          <video id="scanVideo" playsinline autoplay muted></video>
          <button type="button" class="btn small dark" id="stopScan">${t('stopScan')}</button>
        </div>
        <div id="posCart" class="pos-cart"></div>
        <div id="receiptBox" class="receipt-box" ${lastReceipt ? '' : 'hidden'}></div>
      </div>
      <div class="list">
        ${cache.products.map((p) => `
          <article class="card">
            <div class="card-media">${productThumb(p)}</div>
            <div>
              <div class="card-title"><h3>${esc(p.name)}</h3><span class="badge">${p.stockQty}</span></div>
              <p class="meta"><span class="barcode-chip">${esc(p.barcode || p.sku)}</span></p>
              ${productParamsChips(p)}
              <p class="price">${money(p.priceTnd)}</p>
            </div>
            <div class="qty-actions">
              <button type="button" class="btn primary pos-sell" data-id="${p._id}">${t('sell')}</button>
            </div>
          </article>`).join('') || `<div class="panel empty">${esc(t('noStock'))}</div>`}
      </div>`;
    paintCart();
    if (lastReceipt) paintReceipt(lastReceipt);
  }

  function addToCart(p, qty = 1, variant = '') {
    if (!p) return;
    const id = String(p._id);
    const label = variant ? `${p.name} · ${variant}` : p.name;
    const hit = posCart.find((x) => x.productId === id && (x.variant || '') === variant);
    if (hit) hit.qty += qty;
    else {
      posCart.push({
        productId: id,
        name: label,
        sku: p.sku,
        barcode: p.barcode,
        price: Number(p.priceTnd) || 0,
        qty,
        variant
      });
    }
    showToast(`${label} × ${qty}`);
    paintCart();
    refreshCheckoutUi();
  }

  function offerSell(p, qty = 1) {
    if (!p) return;
    if (!productHasParams(p)) {
      addToCart(p, qty);
      return;
    }
    openModal(`${t('pickOptions')} · ${p.name}`, `
      <form id="specPickForm" class="form-grid">
        ${(p.params || []).filter((sp) => sp.name && (sp.values || []).length).map((sp) => `
          <label class="full">${esc(sp.name)}
            <select class="spec-pick" data-name="${esc(sp.name)}">
              ${(sp.values || []).map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}
            </select>
          </label>`).join('')}
        <input type="hidden" name="productId" value="${p._id}" />
        <input type="hidden" name="qty" value="${qty}" />
      </form>
      ${productParamsChips(p)}
    `, `
      <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
      <button type="button" class="btn primary" id="confirmSpecSell">${t('addToCart')}</button>`);
  }

  function paintCart() {
    const el = document.getElementById('posCart');
    if (!el) return;
    if (!posCart.length) {
      el.innerHTML = `<p class="muted">${esc(t('emptyCart'))}</p>`;
      return;
    }
    const total = posCart.reduce((s, l) => s + l.qty * l.price, 0);
    el.innerHTML = `
      <h3>${t('cart')} · ${money(total)}</h3>
      ${posCart.map((l, i) => `
        <div class="cart-line">
          <span>${esc(l.name)} × ${l.qty}</span>
          <strong>${money(l.qty * l.price)}</strong>
          <button type="button" class="btn small outline cart-drop" data-i="${i}">×</button>
        </div>`).join('')}
      <button type="button" class="btn primary block" id="posCheckout">${t('passCommand')} · ${money(total)}</button>`;
  }

  function paintPermGate() {
    const gate = document.getElementById('permGate');
    if (!gate) return;
    document.getElementById('permTitle').textContent = t('permTitle');
    document.getElementById('permBody').textContent = t('permBody');
    document.getElementById('permList').innerHTML =
      `<li>${esc(t('permCamera'))}</li><li>${esc(t('permNotify'))}</li>`;
    document.getElementById('permAllow').textContent = t('permAllow');
    document.getElementById('permLater').textContent = t('permLater');
  }

  function showPermGate(next) {
    pendingScan = next || pendingScan;
    paintPermGate();
    document.getElementById('permGate').hidden = false;
  }

  function hidePermGate() {
    const gate = document.getElementById('permGate');
    if (gate) gate.hidden = true;
  }

  async function allowAppPermissions() {
    if (window.__hsEnablePush) window.__hsEnablePush();
    const next = pendingScan;
    pendingScan = null;
    try {
      const stream = await requestCamera();
      cameraGranted = true;
      hidePermGate();
      showToast(t('permGranted'));
      if (next === 'checkout') showCheckout(Promise.resolve(stream));
      else {
        stream.getTracks().forEach((tr) => tr.stop());
        scanStream = null;
      }
    } catch (_) {
      cameraGranted = false;
      hidePermGate();
      showToast(t('cameraDenied'));
      if (next === 'checkout') showCheckout(null);
    }
  }

  function openCheckoutWithAuth() {
    if (cameraGranted) return showCheckout(requestCamera());
    pendingScan = 'checkout';
    showPermGate('checkout');
  }

  function requestCamera() {
    const md = navigator.mediaDevices;
    if (!window.isSecureContext || !md?.getUserMedia) {
      return Promise.reject(new Error('unsupported'));
    }
    const tries = [
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      { audio: false, video: { facingMode: 'user' } },
      { audio: false, video: true }
    ];
    let chain = Promise.reject(new Error('start'));
    tries.forEach((c) => {
      chain = chain.catch(() => md.getUserMedia(c));
    });
    return chain;
  }

  function showCheckout(camPromise) {
    const openCam = camPromise !== null && camPromise !== false;
    posCustomerId = document.getElementById('posCustomer')?.value || posCustomerId;
    posPay = document.getElementById('posPay')?.value || posPay;
    const cust = (cache.customers || []).find((c) => String(c._id) === String(posCustomerId));
    const total = posCart.reduce((s, l) => s + l.qty * l.price, 0);
    appModal.classList.add('scanning');
    openModal(t('passCommand'), `
      <p class="scan-lead">${icon('scan-line')} ${esc(t('scanToAdd'))}</p>
      <form id="checkoutCodeForm" class="checkout-code">
        <input id="checkoutCode" name="code" autocomplete="off" enterkeyhint="done" placeholder="${esc(t('typeCode'))}" />
        <button type="submit" class="btn primary">${t('addToCart')}</button>
      </form>
      <p class="muted" id="scanHint">${esc(t('pointCamera'))}</p>
      <div id="checkoutCart">${checkoutCartHtml()}</div>
      <div class="receipt facture" id="checkoutPreview" ${posCart.length ? '' : 'hidden'}>
        <strong>HotSport · ${t('facturePreview')}</strong>
        <div>${esc(cust?.name || t('client'))} · ${esc(cust?.mobile || '')}</div>
        <div>${esc(currentUser?.name || '')}</div>
      </div>
    `, `
      <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
      <button type="button" class="btn dark" id="restartScan">${icon('scan-line')} ${t('openCamera')}</button>
      <button type="button" class="btn primary" id="confirmPosSale" ${posCart.length ? '' : 'disabled'}>${t('passCommand')} · ${money(total)}</button>
    `, true);
    if (openCam) startCheckoutScan(camPromise || requestCamera());
  }

  function checkoutCartHtml() {
    if (!posCart.length) return `<p class="muted">${esc(t('emptyCart'))}</p>`;
    const total = posCart.reduce((s, l) => s + l.qty * l.price, 0);
    return posCart.map((l, i) => `
      <div class="cart-line">
        <span>${esc(l.name)} × ${l.qty}</span>
        <strong>${money(l.qty * l.price)}</strong>
        <button type="button" class="btn small outline cart-drop" data-i="${i}">×</button>
      </div>`).join('') + `<p><strong>${t('total')} ${money(total)}</strong></p>`;
  }

  function refreshCheckoutUi() {
    const cartEl = document.getElementById('checkoutCart');
    if (cartEl) cartEl.innerHTML = checkoutCartHtml();
    const prev = document.getElementById('checkoutPreview');
    if (prev) prev.hidden = !posCart.length;
    const btn = document.getElementById('confirmPosSale');
    if (btn) {
      const total = posCart.reduce((s, l) => s + l.qty * l.price, 0);
      btn.disabled = !posCart.length;
      btn.textContent = `${t('passCommand')} · ${money(total)}`;
    }
    const livePass = document.getElementById('liveScanPass');
    if (livePass) {
      const total = posCart.reduce((s, l) => s + l.qty * l.price, 0);
      livePass.disabled = !posCart.length;
      livePass.textContent = `${t('passCommand')} · ${money(total)}`;
    }
    paintCart();
  }

  async function confirmPosSale() {
    const form = document.getElementById('posScanForm');
    const extra = form ? formToObject(form) : {};
    posCustomerId = extra.customerId || posCustomerId;
    posPay = extra.paymentMethod || posPay;
    const data = await api('/api/invoices/pos', {
      method: 'POST',
      body: JSON.stringify({
        caisseId: extra.caisseId || selectedCaisseId,
        sessionId: extra.sessionId,
        customerId: posCustomerId || extra.customerId,
        paymentMethod: posPay,
        lines: posCart.map((l) => ({ productId: l.productId, qty: l.qty, variant: l.variant || '' }))
      })
    });
    showToast(data?.message || 'POS');
    if (data?.ok) {
      posCart = [];
      lastReceipt = data.receipt;
      closeModal();
      await renderPos();
    }
  }

  async function onDecodedCode(code) {
    const raw = normalizeScan(code);
    if (!raw) return;
    const now = Date.now();
    if (raw === lastScanCode && now - lastScanAt < 1600) return;
    lastScanCode = raw;
    lastScanAt = now;
    const inp = document.getElementById('posBarcode');
    if (inp) inp.value = raw;
    const typed = document.getElementById('checkoutCode');
    if (typed) typed.value = raw;
    const p = await api('/api/products/lookup?code=' + encodeURIComponent(raw));
    if (p?.product) {
      offerSell(p.product, Number(document.getElementById('posQty')?.value) || 1);
      setScanHint(p.product.name);
      showToast(p.product.name);
      await pauseLivePreview();
    } else {
      showToast((p?.message || t('product')) + ' · ' + raw);
      setScanHint((p?.message || t('product')) + ' · ' + raw);
    }
  }

  function normalizeScan(code) {
    let q = String(code || '').trim();
    if (!q) return '';
    try {
      if (/^https?:\/\//i.test(q)) {
        const u = new URL(q);
        q = u.searchParams.get('code') || u.searchParams.get('barcode') || u.searchParams.get('sku')
          || u.pathname.split('/').filter(Boolean).pop() || q;
      }
    } catch (_) {}
    return q.replace(/\s+/g, '').trim();
  }

  function loadScript(src) {
    if ([...document.scripts].some((s) => s.src.includes(src.split('/').pop()))) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadScannerLib() {
    if (window.Html5Qrcode) return Promise.resolve();
    return loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
  }

  function loadJsQr() {
    if (window.jsQR) return Promise.resolve();
    return loadScript('https://unpkg.com/jsqr@1.4.0/dist/jsQR.js');
  }

  function barcodeFormats() {
    return ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'];
  }

  function makeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      return new window.BarcodeDetector({ formats: barcodeFormats() });
    } catch (_) {
      try { return new window.BarcodeDetector(); } catch (e) { return null; }
    }
  }

  function setScanHint(msg) {
    const hint = document.getElementById('scanHint');
    const live = document.getElementById('liveScanHint');
    if (hint) hint.textContent = msg;
    if (live) live.textContent = msg;
  }

  async function readFrame(video, canvas, det) {
    if (!video || video.readyState < 2 || !video.videoWidth) return '';
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    if (det) {
      try {
        const codes = await det.detect(canvas);
        if (codes?.[0]?.rawValue) return codes[0].rawValue;
      } catch (_) {}
    }
    if (window.jsQR) {
      try {
        const img = ctx.getImageData(0, 0, w, h);
        const r = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (r?.data) return r.data;
      } catch (_) {}
    }
    return '';
  }

  function startDetectLoop(video) {
    const canvas = document.getElementById('liveScanCanvas') || document.createElement('canvas');
    const det = makeDetector();
    loadJsQr().catch(() => {});
    const tick = async () => {
      if (!scanStream) return;
      try {
        const text = await readFrame(video, canvas, det);
        if (text) await onDecodedCode(text);
      } catch (_) {}
      scanTimer = setTimeout(tick, 220);
    };
    tick();
  }

  async function decodeImageFile(file) {
    if (!file) return;
    try {
      await loadJsQr().catch(() => {});
      if ('createImageBitmap' in window) {
        const bmp = await createImageBitmap(file);
        const canvas = document.getElementById('liveScanCanvas') || document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        bmp.close?.();
        const text = await readFrame({ readyState: 2, videoWidth: canvas.width, videoHeight: canvas.height }, canvas, makeDetector());
        if (text) {
          await onDecodedCode(text);
          return;
        }
        if (window.jsQR) {
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const r = window.jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
          if (r?.data) {
            await onDecodedCode(r.data);
            return;
          }
        }
      }
      await loadScannerLib();
      const host = document.getElementById('qrFileHost');
      if (!host || !window.Html5Qrcode) throw new Error('no decoder');
      const q = new window.Html5Qrcode('qrFileHost');
      const text = await q.scanFile(file, true);
      try { await q.clear(); } catch (_) {}
      if (text) await onDecodedCode(text);
    } catch (_) {
      showToast(t('product') + ' ?');
    }
  }

  async function attachStream(video, stream) {
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    await new Promise((resolve) => {
      if (video.readyState >= 1) return resolve();
      video.onloadedmetadata = () => resolve();
      setTimeout(resolve, 900);
    });
    try { await video.play(); } catch (_) {}
  }

  async function startCheckoutScan(camPromise) {
    const overlay = document.getElementById('liveScan');
    const video = document.getElementById('liveScanVideo');
    const livePass = document.getElementById('liveScanPass');
    if (!overlay || !video) return;
    overlay.hidden = false;
    if (livePass) {
      const total = posCart.reduce((s, l) => s + l.qty * l.price, 0);
      livePass.textContent = `${t('passCommand')} · ${money(total)}`;
      livePass.disabled = !posCart.length;
    }
    setScanHint(t('pointCamera'));
    try {
      const stream = camPromise ? await camPromise : await requestCamera();
      if (scanStream && scanStream !== stream) {
        scanStream.getTracks().forEach((tr) => tr.stop());
      }
      scanStream = stream;
      await attachStream(video, stream);
      startDetectLoop(video);
      loadJsQr().catch(() => {});
    } catch (_) {
      setScanHint(t('cameraDenied') + ' · ' + t('takePhoto'));
      showToast(t('cameraDenied'));
    }
  }

  async function pauseLivePreview() {
    const overlay = document.getElementById('liveScan');
    if (overlay) overlay.hidden = true;
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    const video = document.getElementById('liveScanVideo');
    if (video) {
      try { video.pause(); } catch (_) {}
      video.srcObject = null;
    }
    if (scanStream) {
      scanStream.getTracks().forEach((tr) => tr.stop());
      scanStream = null;
    }
    appModal.classList.remove('scanning');
  }

  async function stopCheckoutScan() {
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    const video = document.getElementById('liveScanVideo');
    if (video) {
      try { video.pause(); } catch (_) {}
      video.srcObject = null;
    }
    if (scanStream) {
      scanStream.getTracks().forEach((tr) => tr.stop());
      scanStream = null;
    }
    if (html5Qr) {
      try { await html5Qr.stop(); } catch (_) {}
      try { await html5Qr.clear(); } catch (_) {}
      html5Qr = null;
    }
    const overlay = document.getElementById('liveScan');
    if (overlay) overlay.hidden = true;
    appModal.classList.remove('scanning');
  }

  function startScan() {
    openCheckoutWithAuth();
  }

  function stopScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    if (scanStream) {
      scanStream.getTracks().forEach((tr) => tr.stop());
      scanStream = null;
    }
    const box = document.getElementById('scannerBox');
    if (box) box.hidden = true;
    stopCheckoutScan();
  }

  function showTips() {
    const coach = document.getElementById('coach');
    if (!coach || !currentUser) return;
    const key = 'hs_tips_v3_' + currentUser.role;
    if (localStorage.getItem(key) === '1') return;
    const tips = {
      admin: [t('tipAdmin1'), t('tipAdmin2'), t('tipAdmin3')],
      manager: [t('tipManager1'), t('tipManager2'), t('tipManager3')],
      seller: [t('tipSeller1'), t('tipSeller2'), t('tipSeller3')]
    };
    document.getElementById('coachTitle').textContent = t('coachTitle');
    document.getElementById('coachList').innerHTML = (tips[currentUser.role] || tips.seller).map((x) => `<li>${esc(x)}</li>`).join('');
    coach.hidden = false;
    document.getElementById('coachOk').onclick = () => {
      coach.hidden = true;
      localStorage.setItem(key, '1');
      showPermGate();
    };
  }

  async function pollNotices() {
    const data = await api('/api/notifications?since=' + encodeURIComponent(lastNoticeAt));
    const list = data?.notices || [];
    const badge = document.getElementById('notifyBadge');
    if (badge) {
      badge.hidden = !list.length;
      badge.textContent = String(list.length);
    }
    const fresh = list.filter((n) => new Date(n.createdAt) > new Date(lastNoticeAt));
    if (fresh.length && Notification.permission === 'granted' && navigator.serviceWorker) {
      const n = fresh[0];
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(n.title, { body: n.body, icon: '/icons/icon-192.png', data: { url: n.url } });
      }).catch(() => {});
    }
    if (data?.now) {
      lastNoticeAt = data.now;
      localStorage.setItem('hs_notice_since', lastNoticeAt);
    }
  }

  function paintReceipt(receipt) {
    const box = document.getElementById('receiptBox');
    if (!box || !receipt) return;
    box.hidden = false;
    box.innerHTML = `
      <div class="receipt">
        <strong>HotSport Receipt</strong>
        <div>${esc(receipt.invoiceNo)}</div>
        <div>${esc(receipt.caisse || '')} · ${esc(receipt.seller)} · ${esc(receipt.role)}</div>
        <div>${esc(receipt.customer || '')}</div>
        <div>${new Date(receipt.date).toLocaleString(getLang())}</div>
        <hr />
        ${(receipt.items || []).map((l) => `<div class="receipt-line"><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.total)}</span></div>`).join('')}
        <hr />
        <div class="receipt-line"><strong>Total</strong><strong>${money(receipt.total)}</strong></div>
        <div class="muted">Barcode: ${esc(receipt.barcode || '—')}</div>
        <button type="button" class="btn small outline" onclick="window.print()">Print</button>
      </div>`;
  }

  function isoDate(d) {
    if (!d) return '';
    try { return new Date(d).toISOString().slice(0, 10); } catch (_) { return ''; }
  }

  function expectedCash(s) {
    return Number(s.openingCash || 0) + Number(s.cashIn || 0) - Number(s.cashOut || 0);
  }

  async function renderCaisse() {
    const [desk, hist] = await Promise.all([api('/api/caisses'), api('/api/sessions')]);
    cache.caisses = desk?.caisses || [];
    cache.users = desk?.users || [];
    cache.sessions = hist?.sessions || [];
    const can = permissions.manageCaisses;
    content.innerHTML = `
      ${pageHead(t('caisse'), can ? `<button type="button" class="btn primary" id="btnNewCaisse">+ ${t('newCaisse')}</button>` : '', t('caisseSub'))}
      <div class="till-grid">
        ${cache.caisses.map((c) => {
          const open = c.openSession;
          return `<article class="till-card ${open ? 'is-open' : ''} ${c.status}">
            <header>
              <span class="till-code">${esc(c.code)}</span>
              ${open ? `<span class="tag ok live">${t('tillOpen')}</span>` : `<span class="tag">${t('tillClosed')}</span>`}
            </header>
            <h3>${esc(c.name)}</h3>
            <p class="muted">${esc(c.location || '')} · ${esc(c.kind)}</p>
            ${open ? `<p class="till-live">${esc(open.userName)} · ${t('cashIn')} ${money(open.cashIn)} · ${open.salesCount || 0} ${t('sales')}</p>` : `<p class="muted">${t('float')} ${money(c.openingFloat)}</p>`}
            <div class="till-actions">
              ${open && (can || String(open.user) === currentUser?.id)
                ? `<button type="button" class="btn small dark close-session" data-id="${open._id}">${t('closeTill')}</button>`
                : (c.status === 'active' ? `<button type="button" class="btn small primary open-till" data-id="${c._id}" data-float="${c.openingFloat}">${t('openTill')}</button>` : '')}
              ${can ? `<button type="button" class="btn small outline edit-caisse" data-id="${c._id}">${t('edit')}</button>
                <button type="button" class="btn small danger delete-caisse" data-id="${c._id}">${t('delete')}</button>` : ''}
            </div>
          </article>`;
        }).join('') || `<div class="panel empty">${esc(t('noCaisse'))}</div>`}
      </div>
      <div class="panel"><h3>${t('sessions')}</h3>
        ${dataTable(
          [t('caisse'), t('seller'), t('open'), t('closeCash'), t('cashIn'), t('diff'), t('status')],
          cache.sessions.map((s) => `
            <tr>
              <td><strong>${esc(s.caisseName)}</strong><div class="muted">${esc(s.caisseCode || '')}</div></td>
              <td>${esc(s.userName)} · ${esc(s.userRole)}</td>
              <td>${new Date(s.openedAt).toLocaleString(getLang())}</td>
              <td>${s.closedAt ? new Date(s.closedAt).toLocaleString(getLang()) : '—'}</td>
              <td>${money(s.cashIn)}</td>
              <td class="${Number(s.difference) ? 'minus' : ''}">${s.difference == null ? '—' : money(s.difference)}</td>
              <td>${statusTag(s.status)}</td>
            </tr>`).join('')
        )}
      </div>`;
  }

  function caisseForm(c = null) {
    const userOpts = (cache.users || []).map((u) => {
      const sel = (c?.assignedUsers || []).map(String).includes(String(u._id)) ? 'selected' : '';
      return `<option value="${u._id}" ${sel}>${esc(u.name)} (${esc(u.role)})</option>`;
    }).join('');
    return `<form id="caisseForm" class="form-grid">
      <label>${t('code')}<input name="code" value="${esc(c?.code || '')}" placeholder="CAISSE-04" /></label>
      <label>${t('name')}<input name="name" required value="${esc(c?.name || '')}" /></label>
      <label>${t('location')}<input name="location" value="${esc(c?.location || '')}" /></label>
      <label>${t('type')}<select name="kind">
        ${['shop', 'event', 'web', 'mobile'].map((k) => `<option value="${k}" ${c?.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
      </select></label>
      <label>${t('float')}<input type="number" step="0.001" name="openingFloat" value="${c?.openingFloat ?? 200}" /></label>
      <label>${t('status')}<select name="status">
        <option value="active" ${c?.status !== 'inactive' ? 'selected' : ''}>${t('active')}</option>
        <option value="inactive" ${c?.status === 'inactive' ? 'selected' : ''}>${t('inactive')}</option>
      </select></label>
      <label class="full">${t('assigned')}
        <select name="assignedUsers" multiple size="4">${userOpts}</select>
      </label>
      <label class="full">${t('note')}<input name="note" value="${esc(c?.note || '')}" /></label>
      ${c ? `<input type="hidden" name="id" value="${c._id}" />` : ''}
    </form>`;
  }

  async function renderSponsors() {
    const data = await api('/api/sponsors' + (sponsorFilter !== 'all' ? '?status=' + encodeURIComponent(sponsorFilter) : ''));
    cache.sponsors = data?.sponsors || [];
    const can = permissions.manageSponsors;
    content.innerHTML = `
      ${pageHead(t('sponsors'), can ? `<button type="button" class="btn primary" id="btnNewSponsor">+ ${t('newSponsor')}</button>` : '', t('sponsorsSub'))}
      <div class="filters" id="sponsorFilters">
        ${['all', 'active', 'pending', 'paused', 'expired'].map((s) =>
          `<button type="button" class="chip ${sponsorFilter === s ? 'active' : ''}" data-status="${s}">${s === 'all' ? t('all') : t(s)}</button>`
        ).join('')}
      </div>
      <div class="sponsor-grid">
        ${cache.sponsors.map((sp) => `
          <article class="sponsor-card pkg-${esc(sp.package)}">
            <div class="sponsor-top">
              ${sp.logoUrl ? `<img src="${esc(sp.logoUrl)}" alt="" />` : `<div class="sponsor-logo">${esc((sp.name || '?').slice(0, 2).toUpperCase())}</div>`}
              <div>
                <h3>${esc(sp.name)}</h3>
                <span class="tag pkg">${esc(sp.package)}</span>
                ${statusTag(sp.status)}
              </div>
            </div>
            <p class="muted">${esc(sp.company || '')} · ${esc(sp.contact || '')}</p>
            <p class="price">${money(sp.amountTnd)}</p>
            <p class="meta"><span>${esc(sp.phone || '')}</span><span>${esc(sp.email || '')}</span></p>
            <p class="benefits">${esc(sp.benefits || '')}</p>
            <div class="till-actions">
              <button type="button" class="btn small outline view-sponsor" data-id="${sp._id}">${t('profile')}</button>
              ${can ? `<button type="button" class="btn small dark edit-sponsor" data-id="${sp._id}">${t('edit')}</button>
                <button type="button" class="btn small danger delete-sponsor" data-id="${sp._id}">${t('delete')}</button>` : ''}
            </div>
          </article>`).join('') || `<div class="panel empty">${esc(t('noSponsors'))}</div>`}
      </div>`;
  }

  function sponsorForm(sp = null) {
    return `<form id="sponsorForm" class="form-grid">
      <label>${t('code')}<input name="code" value="${esc(sp?.code || '')}" /></label>
      <label>${t('name')}<input name="name" required value="${esc(sp?.name || '')}" /></label>
      <label>${t('company')}<input name="company" value="${esc(sp?.company || '')}" /></label>
      <label>${t('contact')}<input name="contact" value="${esc(sp?.contact || '')}" /></label>
      <label>Email<input name="email" value="${esc(sp?.email || '')}" /></label>
      <label>${t('phone')}<input name="phone" value="${esc(sp?.phone || '')}" /></label>
      <label>Website<input name="website" value="${esc(sp?.website || '')}" /></label>
      <label>Logo URL<input name="logoUrl" value="${esc(sp?.logoUrl || '')}" /></label>
      <label>${t('package')}<select name="package">
        ${['bronze', 'silver', 'gold', 'platinum', 'partner'].map((p) => `<option value="${p}" ${sp?.package === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select></label>
      <label>${t('amount')}<input type="number" step="0.001" name="amountTnd" value="${sp?.amountTnd ?? 0}" /></label>
      <label>${t('status')}<select name="status">
        ${['active', 'pending', 'paused', 'expired'].map((s) => `<option value="${s}" ${sp?.status === s ? 'selected' : ''}>${t(s)}</option>`).join('')}
      </select></label>
      <label>${t('from')}<input type="date" name="startDate" value="${isoDate(sp?.startDate)}" /></label>
      <label>${t('to')}<input type="date" name="endDate" value="${isoDate(sp?.endDate)}" /></label>
      <label class="full">${t('benefits')}<textarea name="benefits" rows="2">${esc(sp?.benefits || '')}</textarea></label>
      <label class="full">${t('note')}<textarea name="notes" rows="2">${esc(sp?.notes || '')}</textarea></label>
      ${sp ? `<input type="hidden" name="id" value="${sp._id}" />` : ''}
    </form>`;
  }

  function sponsorProfile(sp) {
    return `<div class="sponsor-profile">
      <div class="sponsor-top">
        ${sp.logoUrl ? `<img src="${esc(sp.logoUrl)}" alt="" />` : `<div class="sponsor-logo">${esc((sp.name || '?').slice(0, 2).toUpperCase())}</div>`}
        <div>
          <h3>${esc(sp.name)}</h3>
          <p>${statusTag(sp.package)} ${statusTag(sp.status)}</p>
        </div>
      </div>
      <dl class="profile-dl">
        <div><dt>${t('company')}</dt><dd>${esc(sp.company || '—')}</dd></div>
        <div><dt>${t('contact')}</dt><dd>${esc(sp.contact || '—')}</dd></div>
        <div><dt>Email</dt><dd>${esc(sp.email || '—')}</dd></div>
        <div><dt>${t('phone')}</dt><dd>${esc(sp.phone || '—')}</dd></div>
        <div><dt>${t('amount')}</dt><dd>${money(sp.amountTnd)}</dd></div>
        <div><dt>${t('from')} → ${t('to')}</dt><dd>${isoDate(sp.startDate) || '—'} → ${isoDate(sp.endDate) || '—'}</dd></div>
      </dl>
      <p>${esc(sp.benefits || '')}</p>
      <p class="muted">${esc(sp.notes || '')}</p>
    </div>`;
  }

  async function renderUsers() {
    const [udata, desk] = await Promise.all([api('/api/users'), api('/api/caisses')]);
    cache.users = udata?.users || [];
    cache.caisses = desk?.caisses || [];
    const crud = permissions.crud || {};
    const canCreate = permissions.manageUsers;
    const canDelete = currentUser?.role === 'admin';
    const roles = ['admin', 'manager', 'seller'];
    const filtered = userRoleFilter === 'all' ? cache.users : cache.users.filter((u) => u.role === userRoleFilter);
    content.innerHTML = `
      ${pageHead(t('users'), canCreate ? `<button type="button" class="btn primary" id="btnNewUser">+ ${t('newUser')}</button>` : '', t('usersSub'))}
      <div class="role-matrix">
        ${roles.map((r) => `
          <button type="button" class="role-card ${userRoleFilter === r ? 'active' : ''}" data-role="${r}">
            <strong>${t('role_' + r)}</strong>
            <ul>
              <li>${t('crudUsers')}: ${esc(ROLE_CRUD_LABEL(r, 'users'))}</li>
              <li>${t('caisse')}: ${esc(ROLE_CRUD_LABEL(r, 'caisses'))}</li>
              <li>${t('sponsors')}: ${esc(ROLE_CRUD_LABEL(r, 'sponsors'))}</li>
              <li>POS: ${esc(ROLE_CRUD_LABEL(r, 'pos'))}</li>
            </ul>
          </button>`).join('')}
      </div>
      <div class="filters" id="userFilters">
        <button type="button" class="chip ${userRoleFilter === 'all' ? 'active' : ''}" data-role="all">${t('all')}</button>
        ${roles.map((r) => `<button type="button" class="chip ${userRoleFilter === r ? 'active' : ''}" data-role="${r}">${t('role_' + r)}</button>`).join('')}
      </div>
      ${dataTable(
        [t('name'), 'Email', t('role'), t('caisse'), t('status'), ''],
        filtered.map((u) => `
          <tr>
            <td><strong>${esc(u.name)}</strong></td>
            <td>${esc(u.email)}</td>
            <td>${statusTag(u.role)}</td>
            <td>${esc(u.defaultCaisse?.name || u.defaultCaisse?.code || '—')}</td>
            <td>${u.active === false ? statusTag('inactive') : statusTag('active')}</td>
            <td class="actions-cell">
              ${canCreate ? `<button type="button" class="btn small outline edit-user" data-id="${u._id}">${t('edit')}</button>` : ''}
              ${canDelete ? `<button type="button" class="btn small danger delete-user" data-id="${u._id}">${t('delete')}</button>` : ''}
            </td>
          </tr>`).join('')
      )}
      <p class="muted">${t('crudHint')} · ${t('yourRole')}: <strong>${esc(currentUser?.role || '')}</strong> · users ${esc(crud.users || '')}</p>`;
  }

  function ROLE_CRUD_LABEL(role, key) {
    const map = {
      admin: { users: 'CRUD', caisses: 'CRUD', sponsors: 'CRUD', purchases: 'CRUD', pos: 'sell' },
      manager: { users: 'sellers', caisses: 'CRUD', sponsors: 'CRUD', purchases: 'CRUD', pos: 'sell' },
      seller: { users: '—', caisses: 'open/close', sponsors: 'read', pos: 'sell' }
    };
    return (map[role] || map.seller)[key];
  }

  function userForm(u = null) {
    const actor = currentUser?.role;
    const roles = actor === 'admin' ? ['admin', 'manager', 'seller'] : ['seller'];
    const caisseOpts = (cache.caisses || []).map((c) => {
      const id = c._id;
      const cur = u?.defaultCaisse?._id || u?.defaultCaisse;
      return `<option value="${id}" ${String(cur) === String(id) ? 'selected' : ''}>${esc(c.name)}</option>`;
    }).join('');
    return `<form id="userForm" class="form-grid">
      <label>${t('name')}<input name="name" required value="${esc(u?.name || '')}" /></label>
      <label>Email<input type="email" name="email" required value="${esc(u?.email || '')}" /></label>
      <label>${t('password')}<input type="password" name="password" ${u ? '' : 'required'} placeholder="${u ? t('leaveBlank') : ''}" /></label>
      <label>${t('phone')}<input name="phone" value="${esc(u?.phone || '')}" /></label>
      <label>${t('role')}<select name="role">
        ${roles.map((r) => `<option value="${r}" ${u?.role === r ? 'selected' : ''}>${t('role_' + r)}</option>`).join('')}
      </select></label>
      <label>${t('caisse')}<select name="defaultCaisse"><option value="">—</option>${caisseOpts}</select></label>
      <label>${t('status')}<select name="active">
        <option value="true" ${u?.active !== false ? 'selected' : ''}>${t('active')}</option>
        <option value="false" ${u?.active === false ? 'selected' : ''}>${t('inactive')}</option>
      </select></label>
      ${u ? `<input type="hidden" name="id" value="${u._id}" />` : ''}
    </form>`;
  }

  async function renderReturns() {
    const data = await api('/api/returns');
    content.innerHTML = pageHead(t('returns')) + dataTable(
      [t('number'), t('type'), t('party'), t('related'), t('amount'), t('reason'), t('date')],
      (data?.returns || []).map((r) => `
        <tr><td>${esc(r.returnNo)}</td><td>${statusTag(r.type)}</td><td>${esc(r.partyName)}</td>
        <td>${esc(r.relatedNo)}</td><td>${money(r.totalAmount)}</td><td>${esc(r.reason)}</td>
        <td>${new Date(r.date).toLocaleDateString(getLang())}</td></tr>`).join('')
    );
  }

  async function renderBanks() {
    const data = await api('/api/banks');
    content.innerHTML = pageHead(t('banks')) + dataTable(
      [t('bank'), t('account'), t('branch'), t('balance')],
      (data?.banks || []).map((b) => `
        <tr><td>${esc(b.name)}</td><td>${esc(b.accountNo)}</td><td>${esc(b.branch)}</td>
        <td><strong>${money(b.balance)}</strong></td></tr>`).join('')
    );
  }

  async function renderAccounts() {
    const [tx, closings] = await Promise.all([api('/api/transactions'), api('/api/closings')]);
    content.innerHTML = `
      ${pageHead(t('accounts'))}
      <div class="grid-2">
        <div class="panel"><h3>${t('transactions')}</h3>
          ${dataTable(['Txn', t('type'), t('party'), t('mode'), t('amount')], (tx?.transactions || []).map((row) => `
            <tr><td>${esc(row.txnNo)}</td><td>${esc(row.type)}</td><td>${esc(row.partyName)}</td>
            <td>${esc(row.mode)}</td><td>${money(row.amount)}</td></tr>`).join(''))}
        </div>
        <div class="panel"><h3>${t('cashClosings')}</h3>
          ${dataTable([t('date'), t('open'), t('in'), t('out'), t('closeCash')], (closings?.closings || []).map((c) => `
            <tr><td>${new Date(c.date).toLocaleDateString(getLang())}</td><td>${money(c.opening)}</td>
            <td>${money(c.cashIn)}</td><td>${money(c.cashOut)}</td><td><strong>${money(c.closing)}</strong></td></tr>`).join(''))}
        </div>
      </div>`;
  }

  async function renderReports() {
    const data = await api('/api/reports/overview');
    content.innerHTML = `
      ${pageHead(t('reports'))}
      <div class="grid-2">
        <div class="panel"><h3>${t('salesReport')}</h3>${dataTable([t('number'), t('client'), t('total'), t('due')], (data?.salesReport || []).map((i) => `
          <tr><td>${esc(i.invoiceNo)}</td><td>${esc(i.customerName)}</td><td>${money(i.totalAmount)}</td><td>${money(i.dueAmount)}</td></tr>`).join(''))}</div>
        <div class="panel"><h3>${t('purchaseReport')}</h3>${dataTable([t('number'), t('supplier'), t('total'), t('due')], (data?.purchaseReport || []).map((p) => `
          <tr><td>${esc(p.purchaseNo)}</td><td>${esc(p.supplierName)}</td><td>${money(p.grandTotal)}</td><td>${money(p.dueAmount)}</td></tr>`).join(''))}</div>
        <div class="panel"><h3>${t('cashBook')}</h3>${dataTable(['Txn', t('type'), t('amount')], (data?.cashBook || []).map((row) => `
          <tr><td>${esc(row.txnNo)}</td><td>${esc(row.type)}</td><td>${money(row.amount)}</td></tr>`).join(''))}</div>
        <div class="panel"><h3>${t('bankBook')}</h3>${dataTable(['Txn', t('bank'), t('amount')], (data?.bankBook || []).map((row) => `
          <tr><td>${esc(row.txnNo)}</td><td>${esc(row.bankName || '')}</td><td>${money(row.amount)}</td></tr>`).join(''))}</div>
      </div>
      <div class="panel"><h3>${t('lowStockReport')}</h3>${dataTable([t('sku'), t('product'), t('qty'), t('min')], (data?.lowStock || []).map((p) => `
        <tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td class="minus">${p.stockQty}</td><td>${p.minStock}</td></tr>`).join(''))}</div>`;
  }

  function canApproveRow(row) {
    if (!permissions.approveHr || row.status !== 'pending') return false;
    const target = row.userRole || 'seller';
    if (currentUser?.role === 'admin') return true;
    if (row.userEmail && row.userEmail === currentUser?.email) return false;
    return target === 'seller';
  }

  async function renderHrm() {
    const data = await api('/api/hrm');
    cache.employees = data?.employees || [];
    const can = permissions.approveHr;
    const inbox = data?.inbox || { leaves: [], advances: [] };
    const isStaff = currentUser?.role === 'manager' || currentUser?.role === 'seller';
    content.innerHTML = `
      ${pageHead(t('hrm'), `
        ${isStaff ? `<button type="button" class="btn primary" id="btnAskLeave">${icon('palmtree')} ${t('askLeave')}</button>
        <button type="button" class="btn outline" id="btnAskAdvance">${icon('wallet')} ${t('askAdvance')}</button>` : ''}
        ${can ? `
        <button type="button" class="btn dark" id="btnAddPresence">${icon('user-check')} Presence</button>
        <button type="button" class="btn outline" id="btnAddLeave">${icon('user-plus')} ${t('askLeaveOnBehalf')}</button>
        <button type="button" class="btn outline goto" data-id="calendar">${icon('calendar-days')} Calendar</button>
      ` : `<button type="button" class="btn outline goto" data-id="calendar">${icon('calendar-days')} Calendar</button>`}
      `, t('hrmInboxSub'))}
      ${(inbox.leaves.length || inbox.advances.length) ? `
      <div class="panel inbox-panel">
        <h3>${icon('inbox')} ${t('pendingInbox')}</h3>
        ${inbox.leaves.map((l) => `
          <div class="inbox-row">
            <div><strong>${esc(l.employeeName || l.userEmail)}</strong> · ${esc(l.userRole || '')} · ${esc(l.type)}
              <div class="muted">${new Date(l.fromDate).toLocaleDateString(getLang())} → ${new Date(l.toDate).toLocaleDateString(getLang())} · ${esc(l.reason || '')}</div></div>
            <div class="actions-cell">
              <button class="btn small primary leave-action" data-id="${l._id}" data-status="approved">${t('approve')}</button>
              <button class="btn small danger leave-action" data-id="${l._id}" data-status="rejected">${t('reject')}</button>
            </div>
          </div>`).join('')}
        ${inbox.advances.map((a) => `
          <div class="inbox-row">
            <div><strong>${esc(a.userName)}</strong> · ${esc(a.userRole || '')}
              <div class="muted">${t('salaryAdvance')} ${money(a.amount)} / ${money(a.salaryAmount)} · ${esc(a.reason || '')}</div></div>
            <div class="actions-cell">
              <button class="btn small primary advance-action" data-id="${a._id}" data-status="approved">${t('approve')}</button>
              <button class="btn small dark advance-action" data-id="${a._id}" data-status="paid">${t('pay')}</button>
              <button class="btn small danger advance-action" data-id="${a._id}" data-status="rejected">${t('reject')}</button>
            </div>
          </div>`).join('')}
      </div>` : ''}
      <div class="panel"><h3>${t('organisation')}</h3>
        <div class="meta">${(data?.departments || []).map((d) => `<span>${esc(d.name)}</span>`).join('')}
        ${(data?.designations || []).map((d) => `<span>${esc(d.name)}</span>`).join('')}</div>
      </div>
      ${dataTable([t('code'), t('name'), t('role'), t('dept'), t('salary'), t('phone')], (data?.employees || []).map((e) => `
        <tr><td>${esc(e.code)}</td><td>${esc(e.name)}</td><td>${esc(e.designation)}</td>
        <td>${esc(e.department)}</td><td>${money(e.salary)}</td><td>${esc(e.phone)}</td></tr>`).join(''))}
      <div class="grid-2">
        <div class="panel"><h3>${t('attendance')}</h3>${dataTable([t('employees'), t('date'), t('in'), t('out'), t('hours')], (data?.attendance || []).map((a) => `
          <tr><td>${esc(a.employeeName)}</td><td>${new Date(a.date).toLocaleDateString(getLang())}</td>
          <td>${esc(a.inTime)}</td><td>${esc(a.outTime)}</td><td>${a.stayHours}</td></tr>`).join(''))}</div>
        <div class="panel"><h3>${t('salaries')}</h3>${dataTable([t('employees'), t('month'), t('amount'), t('paid'), t('status'), ''], (data?.salaries || []).map((row) => `
          <tr><td>${esc(row.employeeName)}</td><td>${esc(row.month)}</td><td>${money(row.amount)}</td>
          <td>${money(row.paidAmount)}</td><td>${statusTag(row.status)}</td>
          <td class="actions-cell">${can && ['pending', 'generated', 'approved'].includes(row.status) ? `
            ${row.status !== 'approved' && row.status !== 'paid' ? `<button class="btn small dark salary-action" data-id="${row._id}" data-status="approved">Approve</button>` : ''}
            ${row.status === 'approved' || row.status === 'pending' ? `<button class="btn small primary salary-action" data-id="${row._id}" data-status="paid">Pay</button>` : ''}
            <button class="btn small danger salary-action" data-id="${row._id}" data-status="rejected">Reject</button>
          ` : ''}</td></tr>`).join(''))}</div>
      </div>
      <div class="panel"><h3>${t('salaryAdvances')}</h3>
        ${dataTable([t('name'), t('role'), t('month'), t('amount'), t('status'), ''], (data?.advances || []).map((row) => `
          <tr>
            <td>${esc(row.userName || row.employeeName)}</td>
            <td>${esc(row.userRole || '')}</td>
            <td>${esc(row.month)}</td>
            <td>${money(row.amount)}</td>
            <td>${statusTag(row.status)}</td>
            <td class="actions-cell">${canApproveRow(row) ? `
              <button class="btn small primary advance-action" data-id="${row._id}" data-status="approved">${t('approve')}</button>
              <button class="btn small dark advance-action" data-id="${row._id}" data-status="paid">${t('pay')}</button>
              <button class="btn small danger advance-action" data-id="${row._id}" data-status="rejected">${t('reject')}</button>
            ` : esc(row.reason || '')}</td>
          </tr>`).join(''))}
      </div>
      <div class="panel"><h3>${t('leaveApprovals')}</h3>
        ${dataTable([t('employees'), t('role'), 'From', 'To', 'Days', 'Type', t('status'), ''], (data?.leaves || []).map((l) => `
          <tr>
            <td>${esc(l.employeeName)}</td>
            <td>${esc(l.userRole || '')}</td>
            <td>${new Date(l.fromDate).toLocaleDateString(getLang())}</td>
            <td>${new Date(l.toDate).toLocaleDateString(getLang())}</td>
            <td>${l.days}</td>
            <td>${esc(l.type)}</td>
            <td>${statusTag(l.status)}</td>
            <td class="actions-cell">${canApproveRow(l) ? `
              <button class="btn small primary leave-action" data-id="${l._id}" data-status="approved">${t('approve')}</button>
              <button class="btn small danger leave-action" data-id="${l._id}" data-status="rejected">${t('reject')}</button>
            ` : esc(l.reason || '')}</td>
          </tr>`).join(''))}
      </div>`;
  }

  async function renderRequests() {
    const data = await api('/api/hrm/me');
    const snap = data?.salary || {};
    content.innerHTML = `
      ${pageHead(t('requests'), `
        <button type="button" class="btn primary" id="btnAskLeave">${icon('palmtree')} ${t('askLeave')}</button>
        <button type="button" class="btn outline" id="btnAskAdvance">${icon('wallet')} ${t('askAdvance')}</button>
      `, t('requestsSub'))}
      <div class="hero-card">
        <h2>${esc(data?.employee?.name || currentUser?.name || '')}</h2>
        <p>${t('remainingSalary')}: <strong>${money(snap.remaining)}</strong> / ${money(snap.base)} · ${esc(data?.month || '')}</p>
      </div>
      <div class="grid-2">
        <div class="panel"><h3>${t('myLeaves')}</h3>
          ${dataTable([t('type'), t('from'), t('to'), t('status'), t('reason')], (data?.leaves || []).map((l) => `
            <tr>
              <td>${esc(l.type)}</td>
              <td>${new Date(l.fromDate).toLocaleDateString(getLang())}</td>
              <td>${new Date(l.toDate).toLocaleDateString(getLang())}</td>
              <td>${statusTag(l.status)}</td>
              <td>${esc(l.reason || '')}</td>
            </tr>`).join(''))}
        </div>
        <div class="panel"><h3>${t('salaryAdvances')}</h3>
          ${dataTable([t('month'), t('amount'), t('status'), t('reason')], (data?.advances || []).map((a) => `
            <tr>
              <td>${esc(a.month)}</td>
              <td>${money(a.amount)}</td>
              <td>${statusTag(a.status)}</td>
              <td>${esc(a.reason || '')}</td>
            </tr>`).join(''))}
        </div>
      </div>`;
  }

  async function renderCalendar() {
    const data = await api('/api/calendar?month=' + encodeURIComponent(calendarMonth));
    const events = data?.events || [];
    const byDay = {};
    events.forEach((ev) => {
      const key = new Date(ev.date).toISOString().slice(0, 10);
      (byDay[key] ||= []).push(ev);
    });
    const [y, m] = calendarMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push('<div class="cal-cell empty"></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${calendarMonth}-${String(d).padStart(2, '0')}`;
      const dayEvents = byDay[key] || [];
      cells.push(`<div class="cal-cell">
        <strong>${d}</strong>
        ${dayEvents.map((ev) => `<span class="cal-ev ${esc(ev.type)} ${esc(ev.status || '')}">${esc(ev.title)} · ${esc(ev.meta || '')}</span>`).join('')}
      </div>`);
    }
    content.innerHTML = `
      ${pageHead('Calendar', `
        <button type="button" class="btn outline" id="calPrev">‹</button>
        <input type="month" id="calMonth" value="${esc(calendarMonth)}" />
        <button type="button" class="btn outline" id="calNext">›</button>
      `, 'Presence & day-off overview')}
      <div class="calendar-grid">${cells.join('')}</div>
      <div class="panel"><h3>This month</h3>
        ${dataTable(['Date', 'Type', 'Who', 'Detail', t('status')], events.map((ev) => `
          <tr>
            <td>${new Date(ev.date).toLocaleDateString(getLang())}</td>
            <td>${statusTag(ev.type)}</td>
            <td>${esc(ev.title)}</td>
            <td>${esc(ev.meta || '')}</td>
            <td>${ev.status ? statusTag(ev.status) : '—'}</td>
          </tr>`).join(''))}
      </div>`;
  }

  async function renderSettings() {
    const [data, dash] = await Promise.all([api('/api/settings'), api('/api/dashboard')]);
    const s = data?.settings || {};
    const st = dash?.stats || {};
    const hasKeys = !!(s.consumerKey && s.consumerSecret);
    content.innerHTML = `
      ${pageHead(t('settings'), `
        <a class="btn outline" href="https://hotsport.tn/wp-admin/" target="_blank" rel="noopener">${icon('external-link')} ${t('wpAdmin')}</a>
      `, t('settingsSub'))}

      <div class="settings-hero">
        <div class="settings-brand">
          <img src="/icons/icon-192.png" alt="" width="56" height="56" />
          <div>
            <h2>${esc(s.storeName || 'HotSport Stock')}</h2>
            <p>${icon('map-pin')} Tunisia · ${icon('coins')} ${esc(s.currency || 'TND')} · ${icon('link')} <a href="${esc(s.storeUrl || 'https://hotsport.tn')}" target="_blank" rel="noopener">${esc(s.storeUrl || 'https://hotsport.tn')}</a></p>
          </div>
        </div>
        <div class="settings-status ${hasKeys ? 'ok' : 'warn'}">
          ${icon(hasKeys ? 'shield-check' : 'shield-alert')}
          <div>
            <strong>${hasKeys ? t('apiConfigured') : t('demoModeStatus')}</strong>
            <span>${hasKeys ? t('readyLive') : t('addKeys')}</span>
          </div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card"><div class="info-ico">${icon('package')}</div><div><strong>${st.products || 0}</strong><span>${t('activeProducts')}</span></div></div>
        <div class="info-card"><div class="info-ico warn">${icon('triangle-alert')}</div><div><strong>${st.stock?.lowStock || 0}</strong><span>${t('lowStock')}</span></div></div>
        <div class="info-card"><div class="info-ico">${icon('shopping-bag')}</div><div><strong>${st.pendingOrders || 0}</strong><span>${t('ordersInProgress')}</span></div></div>
        <div class="info-card"><div class="info-ico">${icon('refresh-cw')}</div><div><strong>${s.autoSync ? 'ON' : 'OFF'}</strong><span>${t('autoSyncStock')}</span></div></div>
      </div>

      <div class="settings-layout">
        <section class="settings-card">
          <header class="settings-card-head">
            <div class="settings-card-ico">${icon('store')}</div>
            <div>
              <h3>${t('wooStore')}</h3>
              <p>${t('wooStoreSub')}</p>
            </div>
          </header>
          <div class="settings-form">
            <label class="field">
              <span class="field-label">${icon('link')} ${t('storeUrl')}</span>
              <input id="storeUrl" type="url" value="${esc(s.storeUrl || 'https://hotsport.tn')}" />
              <small>${t('exampleUrl')}</small>
            </label>
            <div class="form-grid">
              <label class="field">
                <span class="field-label">${icon('key-round')} ${t('consumerKey')}</span>
                <input id="consumerKey" type="text" value="${esc(s.consumerKey || '')}" placeholder="ck_xxxxxxxx" autocomplete="off" />
                <small>${t('wooApiHint')}</small>
              </label>
              <label class="field">
                <span class="field-label">${icon('lock')} ${t('consumerSecret')}</span>
                <input id="consumerSecret" type="password" value="${esc(s.consumerSecret || '')}" placeholder="cs_xxxxxxxx" autocomplete="new-password" />
                <small>${t('permissionsRW')}</small>
              </label>
            </div>
            <label class="field">
              <span class="field-label">${icon('git-branch')} ${t('syncDirection')}</span>
              <select id="syncDirection">
                <option value="both" ${(!s.syncDirection || s.syncDirection === 'both') ? 'selected' : ''}>${t('syncBoth')}</option>
                <option value="pull" ${s.syncDirection === 'pull' ? 'selected' : ''}>${t('syncPull')}</option>
                <option value="push" ${s.syncDirection === 'push' ? 'selected' : ''}>${t('syncPush')}</option>
              </select>
              <small>${t('syncHint')}</small>
            </label>
          </div>
        </section>

        <section class="settings-card">
          <header class="settings-card-head">
            <div class="settings-card-ico">${icon('warehouse')}</div>
            <div>
              <h3>${t('alertsInventory')}</h3>
              <p>${t('alertsSub')}</p>
            </div>
          </header>
          <div class="settings-form">
            <label class="field">
              <span class="field-label">${icon('gauge')} ${t('lowThreshold')}</span>
              <input id="lowStockThreshold" type="number" min="0" value="${s.lowStockThreshold || 5}" />
              <small>${t('lowThresholdHint')}</small>
            </label>
            <label class="switch-row">
              <span>
                <strong>${icon('refresh-cw')} ${t('autoSyncAdjust')}</strong>
                <small>${t('autoSyncHint')}</small>
              </span>
              <input id="autoSync" type="checkbox" ${s.autoSync ? 'checked' : ''} />
            </label>
            <label class="switch-row">
              <span>
                <strong>${icon('flask-conical')} ${t('demoMode')}</strong>
                <small>${t('demoModeHint')}</small>
              </span>
              <input type="checkbox" ${s.demoMode !== false ? 'checked' : ''} disabled />
            </label>
          </div>
        </section>

        <section class="settings-card full">
          <header class="settings-card-head">
            <div class="settings-card-ico">${icon('circle-help')}</div>
            <div>
              <h3>${t('quickGuide')}</h3>
              <p>${t('quickGuideSub')}</p>
            </div>
          </header>
          <ol class="guide-list">
            <li><span class="step">1</span><div><strong>${t('guide1Title')}</strong><p>${t('guide1Text')}</p></div></li>
            <li><span class="step">2</span><div><strong>${t('guide2Title')}</strong><p>${t('guide2Text')}</p></div></li>
            <li><span class="step">3</span><div><strong>${t('guide3Title')}</strong><p>${t('guide3Text')}</p></div></li>
          </ol>
          <div class="settings-actions">
            <button type="button" class="btn primary" id="saveSettings">${icon('save')} ${t('saveSettings')}</button>
            <button type="button" class="btn dark" id="testWoo">${icon('plug-zap')} ${t('testWoo')}</button>
            <button type="button" class="btn outline goto" data-id="stock">${icon('package')} ${t('openEasyStock')}</button>
          </div>
          <p class="settings-msg" id="settingsMsg">${icon('info')} ${t('currency')} : <strong>${esc(s.currency || 'TND')}</strong> · ${t('timezone')} Africa/Tunis · DB hotsport_stock</p>
        </section>
      </div>`;
    icons();
  }

  const renderers = {
    dashboard: renderDashboard, orders: renderOrders, stock: renderStock, items: renderItems,
    customers: renderCustomers, suppliers: renderSuppliers, purchases: renderPurchases,
    invoices: renderInvoices, pos: renderPos, caisse: renderCaisse, sponsors: renderSponsors, users: renderUsers,
    returns: renderReturns, banks: renderBanks,
    accounts: renderAccounts, reports: renderReports, hrm: renderHrm, requests: renderRequests, calendar: renderCalendar, settings: renderSettings
  };

  async function go(id) {
    stopScan();
    current = id;
    if (location.hash.replace('#', '') !== id) {
      try { history.replaceState(null, '', '#' + id); } catch (_) {}
    }
    renderNav();
    setNavOpen(false);
    await (renderers[id] || renderDashboard)();
    icons();
    const focusEl = content.querySelector('#posBarcode, #receiveBarcode, input[type="search"]');
    if (focusEl && window.matchMedia('(min-width: 981px)').matches) {
      setTimeout(() => focusEl.focus(), 60);
    }
  }
  window.__hsGo = go;

  async function adjust(id, qtyChange, extra = {}) {
    const data = await api('/api/products/' + id + '/adjust', {
      method: 'POST', body: JSON.stringify({ qtyChange, pushWoo: true, ...extra })
    });
    if (data?.ok) { showToast(data.message); await go(current === 'pos' ? 'pos' : 'stock'); }
    else if (data) showToast(data.message || 'Erreur');
  }

  function formToObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (btn) go(btn.dataset.id);
  });

  content.addEventListener('click', async (e) => {
    const el = e.target;
    if (el.closest('.goto')) return go(el.closest('.goto').dataset.id);

    if (el.closest('#btnNewOrder')) {
      if (!cache.products.length) {
        const p = await api('/api/products');
        cache.products = p?.products || [];
      }
      return showNewOrderModal();
    }
    if (el.closest('.view-order')) return showOrder(el.closest('.view-order').dataset.id);
    if (el.closest('.edit-order-status')) return showOrderStatusModal(el.closest('.edit-order-status').dataset.id);

    if (el.closest('#orderFilters .chip')) {
      orderFilter = el.closest('.chip').dataset.status;
      return renderOrders();
    }
    if (el.closest('#stockFilters .chip')) {
      stockFilter = el.closest('.chip').dataset.filter;
      return renderStock();
    }
    if (el.closest('#posRescan')) {
      lastReceipt = null;
      posCart = [];
      paintCart();
      const inp = document.getElementById('posBarcode');
      if (inp) { inp.value = ''; inp.focus(); }
      const box = document.getElementById('receiptBox');
      if (box) box.hidden = true;
      return;
    }
    if (el.closest('.salary-action')) {
      const btn = el.closest('.salary-action');
      const data = await api('/api/hrm/salaries/' + btn.dataset.id, {
        method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status })
      });
      showToast(data?.message || 'Salary');
      if (data?.ok) return go(current);
      return;
    }
    if (el.closest('.leave-action')) {
      const btn = el.closest('.leave-action');
      const data = await api('/api/hrm/leaves/' + btn.dataset.id, {
        method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status })
      });
      showToast(data?.message || 'Leave');
      if (data?.ok) return go(current);
      return;
    }
    if (el.closest('.advance-action')) {
      const btn = el.closest('.advance-action');
      const data = await api('/api/hrm/advances/' + btn.dataset.id, {
        method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status })
      });
      showToast(data?.message || 'Advance');
      if (data?.ok) return go(current);
      return;
    }
    if (el.closest('#btnAskLeave')) {
      openModal(t('askLeave'), `<form id="myLeaveForm" class="form-grid">
        <label>From<input type="date" name="fromDate" required /></label>
        <label>To<input type="date" name="toDate" required /></label>
        <label>${t('type')}<select name="type">
          <option value="day_off">${t('dayOff')}</option>
          <option value="holiday">${t('holiday')}</option>
          <option value="annual">${t('annual')}</option>
          <option value="sick">${t('sick')}</option>
          <option value="unpaid">${t('unpaid')}</option>
        </select></label>
        <label class="full">${t('reason')}<input name="reason" /></label>
      </form>`, `<button class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button class="btn primary" id="saveMyLeave">${t('submitRequest')}</button>`);
      return;
    }
    if (el.closest('#btnAskAdvance')) {
      openModal(t('askAdvance'), `<form id="advanceForm" class="form-grid">
        <label>${t('amount')}<input type="number" step="0.001" min="1" name="amount" required /></label>
        <label>${t('month')}<input type="month" name="month" value="${new Date().toISOString().slice(0, 7)}" /></label>
        <label class="full">${t('reason')}<input name="reason" placeholder="${esc(t('salaryAdvance'))}" /></label>
      </form>`, `<button class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button class="btn primary" id="saveAdvance">${t('submitRequest')}</button>`);
      return;
    }
    if (el.closest('#btnAddPresence')) {
      const opts = (cache.employees || []).map((e) => `<option value="${e._id}">${esc(e.name)}</option>`).join('');
      openModal('Record presence', `<form id="presenceForm" class="form-grid">
        <label class="full">Employee<select name="employeeId" required>${opts}</select></label>
        <label>Date<input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" /></label>
        <label>In<input name="inTime" value="09:00" /></label>
        <label>Out<input name="outTime" value="17:00" /></label>
        <label>Hours<input type="number" step="0.1" name="stayHours" value="8" /></label>
      </form>`, `<button class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button class="btn primary" id="savePresence">${t('save')}</button>`);
      return;
    }
    if (el.closest('#btnAddLeave')) {
      const opts = (cache.employees || []).map((e) => `<option value="${e._id}">${esc(e.name)}</option>`).join('');
      openModal('Day-off request', `<form id="leaveForm" class="form-grid">
        <label class="full">Employee<select name="employeeId" required>${opts}</select></label>
        <label>From<input type="date" name="fromDate" required /></label>
        <label>To<input type="date" name="toDate" required /></label>
        <label>Type<select name="type">
          <option value="day_off">${t('dayOff')}</option>
          <option value="holiday">${t('holiday')}</option>
          <option value="sick">${t('sick')}</option>
          <option value="annual">${t('annual')}</option>
          <option value="unpaid">${t('unpaid')}</option>
        </select></label>
        <label class="full">Reason<input name="reason" /></label>
      </form>`, `<button class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button class="btn primary" id="saveLeave">Submit</button>`);
      return;
    }
    if (el.closest('#calPrev') || el.closest('#calNext')) {
      const [y, m] = calendarMonth.split('-').map(Number);
      const d = new Date(y, m - 1 + (el.closest('#calNext') ? 1 : -1), 1);
      calendarMonth = d.toISOString().slice(0, 7);
      return renderCalendar();
    }

    const qtyBtn = el.closest('.qty');
    if (qtyBtn) {
      return adjust(qtyBtn.closest('.card').dataset.id, Number(qtyBtn.dataset.delta), {
        reason: qtyBtn.dataset.delta === '1' ? 'Quick +1' : 'Quick -1'
      });
    }
    if (el.closest('.adjust-open')) {
      const card = el.closest('.card');
      document.getElementById('adjustId').value = card.dataset.id;
      document.getElementById('adjustTitle').textContent =
        `${t('adjustStock')} — ${card.querySelector('h3').textContent.trim()}`;
      document.getElementById('adjustQty').value = '';
      applyChrome();
      adjustModal.hidden = false;
      return;
    }
    if (el.closest('.pos-sell') || el.closest('.sell-product')) {
      const id = (el.closest('.pos-sell') || el.closest('.sell-product')).dataset.id;
      const p = (cache.products || []).find((x) => String(x._id) === String(id));
      if (p) offerSell(p, 1);
      if (current !== 'pos') await go('pos');
      else paintCart();
      return;
    }
    if (el.closest('.cart-drop')) {
      posCart.splice(Number(el.closest('.cart-drop').dataset.i), 1);
      refreshCheckoutUi();
      return;
    }
    if (el.closest('#restartScan')) {
      return cameraGranted ? startCheckoutScan(requestCamera()) : showPermGate('checkout');
    }
    if (el.closest('#posCheckout')) {
      return openCheckoutWithAuth();
    }
    if (el.closest('#posAddClient') || el.closest('#btnQuickClient')) {
      openModal(t('newCustomerTitle'), customerForm(), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveCustomer">${t('create')}</button>`);
      return;
    }
    if (el.closest('#posScanCam')) {
      return startScan();
    }
    if (el.closest('#stopScan')) {
      stopScan();
      return;
    }
    if (el.closest('.show-qr')) {
      const btn = el.closest('.show-qr');
      const p = (cache.products || []).find((x) => String(x._id) === String(btn.dataset.id));
      openModal(t('qrCode'), `
        <div class="qr-box">
          <img src="/api/products/${btn.dataset.id}/qr" alt="QR" width="220" height="220" />
          <p><strong>${esc(p?.name || '')}</strong></p>
          <code>${esc(btn.dataset.code || '')}</code>
        </div>`, `<button type="button" class="btn outline" id="modalCancel">${t('close')}</button>
        <button type="button" class="btn primary" onclick="window.print()">${t('printLabel')}</button>`);
      return;
    }
    if (el.closest('#notifyBtn')) {
      if (window.__hsEnablePush) window.__hsEnablePush();
      showToast(t('notifyOn'));
      return;
    }

    if (el.closest('#btnNewCaisse')) {
      openModal(t('newCaisse'), caisseForm(), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveCaisse">${t('create')}</button>`);
      return;
    }
    if (el.closest('.edit-caisse')) {
      const c = cache.caisses.find((x) => x._id === el.closest('.edit-caisse').dataset.id);
      openModal(t('editCaisse'), caisseForm(c), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveCaisse">${t('save')}</button>`);
      return;
    }
    if (el.closest('.delete-caisse')) {
      if (!confirm(t('deleteConfirm'))) return;
      const data = await api('/api/caisses/' + el.closest('.delete-caisse').dataset.id, { method: 'DELETE' });
      showToast(data?.message || t('delete'));
      if (data?.ok) return renderCaisse();
      return;
    }
    if (el.closest('.open-till')) {
      const btn = el.closest('.open-till');
      openModal(t('openTill'), `<form id="openTillForm" class="form-grid">
        <label class="full">${t('float')}<input type="number" step="0.001" name="openingCash" value="${btn.dataset.float || 0}" /></label>
        <label class="full">${t('note')}<input name="note" /></label>
        <input type="hidden" name="id" value="${btn.dataset.id}" />
      </form>`, `<button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveOpenTill">${t('openTill')}</button>`);
      return;
    }
    if (el.closest('.close-session')) {
      const id = el.closest('.close-session').dataset.id;
      const sess = (cache.sessions || []).concat(cache.caisses.map((c) => c.openSession).filter(Boolean))
        .find((s) => s && String(s._id) === String(id));
      const expected = sess ? expectedCash(sess) : 0;
      openModal(t('closeTill'), `<form id="closeTillForm" class="form-grid">
        <p class="full">${t('expectedCash')}: <strong>${money(expected)}</strong></p>
        <label class="full">${t('countedCash')}<input type="number" step="0.001" name="countedCash" value="${expected}" /></label>
        <label class="full">${t('note')}<input name="note" /></label>
        <input type="hidden" name="id" value="${id}" />
      </form>`, `<button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn dark" id="saveCloseTill">${t('closeTill')}</button>`);
      return;
    }
    if (el.closest('.till-pill')) {
      selectedCaisseId = el.closest('.till-pill').dataset.caisse;
      localStorage.setItem('hs_caisse_id', selectedCaisseId);
      return;
    }
    if (el.closest('#sponsorFilters .chip')) {
      sponsorFilter = el.closest('.chip').dataset.status;
      return renderSponsors();
    }
    if (el.closest('#btnNewSponsor')) {
      openModal(t('newSponsor'), sponsorForm(), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveSponsor">${t('create')}</button>`, true);
      return;
    }
    if (el.closest('.edit-sponsor')) {
      const sp = cache.sponsors.find((x) => x._id === el.closest('.edit-sponsor').dataset.id);
      openModal(t('editSponsor'), sponsorForm(sp), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveSponsor">${t('save')}</button>`, true);
      return;
    }
    if (el.closest('.view-sponsor')) {
      const sp = cache.sponsors.find((x) => x._id === el.closest('.view-sponsor').dataset.id);
      openModal(t('sponsorProfile'), sponsorProfile(sp), `<button type="button" class="btn outline" id="modalCancel">${t('close')}</button>`);
      return;
    }
    if (el.closest('.delete-sponsor')) {
      if (!confirm(t('deleteConfirm'))) return;
      const data = await api('/api/sponsors/' + el.closest('.delete-sponsor').dataset.id, { method: 'DELETE' });
      showToast(data?.message || t('delete'));
      if (data?.ok) return renderSponsors();
      return;
    }
    if (el.closest('#userFilters .chip') || el.closest('.role-card')) {
      userRoleFilter = el.closest('[data-role]').dataset.role;
      return renderUsers();
    }
    if (el.closest('#btnNewUser')) {
      openModal(t('newUser'), userForm(), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveUser">${t('create')}</button>`);
      return;
    }
    if (el.closest('.edit-user')) {
      const u = cache.users.find((x) => x._id === el.closest('.edit-user').dataset.id);
      openModal(t('editUser'), userForm(u), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveUser">${t('save')}</button>`);
      return;
    }
    if (el.closest('.delete-user')) {
      if (!confirm(t('deleteConfirm'))) return;
      const data = await api('/api/users/' + el.closest('.delete-user').dataset.id, { method: 'DELETE' });
      showToast(data?.message || t('delete'));
      if (data?.ok) return renderUsers();
      return;
    }

    if (el.closest('#btnNewProduct')) {
      openModal(t('newProduct'), productForm(), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveProduct">${t('create')}</button>`, true);
      return;
    }
    if (el.closest('.edit-product')) {
      const p = cache.products.find((x) => x._id === el.closest('.edit-product').dataset.id);
      openModal(t('editProduct'), productForm(p), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveProduct">${t('save')}</button>`, true);
      return;
    }
    if (el.closest('.archive-product')) {
      if (!confirm(t('archiveConfirm'))) return;
      const data = await api('/api/products/' + el.closest('.archive-product').dataset.id, { method: 'DELETE' });
      showToast(data?.message || t('archive'));
      return renderItems();
    }

    if (el.closest('#btnNewPurchase')) {
      return openPurchaseModal();
    }
    if (el.closest('.edit-purchase')) {
      const p = (cache.purchases || []).find((x) => String(x._id) === el.closest('.edit-purchase').dataset.id);
      return openPurchaseModal(p);
    }
    if (el.closest('.delete-purchase')) {
      if (!confirm(t('deleteConfirm'))) return;
      const data = await api('/api/purchases/' + el.closest('.delete-purchase').dataset.id, { method: 'DELETE' });
      showToast(data?.message || t('delete'));
      if (data?.ok) return renderPurchases();
      return;
    }

    if (el.closest('#btnNewCustomer')) {
      openModal(t('newCustomerTitle'), customerForm(), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveCustomer">${t('create')}</button>`);
      return;
    }
    if (el.closest('.edit-customer')) {
      const c = cache.customers.find((x) => x._id === el.closest('.edit-customer').dataset.id);
      openModal(t('editCustomer'), customerForm(c), `
        <button type="button" class="btn outline" id="modalCancel">${t('cancel')}</button>
        <button type="button" class="btn primary" id="saveCustomer">${t('save')}</button>`);
      return;
    }

    if (el.id === 'saveSettings') {
      const data = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          storeUrl: document.getElementById('storeUrl').value,
          consumerKey: document.getElementById('consumerKey').value,
          consumerSecret: document.getElementById('consumerSecret').value,
          lowStockThreshold: document.getElementById('lowStockThreshold').value,
          syncDirection: document.getElementById('syncDirection')?.value || 'both',
          autoSync: document.getElementById('autoSync').checked
        })
      });
      const msg = document.getElementById('settingsMsg');
      if (msg) msg.innerHTML = `${icon('circle-check')} ${esc(data?.message || 'Saved')}`;
      icons();
      showToast(data?.message || 'Saved');
      return;
    }
    if (el.id === 'testWoo') {
      const data = await api('/api/woo/test', { method: 'POST', body: '{}' });
      const msg = document.getElementById('settingsMsg');
      if (msg) msg.innerHTML = `${icon('plug-zap')} ${esc(data?.message || 'Done')}`;
      icons();
      showToast(data?.message || 'Done');
    }
  });

  content.addEventListener('input', (e) => {
    if (e.target.id === 'stockSearch') {
      clearTimeout(renderStock._t);
      renderStock._t = setTimeout(() => { stockSearch = e.target.value.trim(); renderStock(); }, 280);
    }
    if (e.target.id === 'orderSearch') {
      clearTimeout(renderOrders._t);
      renderOrders._t = setTimeout(() => { orderSearch = e.target.value.trim(); renderOrders(); }, 280);
    }
  });

  appModal.addEventListener('change', (e) => {
    if (!e.target.classList.contains('pl-product')) return;
    const row = e.target.closest('.purchase-line');
    const rate = row?.querySelector('.pl-rate');
    const cost = e.target.selectedOptions[0]?.dataset.cost;
    if (rate && (rate.value === '' || Number(rate.value) === 0) && cost) rate.value = cost;
  });
  appModal.addEventListener('submit', async (e) => {
    if (e.target.id !== 'checkoutCodeForm') return;
    e.preventDefault();
    const code = document.getElementById('checkoutCode')?.value?.trim();
    if (!code) return;
    await onDecodedCode(code);
    const inp = document.getElementById('checkoutCode');
    if (inp) inp.value = '';
  });
  appModal.addEventListener('click', async (e) => {
    if (e.target === appModal || e.target.id === 'modalCancel') return closeModal();
    if (e.target.closest('.edit-order-status')) {
      closeModal();
      return showOrderStatusModal(e.target.closest('.edit-order-status').dataset.id);
    }
    if (e.target.id === 'saveOrderStatus') {
      const form = document.getElementById('statusForm');
      const body = formToObject(form);
      const data = await api('/api/orders/' + body.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: body.status, paymentStatus: body.paymentStatus, paidAmount: body.paidAmount })
      });
      showToast(data?.message || 'OK');
      closeModal();
      return renderOrders();
    }
    if (e.target.id === 'saveOrder') {
      const form = document.getElementById('orderForm');
      const body = formToObject(form);
      const opt = form.querySelector('#orderProductSku selected') || form.querySelector('#orderProductSku').selectedOptions[0];
      const qty = Number(body.qty) || 1;
      const price = Number(opt.dataset.price) || 0;
      const data = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: body.customerName,
          phone: body.phone,
          city: body.city,
          address: body.address,
          source: body.source,
          shippingFee: body.shippingFee,
          paymentMethod: body.paymentMethod,
          note: body.note,
          status: 'pending',
          lines: [{
            product: opt.dataset.id,
            sku: body.productSku,
            name: opt.dataset.name,
            qty,
            price
          }]
        })
      });
      showToast(data?.message || 'Erreur');
      if (data?.ok) { closeModal(); await renderOrders(); }
      return;
    }
    if (e.target.id === 'saveProduct') {
      const form = document.getElementById('productForm');
      const body = formToObject(form);
      body.params = collectProductParams();
      const data = body.id
        ? await api('/api/products/' + body.id, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/products', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Erreur');
      if (data?.ok) { closeModal(); await renderItems(); }
      return;
    }
    if (e.target.id === 'savePresence') {
      const body = formToObject(document.getElementById('presenceForm'));
      const data = await api('/api/hrm/attendance', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Presence');
      if (data?.ok) { closeModal(); await renderHrm(); }
      return;
    }
    if (e.target.id === 'saveLeave') {
      const body = formToObject(document.getElementById('leaveForm'));
      const data = await api('/api/hrm/leaves', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Leave');
      if (data?.ok) { closeModal(); await go(current); }
      return;
    }
    if (e.target.id === 'saveMyLeave') {
      const body = formToObject(document.getElementById('myLeaveForm'));
      const data = await api('/api/hrm/leaves', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Leave');
      if (data?.ok) { closeModal(); await go(current); }
      return;
    }
    if (e.target.id === 'saveAdvance') {
      const body = formToObject(document.getElementById('advanceForm'));
      const data = await api('/api/hrm/advances', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Advance');
      if (data?.ok) { closeModal(); await go(current); }
      return;
    }
    if (e.target.id === 'confirmPosSale') {
      await confirmPosSale();
      return;
    }
    if (e.target.closest('#restartScan')) {
      return cameraGranted ? startCheckoutScan(requestCamera()) : showPermGate('checkout');
    }
    if (e.target.closest('.cart-drop')) {
      posCart.splice(Number(e.target.closest('.cart-drop').dataset.i), 1);
      refreshCheckoutUi();
      return;
    }
    if (e.target.id === 'confirmSpecSell') {
      const form = document.getElementById('specPickForm');
      const id = form?.querySelector('[name="productId"]')?.value;
      const qty = Number(form?.querySelector('[name="qty"]')?.value) || 1;
      const p = (cache.products || []).find((x) => String(x._id) === String(id));
      const variant = [...document.querySelectorAll('.spec-pick')].map((sel) => {
        const name = sel.dataset.name || '';
        return name ? `${name}: ${sel.value}` : sel.value;
      }).filter(Boolean).join(' / ');
      closeModal();
      if (p) addToCart(p, qty, variant);
      if (current !== 'pos') await go('pos');
      return;
    }
    if (e.target.closest('#addParamRow')) {
      const box = document.getElementById('productParams');
      if (box) box.insertAdjacentHTML('beforeend', paramRowHtml({}));
      return;
    }
    if (e.target.closest('.add-preset-param')) {
      const name = e.target.closest('.add-preset-param').dataset.name || '';
      const box = document.getElementById('productParams');
      const exists = [...document.querySelectorAll('.param-name')].some((inp) => inp.value.trim().toLowerCase() === name.toLowerCase());
      if (box && !exists) box.insertAdjacentHTML('beforeend', paramRowHtml({ name, values: [] }));
      return;
    }
    if (e.target.closest('.drop-param')) {
      const row = e.target.closest('.param-row');
      if (row && document.querySelectorAll('.param-row').length > 1) row.remove();
      return;
    }
    if (e.target.id === 'savePurchase') {
      const form = document.getElementById('purchaseForm');
      const body = formToObject(form);
      body.lines = [...document.querySelectorAll('.purchase-line')].map((row) => ({
        productId: row.querySelector('.pl-product')?.value,
        qty: row.querySelector('.pl-qty')?.value,
        rate: row.querySelector('.pl-rate')?.value
      }));
      const data = body.id
        ? await api('/api/purchases/' + body.id, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/purchases', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || t('purchases'));
      if (data?.ok) { closeModal(); await renderPurchases(); }
      return;
    }
    if (e.target.closest('#addPurchaseLine')) {
      const box = document.getElementById('purchaseLines');
      if (box) {
        box.insertAdjacentHTML('beforeend', purchaseLineHtml({}, cache.products || []));
        icons();
      }
      return;
    }
    if (e.target.closest('.drop-purchase-line')) {
      const row = e.target.closest('.purchase-line');
      if (row && document.querySelectorAll('.purchase-line').length > 1) row.remove();
      return;
    }
    if (e.target.id === 'saveCustomer') {
      const form = document.getElementById('customerForm');
      const body = formToObject(form);
      const data = body.id
        ? await api('/api/customers/' + body.id, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/customers', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Erreur');
      if (data?.ok) {
        closeModal();
        if (data.customer?._id) posCustomerId = String(data.customer._id);
        await go(current === 'pos' ? 'pos' : 'customers');
      }
      return;
    }
    if (e.target.id === 'saveCaisse') {
      const form = document.getElementById('caisseForm');
      const body = formToObject(form);
      body.assignedUsers = [...form.querySelectorAll('select[name="assignedUsers"] option:checked')].map((o) => o.value);
      const data = body.id
        ? await api('/api/caisses/' + body.id, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/caisses', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Erreur');
      if (data?.ok) { closeModal(); await renderCaisse(); }
      return;
    }
    if (e.target.id === 'saveOpenTill') {
      const body = formToObject(document.getElementById('openTillForm'));
      const data = await api('/api/caisses/' + body.id + '/open', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Caisse');
      if (data?.ok) {
        selectedCaisseId = body.id;
        localStorage.setItem('hs_caisse_id', selectedCaisseId);
        closeModal();
        await go(current === 'pos' ? 'pos' : 'caisse');
      }
      return;
    }
    if (e.target.id === 'saveCloseTill') {
      const body = formToObject(document.getElementById('closeTillForm'));
      const data = await api('/api/sessions/' + body.id + '/close', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Caisse');
      if (data?.ok) { closeModal(); await go(current); }
      return;
    }
    if (e.target.id === 'saveSponsor') {
      const form = document.getElementById('sponsorForm');
      const body = formToObject(form);
      const data = body.id
        ? await api('/api/sponsors/' + body.id, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/sponsors', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Erreur');
      if (data?.ok) { closeModal(); await renderSponsors(); }
      return;
    }
    if (e.target.id === 'saveUser') {
      const form = document.getElementById('userForm');
      const body = formToObject(form);
      body.active = body.active !== 'false';
      if (!body.password) delete body.password;
      const data = body.id
        ? await api('/api/users/' + body.id, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Erreur');
      if (data?.ok) { closeModal(); await renderUsers(); }
    }
  });

  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('adjustClose').onclick = () => { adjustModal.hidden = true; };
  adjustModal.addEventListener('click', (e) => { if (e.target === adjustModal) adjustModal.hidden = true; });
  document.getElementById('adjustForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reasonKey = document.getElementById('adjustReason').value;
    await adjust(document.getElementById('adjustId').value, Number(document.getElementById('adjustQty').value), {
      reason: t(reasonKey),
      note: document.getElementById('adjustNote').value
    });
    adjustModal.hidden = true;
  });

  document.getElementById('logoutBtn').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    location.href = '/login.html';
  };
  document.getElementById('resetDemoBtn').onclick = async () => {
    if (!confirm(t('resetConfirm'))) return;
    const data = await api('/api/demo/reset');
    showToast(data?.message || 'Reset');
    await go(current);
  };
  function setNavOpen(open) {
    sidebar.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
    backdrop.hidden = !open;
    if (menuToggle) menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  menuToggle.onclick = (e) => {
    e.stopPropagation();
    setNavOpen(!sidebar.classList.contains('open'));
  };
  backdrop.onclick = () => setNavOpen(false);
  document.getElementById('permAllow').onclick = () => allowAppPermissions();
  document.getElementById('permLater').onclick = () => {
    const next = pendingScan;
    pendingScan = null;
    hidePermGate();
    if (next === 'checkout') showCheckout(null);
  };
  document.getElementById('liveScanClose').onclick = () => stopCheckoutScan();
  document.getElementById('liveScanPass').onclick = () => confirmPosSale();
  document.getElementById('scanCapture').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await decodeImageFile(file);
  });


  content.addEventListener('change', async (e) => {
    if (e.target.id === 'stockCategory') { stockCategory = e.target.value; return renderStock(); }
    if (e.target.id === 'itemsCategory') { itemsCategory = e.target.value; return renderItems(); }
    if (e.target.id === 'calMonth') { calendarMonth = e.target.value; return renderCalendar(); }
    if (e.target.id === 'posCustomer') posCustomerId = e.target.value;
    if (e.target.id === 'posPay') posPay = e.target.value;
    if (e.target.id === 'importProducts' && e.target.files?.[0]) {
      const file = e.target.files[0];
      const text = await file.text();
      let products = [];
      try {
        if (file.name.endsWith('.json')) products = JSON.parse(text).products || JSON.parse(text);
        else {
          const lines = text.trim().split(/\r?\n/);
          const headers = lines.shift().split(',').map((h) => h.trim());
          products = lines.map((line) => {
            const cols = line.split(',');
            const row = {};
            headers.forEach((h, i) => { row[h] = cols[i]; });
            return row;
          });
        }
      } catch (err) { showToast('Import parse error'); return; }
      const data = await api('/api/import/products', { method: 'POST', body: JSON.stringify({ products }) });
      showToast(data?.message || 'Import');
      if (data?.ok) await renderItems();
    }
  });

  content.addEventListener('submit', async (e) => {
    if (e.target.id === 'stockReceiveForm') {
      e.preventDefault();
      const body = formToObject(e.target);
      const data = await api('/api/stock/receive', { method: 'POST', body: JSON.stringify(body) });
      showToast(data?.message || 'Stock');
      if (data?.ok) await renderStock();
      return;
    }
    if (e.target.id === 'posScanForm') {
      e.preventDefault();
      const body = formToObject(e.target);
      posCustomerId = body.customerId || posCustomerId;
      posPay = body.paymentMethod || posPay;
      if (!body.barcode) { showToast(t('scanOrType')); return; }
      const found = await api('/api/products/lookup?code=' + encodeURIComponent(body.barcode));
      if (found?.product) {
        offerSell(found.product, Number(body.qty) || 1);
        const inp = document.getElementById('posBarcode');
        if (inp) { inp.value = ''; inp.focus(); }
      } else showToast(found?.message || t('noProducts'));
    }
  });

  document.querySelectorAll('.lang-switch').forEach((switcher) => {
    switcher.addEventListener('click', async (e) => {
      const btn = e.target.closest('.lang-btn');
      if (!btn) return;
      setLang(btn.dataset.lang);
      applyChrome();
      renderNav();
      icons();
      await go(current);
    });
  });

  (async function init() {
    applyChrome();
    const me = await api('/api/auth/me');
    currentUser = me?.user || null;
    if (currentUser) {
      const nameEl = document.getElementById('userName');
      const label = currentUser.name + ' · ' + currentUser.role;
      if (nameEl) nameEl.textContent = label;
      else document.getElementById('userPill').textContent = label;
      const resetBtn = document.getElementById('resetDemoBtn');
      if (resetBtn) resetBtn.hidden = currentUser.role !== 'admin';
    }
    const mod = await api('/api/modules');
    modules = mod?.modules || [];
    permissions = mod?.permissions || permissions;
    const prod = await api('/api/products');
    cache.products = prod?.products || [];
    renderNav();
    icons();
    const hash = (location.hash || '').replace('#', '');
    const start = (hash && modules.some((m) => m.id === hash))
      ? hash
      : (currentUser?.role === 'seller' ? 'pos' : 'dashboard');
    await go(modules.some((m) => m.id === start) ? start : (modules[0]?.id || 'dashboard'));
    showTips();
    const coach = document.getElementById('coach');
    if (!coach || coach.hidden) showPermGate();
    pollNotices();
    setInterval(pollNotices, 25000);
  })();
})();
