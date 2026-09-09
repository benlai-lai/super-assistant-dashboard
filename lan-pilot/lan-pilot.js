(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const PILOT_HEADER = 'x-dashboard-lan-pilot';
  const PILOT_HEADER_VALUE = 'phase-a';
  const state = {
    pilotReady: false,
    session: null,
    customers: [],
    inquiries: [],
    items: [],
    customer: null,
    inquiry: null,
    item: null,
  };
  const pendingKeys = new Map();
  class RequestError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
  function assertPilotResponse(response) {
    if (response.headers.get(PILOT_HEADER) !== PILOT_HEADER_VALUE) {
      throw new RequestError(503, 'pilot_unavailable');
    }
  }
  async function api(path, { method = 'GET', body, version, mutationKey } = {}) {
    if (!state.pilotReady) throw new RequestError(503, 'pilot_unavailable');
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (mutationKey) headers['Idempotency-Key'] = mutationKey;
    if (version) headers['If-Match'] = `"${version}"`;
    const response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assertPilotResponse(response);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new RequestError(response.status, payload.error || 'request_failed');
    return payload;
  }
  function keyFor(name, body) {
    const fingerprint = JSON.stringify(body); const existing = pendingKeys.get(name);
    if (existing?.fingerprint === fingerprint) return existing.key;
    const value = { fingerprint, key: crypto.randomUUID() }; pendingKeys.set(name, value); return value.key;
  }
  const finishKey = (name) => pendingKeys.delete(name);
  const text = (id, value) => { byId(id).textContent = value ?? ''; };
  const clear = (element) => element.replaceChildren();
  const setBusy = (form, value) => { for (const control of form.elements) control.disabled = value; };
  const setLoginBusy = (value) => {
    for (const control of byId('login-controls').querySelectorAll('input, button')) control.disabled = value;
  };
  function recordButton(label, selected, handler) {
    const li = document.createElement('li'); const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.setAttribute('aria-current', String(selected)); button.addEventListener('click', handler); li.append(button); return li;
  }
  function resetCustomerForm() { state.customer = null; byId('customer-form').reset(); byId('customer-id').value = ''; byId('customer-version').value = ''; }
  function resetInquiryForm() { state.inquiry = null; byId('inquiry-form').reset(); byId('inquiry-id').value = ''; byId('inquiry-version').value = ''; state.items = []; renderItems(); resetItemForm(); text('selected-inquiry', '請先選擇詢價'); }
  function resetItemForm() { state.item = null; byId('item-form').reset(); byId('item-id').value = ''; byId('item-version').value = ''; }
  function editCustomer(customer) {
    state.customer = customer; byId('customer-id').value = customer.id; byId('customer-version').value = customer.row_version;
    byId('customer-name').value = customer.display_name; byId('customer-contact').value = customer.contact_name ?? ''; byId('customer-email').value = customer.email ?? ''; byId('customer-phone').value = customer.phone ?? '';
    text('selected-customer', `目前客戶：${customer.display_name}`); resetInquiryForm(); loadInquiries(); loadAudit('customer', customer.id); renderCustomers();
  }
  function editInquiry(inquiry) {
    state.inquiry = inquiry; byId('inquiry-id').value = inquiry.id; byId('inquiry-version').value = inquiry.row_version; byId('inquiry-title').value = inquiry.title; byId('inquiry-state').value = inquiry.status;
    text('selected-inquiry', `目前詢價：${inquiry.title}`); resetItemForm(); loadItems(); loadAudit('inquiry', inquiry.id); renderInquiries();
  }
  function editItem(item) {
    state.item = item; byId('item-id').value = item.id; byId('item-version').value = item.row_version; byId('item-description').value = item.description; byId('item-quantity').value = item.quantity; byId('item-notes').value = item.notes ?? '';
    loadAudit('inquiry_item', item.id); renderItems();
  }
  function renderCustomers() { const list = byId('customer-list'); clear(list); for (const customer of state.customers) list.append(recordButton(customer.display_name, state.customer?.id === customer.id, () => editCustomer(customer))); }
  function renderInquiries() { const list = byId('inquiry-list'); clear(list); for (const inquiry of state.inquiries) list.append(recordButton(`${inquiry.title} · ${inquiry.status}`, state.inquiry?.id === inquiry.id, () => editInquiry(inquiry))); }
  function renderItems() { const list = byId('item-list'); clear(list); for (const item of state.items) list.append(recordButton(`${item.description} × ${item.quantity}`, state.item?.id === item.id, () => editItem(item))); }
  async function loadCustomers() { const payload = await api('/api/customers?limit=100'); state.customers = payload.customers; renderCustomers(); if (state.customer) { const latest = state.customers.find((item) => item.id === state.customer.id); if (latest) editCustomer(latest); } }
  async function loadInquiries() { if (!state.customer) return; const payload = await api('/api/inquiries?limit=100'); state.inquiries = payload.inquiries.filter((item) => item.customer_id === state.customer.id); renderInquiries(); }
  async function loadItems() { if (!state.inquiry) return; const payload = await api(`/api/inquiries/${encodeURIComponent(state.inquiry.id)}/items`); state.items = payload.items; renderItems(); }
  async function loadAudit(entityType, entityId) {
    const list = byId('audit-list'); clear(list); text('audit-status', '載入中…');
    try { const payload = await api(`/api/audit?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`); for (const entry of payload.entries) { const li = document.createElement('li'); li.textContent = `${entry.created_at} · ${entry.actor_id ?? 'legacy'} · ${entry.action}`; list.append(li); } text('audit-status', payload.entries.length ? '' : '尚無修改紀錄'); }
    catch { text('audit-status', '修改紀錄載入失敗'); }
  }
  async function submitMutation(form, name, path, method, body, version, statusId) {
    setBusy(form, true); text(statusId, '儲存中…'); const key = keyFor(name, { path, method, body, version });
    try { const payload = await api(path, { method, body, version, mutationKey: key }); finishKey(name); text(statusId, '已儲存'); return payload; }
    catch (error) { text(statusId, error.code === 'stale_version' ? '資料已被其他人修改，已重新載入；請確認後再送出。' : `儲存失敗：${error.code}`); if (error.code === 'stale_version') finishKey(name); throw error; }
    finally { setBusy(form, false); }
  }
  async function login() {
    if (!state.pilotReady) {
      text('login-status', '本頁未連接核准的本機服務，登入已停用。');
      return;
    }
    const username = byId('username').value;
    const password = byId('password').value;
    if (!username || !password) {
      text('login-status', '請輸入帳號與密碼');
      return;
    }
    setLoginBusy(true);
    text('login-status', '登入中…');
    try {
      await api('/api/session', { method: 'POST', body: { username, password } });
      byId('password').value = '';
      state.session = await api('/api/session');
      byId('login-panel').hidden = true;
      byId('app-panel').hidden = false;
      byId('session-panel').hidden = false;
      text('session-summary', `${state.session.actorId} · ${state.session.role}`);
      await loadCustomers();
    } catch {
      byId('password').value = '';
      text('login-status', '登入失敗');
    } finally {
      setLoginBusy(!state.pilotReady);
    }
  }
  byId('login-button').addEventListener('click', login);
  byId('login-controls').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    byId('login-button').click();
  });
  byId('logout').addEventListener('click', async () => { try { await api('/api/session', { method: 'DELETE' }); } catch { /* Clear the local view regardless. */ } location.reload(); });
  byId('new-customer').addEventListener('click', resetCustomerForm); byId('new-inquiry').addEventListener('click', resetInquiryForm); byId('new-item').addEventListener('click', resetItemForm);
  byId('customer-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const body = { displayName: byId('customer-name').value, contactName: byId('customer-contact').value || null, email: byId('customer-email').value || null, phone: byId('customer-phone').value || null };
    const id = byId('customer-id').value; const method = id ? 'PATCH' : 'POST'; const path = id ? `/api/customers/${encodeURIComponent(id)}` : '/api/customers';
    try { const payload = await submitMutation(form, 'customer', path, method, body, Number(byId('customer-version').value) || undefined, 'customer-status'); state.customer = payload.customer; await loadCustomers(); }
    catch (error) { if (error.code === 'stale_version') { const payload = await api(`/api/customers/${encodeURIComponent(id)}`); editCustomer(payload.customer); } }
  });
  byId('inquiry-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!state.customer) { text('inquiry-status', '請先選擇客戶'); return; }
    const form = event.currentTarget; const body = { title: byId('inquiry-title').value, status: byId('inquiry-state').value }; const id = byId('inquiry-id').value; if (!id) body.customerId = state.customer.id; const path = id ? `/api/inquiries/${encodeURIComponent(id)}` : '/api/inquiries';
    try { const payload = await submitMutation(form, 'inquiry', path, id ? 'PATCH' : 'POST', body, Number(byId('inquiry-version').value) || undefined, 'inquiry-status'); state.inquiry = payload.inquiry; await loadInquiries(); editInquiry(state.inquiries.find((item) => item.id === state.inquiry.id) ?? state.inquiry); }
    catch (error) { if (error.code === 'stale_version') { const payload = await api(`/api/inquiries/${encodeURIComponent(id)}`); editInquiry(payload.inquiry); } }
  });
  byId('item-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!state.inquiry) { text('item-status', '請先選擇詢價'); return; }
    const form = event.currentTarget; const body = { description: byId('item-description').value, quantity: Number(byId('item-quantity').value), notes: byId('item-notes').value || null }; const id = byId('item-id').value; const base = `/api/inquiries/${encodeURIComponent(state.inquiry.id)}/items`; const path = id ? `${base}/${encodeURIComponent(id)}` : base;
    try { const payload = await submitMutation(form, 'item', path, id ? 'PATCH' : 'POST', body, Number(byId('item-version').value) || undefined, 'item-status'); state.item = payload.item; await loadItems(); editItem(state.items.find((item) => item.id === state.item.id) ?? state.item); }
    catch (error) { if (error.code === 'stale_version') { await loadItems(); const latest = state.items.find((item) => item.id === id); if (latest) editItem(latest); } }
  });
  function establishPilotConnection() {
    setLoginBusy(true);
    if (document.body.dataset.pilotRuntime !== PILOT_HEADER_VALUE) {
      state.pilotReady = false;
      text('login-status', '本頁未連接核准的本機服務，登入已停用。');
      return;
    }
    state.pilotReady = true;
    setLoginBusy(false);
    text('login-status', '');
  }
  establishPilotConnection();
})();
