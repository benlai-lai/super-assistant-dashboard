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
  const operationGenerations = new Map();
  let contextGeneration = 0;
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
  const finishKey = (name, key) => {
    if (pendingKeys.get(name)?.key === key) pendingKeys.delete(name);
  };
  const text = (id, value) => { byId(id).textContent = value ?? ''; };
  const clear = (element) => element.replaceChildren();
  const setBusy = (form, value) => { for (const control of form.elements) control.disabled = value; };
  const setLoginBusy = (value) => {
    for (const control of byId('login-controls').querySelectorAll('input, button')) control.disabled = value;
  };
  const advanceContext = () => { contextGeneration += 1; };
  function beginOperation(name, { trackSession = true, trackSelection = true } = {}) {
    const generation = (operationGenerations.get(name) ?? 0) + 1;
    operationGenerations.set(name, generation);
    return {
      name,
      generation,
      contextGeneration,
      trackSession,
      session: state.session,
      trackSelection,
      customerId: state.customer?.id ?? null,
      inquiryId: state.inquiry?.id ?? null,
      itemId: state.item?.id ?? null,
    };
  }
  function isCurrentOperation(operation) {
    if (contextGeneration !== operation.contextGeneration) return false;
    if (operationGenerations.get(operation.name) !== operation.generation) return false;
    if (operation.trackSession && state.session !== operation.session) return false;
    if (!operation.trackSelection) return true;
    return (state.customer?.id ?? null) === operation.customerId
      && (state.inquiry?.id ?? null) === operation.inquiryId
      && (state.item?.id ?? null) === operation.itemId;
  }
  function recordButton(label, selected, handler) {
    const li = document.createElement('li'); const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.setAttribute('aria-current', String(selected)); button.addEventListener('click', handler); li.append(button); return li;
  }
  function clearAudit() { clear(byId('audit-list')); text('audit-status', ''); }
  function clearCustomerForm() { byId('customer-form').reset(); byId('customer-id').value = ''; byId('customer-version').value = ''; setBusy(byId('customer-form'), false); }
  function clearInquiryForm() { byId('inquiry-form').reset(); byId('inquiry-id').value = ''; byId('inquiry-version').value = ''; setBusy(byId('inquiry-form'), false); }
  function clearItemForm() { byId('item-form').reset(); byId('item-id').value = ''; byId('item-version').value = ''; setBusy(byId('item-form'), false); }
  function clearAuthenticatedView() {
    state.session = null; state.customers = []; state.inquiries = []; state.items = [];
    state.customer = null; state.inquiry = null; state.item = null;
    clearCustomerForm(); clearInquiryForm(); clearItemForm();
    renderCustomers(); renderInquiries(); renderItems(); clearAudit();
    text('selected-customer', '請先選擇客戶'); text('selected-inquiry', '請先選擇詢價'); text('session-summary', '');
    text('customer-status', ''); text('inquiry-status', ''); text('item-status', '');
    byId('username').value = ''; byId('password').value = '';
    byId('app-panel').hidden = true; byId('session-panel').hidden = true; byId('login-panel').hidden = false;
  }
  function resetCustomerForm() {
    advanceContext(); state.customer = null; state.inquiry = null; state.item = null; state.inquiries = []; state.items = [];
    clearCustomerForm(); clearInquiryForm(); clearItemForm(); renderCustomers(); renderInquiries(); renderItems(); clearAudit();
    text('selected-customer', '請先選擇客戶'); text('selected-inquiry', '請先選擇詢價');
  }
  function resetInquiryForm() {
    advanceContext(); state.inquiry = null; state.item = null; state.items = [];
    clearInquiryForm(); clearItemForm(); renderInquiries(); renderItems(); clearAudit(); text('selected-inquiry', '請先選擇詢價');
  }
  function resetItemForm() { advanceContext(); state.item = null; clearItemForm(); renderItems(); clearAudit(); }
  function editCustomer(customer) {
    advanceContext(); state.inquiry = null; state.item = null; state.inquiries = []; state.items = [];
    state.customer = customer; byId('customer-id').value = customer.id; byId('customer-version').value = customer.row_version;
    byId('customer-name').value = customer.display_name; byId('customer-contact').value = customer.contact_name ?? ''; byId('customer-email').value = customer.email ?? ''; byId('customer-phone').value = customer.phone ?? '';
    setBusy(byId('customer-form'), false); clearInquiryForm(); clearItemForm();
    text('selected-customer', `目前客戶：${customer.display_name}`); text('selected-inquiry', '請先選擇詢價');
    renderCustomers(); renderInquiries(); renderItems(); clearAudit();
    void loadInquiries().catch(() => {}); void loadAudit('customer', customer.id);
  }
  function editInquiry(inquiry) {
    advanceContext(); state.item = null; state.items = [];
    state.inquiry = inquiry; byId('inquiry-id').value = inquiry.id; byId('inquiry-version').value = inquiry.row_version; byId('inquiry-title').value = inquiry.title; byId('inquiry-state').value = inquiry.status;
    setBusy(byId('inquiry-form'), false); clearItemForm(); text('selected-inquiry', `目前詢價：${inquiry.title}`);
    renderInquiries(); renderItems(); clearAudit(); void loadItems().catch(() => {}); void loadAudit('inquiry', inquiry.id);
  }
  function editItem(item) {
    advanceContext();
    state.item = item; byId('item-id').value = item.id; byId('item-version').value = item.row_version; byId('item-description').value = item.description; byId('item-quantity').value = item.quantity; byId('item-notes').value = item.notes ?? '';
    setBusy(byId('item-form'), false); renderItems(); clearAudit(); void loadAudit('inquiry_item', item.id);
  }
  function renderCustomers() { const list = byId('customer-list'); clear(list); for (const customer of state.customers) list.append(recordButton(customer.display_name, state.customer?.id === customer.id, () => editCustomer(customer))); }
  function renderInquiries() { const list = byId('inquiry-list'); clear(list); for (const inquiry of state.inquiries) list.append(recordButton(`${inquiry.title} · ${inquiry.status}`, state.inquiry?.id === inquiry.id, () => editInquiry(inquiry))); }
  function renderItems() { const list = byId('item-list'); clear(list); for (const item of state.items) list.append(recordButton(`${item.description} × ${item.quantity}`, state.item?.id === item.id, () => editItem(item))); }
  async function loadCustomers() {
    const operation = beginOperation('load-customers');
    try {
      const payload = await api('/api/customers?limit=100');
      if (!isCurrentOperation(operation)) return false;
      state.customers = payload.customers; renderCustomers(); return true;
    } catch (error) {
      if (!isCurrentOperation(operation)) return false;
      throw error;
    }
  }
  async function loadInquiries() {
    if (!state.customer) return false;
    const customerId = state.customer.id;
    const operation = beginOperation('load-inquiries');
    try {
      const payload = await api('/api/inquiries?limit=100');
      if (!isCurrentOperation(operation) || state.customer?.id !== customerId) return false;
      state.inquiries = payload.inquiries.filter((item) => item.customer_id === customerId); renderInquiries(); return true;
    } catch (error) {
      if (!isCurrentOperation(operation) || state.customer?.id !== customerId) return false;
      throw error;
    }
  }
  async function loadItems() {
    if (!state.inquiry) return false;
    const inquiryId = state.inquiry.id;
    const operation = beginOperation('load-items');
    try {
      const payload = await api(`/api/inquiries/${encodeURIComponent(inquiryId)}/items`);
      if (!isCurrentOperation(operation) || state.inquiry?.id !== inquiryId) return false;
      state.items = payload.items; renderItems(); return true;
    } catch (error) {
      if (!isCurrentOperation(operation) || state.inquiry?.id !== inquiryId) return false;
      throw error;
    }
  }
  async function loadAudit(entityType, entityId) {
    const operation = beginOperation('load-audit');
    const list = byId('audit-list'); clear(list); text('audit-status', '載入中…');
    try {
      const payload = await api(`/api/audit?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
      if (!isCurrentOperation(operation)) return false;
      for (const entry of payload.entries) { const li = document.createElement('li'); li.textContent = `${entry.created_at} · ${entry.actor_id ?? 'legacy'} · ${entry.action}`; list.append(li); }
      text('audit-status', payload.entries.length ? '' : '尚無修改紀錄');
      return true;
    } catch {
      if (!isCurrentOperation(operation)) return false;
      text('audit-status', '修改紀錄載入失敗');
      return false;
    }
  }
  async function submitMutation(form, name, path, method, body, version, statusId, operation) {
    setBusy(form, true); text(statusId, '儲存中…'); const key = keyFor(name, { path, method, body, version });
    try {
      const payload = await api(path, { method, body, version, mutationKey: key }); finishKey(name, key);
      if (isCurrentOperation(operation)) text(statusId, '已儲存');
      return payload;
    } catch (error) {
      if (error.code === 'stale_version') finishKey(name, key);
      if (isCurrentOperation(operation)) {
        text(statusId, error.code === 'stale_version' ? '資料已被其他人修改，已重新載入；請確認後再送出。' : `儲存失敗：${error.code}`);
      }
      throw error;
    } finally {
      if (isCurrentOperation(operation)) setBusy(form, false);
    }
  }
  async function fetchForOperation(path, operation) {
    try {
      const payload = await api(path);
      return isCurrentOperation(operation) ? payload : null;
    } catch (error) {
      if (!isCurrentOperation(operation)) return null;
      throw error;
    }
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
    advanceContext();
    const operation = beginOperation('login', { trackSession: false, trackSelection: false });
    setLoginBusy(true);
    text('login-status', '登入中…');
    try {
      await api('/api/session', { method: 'POST', body: { username, password } });
      if (!isCurrentOperation(operation)) return;
      byId('password').value = '';
      const session = await api('/api/session');
      if (!isCurrentOperation(operation)) return;
      state.session = session;
      byId('login-panel').hidden = true;
      byId('app-panel').hidden = false;
      byId('session-panel').hidden = false;
      text('session-summary', `${state.session.actorId} · ${state.session.role}`);
      await loadCustomers();
    } catch {
      if (!isCurrentOperation(operation)) return;
      advanceContext(); clearAuthenticatedView();
      text('login-status', '登入失敗');
      setLoginBusy(false);
    } finally {
      if (isCurrentOperation(operation)) setLoginBusy(!state.pilotReady);
    }
  }
  byId('login-button').addEventListener('click', login);
  byId('login-controls').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    byId('login-button').click();
  });
  byId('logout').addEventListener('click', async () => {
    advanceContext(); clearAuthenticatedView(); setLoginBusy(true); text('login-status', '登出中…');
    const operation = beginOperation('logout', { trackSession: false, trackSelection: false });
    try { await api('/api/session', { method: 'DELETE' }); } catch { /* Clear the local view regardless. */ }
    finally { if (isCurrentOperation(operation)) location.reload(); }
  });
  byId('new-customer').addEventListener('click', resetCustomerForm); byId('new-inquiry').addEventListener('click', resetInquiryForm); byId('new-item').addEventListener('click', resetItemForm);
  byId('customer-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const body = { displayName: byId('customer-name').value, contactName: byId('customer-contact').value || null, email: byId('customer-email').value || null, phone: byId('customer-phone').value || null };
    const id = byId('customer-id').value; const method = id ? 'PATCH' : 'POST'; const path = id ? `/api/customers/${encodeURIComponent(id)}` : '/api/customers';
    const operation = beginOperation('mutate-customer');
    try {
      const payload = await submitMutation(form, 'customer', path, method, body, Number(byId('customer-version').value) || undefined, 'customer-status', operation);
      if (!isCurrentOperation(operation)) return;
      const loaded = await loadCustomers();
      if (!loaded || !isCurrentOperation(operation)) return;
      editCustomer(state.customers.find((item) => item.id === payload.customer.id) ?? payload.customer);
    } catch (error) {
      if (!isCurrentOperation(operation) || error.code !== 'stale_version') return;
      const payload = await fetchForOperation(`/api/customers/${encodeURIComponent(id)}`, operation).catch(() => null);
      if (payload && isCurrentOperation(operation)) editCustomer(payload.customer);
    }
  });
  byId('inquiry-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!state.customer) { text('inquiry-status', '請先選擇客戶'); return; }
    const form = event.currentTarget; const body = { title: byId('inquiry-title').value, status: byId('inquiry-state').value }; const id = byId('inquiry-id').value; if (!id) body.customerId = state.customer.id; const path = id ? `/api/inquiries/${encodeURIComponent(id)}` : '/api/inquiries';
    const operation = beginOperation('mutate-inquiry');
    try {
      const payload = await submitMutation(form, 'inquiry', path, id ? 'PATCH' : 'POST', body, Number(byId('inquiry-version').value) || undefined, 'inquiry-status', operation);
      if (!isCurrentOperation(operation)) return;
      const loaded = await loadInquiries();
      if (!loaded || !isCurrentOperation(operation)) return;
      editInquiry(state.inquiries.find((item) => item.id === payload.inquiry.id) ?? payload.inquiry);
    } catch (error) {
      if (!isCurrentOperation(operation) || error.code !== 'stale_version') return;
      const payload = await fetchForOperation(`/api/inquiries/${encodeURIComponent(id)}`, operation).catch(() => null);
      if (payload && isCurrentOperation(operation)) editInquiry(payload.inquiry);
    }
  });
  byId('item-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!state.inquiry) { text('item-status', '請先選擇詢價'); return; }
    const form = event.currentTarget; const inquiryId = state.inquiry.id; const body = { description: byId('item-description').value, quantity: Number(byId('item-quantity').value), notes: byId('item-notes').value || null }; const id = byId('item-id').value; const base = `/api/inquiries/${encodeURIComponent(inquiryId)}/items`; const path = id ? `${base}/${encodeURIComponent(id)}` : base;
    const operation = beginOperation('mutate-item');
    try {
      const payload = await submitMutation(form, 'item', path, id ? 'PATCH' : 'POST', body, Number(byId('item-version').value) || undefined, 'item-status', operation);
      if (!isCurrentOperation(operation)) return;
      const loaded = await loadItems();
      if (!loaded || !isCurrentOperation(operation)) return;
      editItem(state.items.find((item) => item.id === payload.item.id) ?? payload.item);
    } catch (error) {
      if (!isCurrentOperation(operation) || error.code !== 'stale_version') return;
      const loaded = await loadItems().catch(() => false);
      if (!loaded || !isCurrentOperation(operation)) return;
      const latest = state.items.find((item) => item.id === id);
      if (latest) editItem(latest);
    }
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
