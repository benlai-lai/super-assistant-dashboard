(() => {
  'use strict';

  const REQUIRED_ORIGIN = 'http://127.0.0.1:18885';
  const REQUIRED_LOCATION = Object.freeze({ protocol: 'http:', hostname: '127.0.0.1', port: '18885' });
  const formatDateTime = new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  class RequestError extends Error {
    constructor(status, message) {
      super(message);
      this.name = 'RequestError';
      this.status = status;
    }
  }

  class StaleRequestError extends Error {
    constructor() {
      super('Stale request');
      this.name = 'StaleRequestError';
    }
  }

  const elements = {};
  const state = {
    initialized: false,
    session: null,
    customers: [],
    selectedCustomer: null,
    inquiries: [],
    selectedInquiry: null,
    items: [],
    controllers: new Set(),
    generation: 0,
    expiryTimer: null,
    logoutUnconfirmed: false,
    wasAuthenticatedBeforePageHide: false,
  };

  function isRequiredLocation() {
    return window.location.protocol === REQUIRED_LOCATION.protocol
      && window.location.hostname === REQUIRED_LOCATION.hostname
      && window.location.port === REQUIRED_LOCATION.port
      && window.location.origin === REQUIRED_ORIGIN;
  }

  function cacheElements() {
    const ids = [
      'environment-blocked', 'app-status', 'login-view', 'login-form', 'username', 'password',
      'login-button', 'login-error', 'logout-retry', 'retry-logout-button', 'pilot-view',
      'session-summary', 'logout-button', 'global-error', 'customer-count', 'customer-list-status',
      'customer-list', 'customer-detail-panel', 'back-to-customers', 'customer-detail-title',
      'customer-detail-status', 'customer-detail', 'inquiry-section', 'inquiry-count',
      'inquiry-list-status', 'inquiry-list', 'inquiry-detail-panel', 'back-to-inquiries',
      'inquiry-detail-title', 'inquiry-detail-status', 'inquiry-detail', 'item-section',
      'item-count', 'item-list-status', 'item-list',
    ];
    for (const id of ids) elements[id] = document.getElementById(id);
  }

  function setText(element, value) { element.textContent = value; }
  function show(element, visible = true) { element.hidden = !visible; }
  function setStatus(message, visible = true) {
    setText(elements['app-status'], message);
    show(elements['app-status'], visible);
  }
  function showGlobalError(message = '') {
    setText(elements['global-error'], message);
    show(elements['global-error'], Boolean(message));
  }
  function showLoginError(message = '') {
    setText(elements['login-error'], message);
    show(elements['login-error'], Boolean(message));
  }

  function invalidateRequests() {
    state.generation += 1;
    for (const controller of state.controllers) controller.abort();
    state.controllers.clear();
    return state.generation;
  }

  function clearExpiryTimer() {
    if (state.expiryTimer !== null) window.clearTimeout(state.expiryTimer);
    state.expiryTimer = null;
  }

  function clearBusinessData() {
    state.customers = [];
    state.selectedCustomer = null;
    state.inquiries = [];
    state.selectedInquiry = null;
    state.items = [];
    for (const id of ['customer-list', 'customer-detail', 'inquiry-list', 'inquiry-detail', 'item-list']) {
      elements[id].replaceChildren();
    }
    for (const id of ['customer-count', 'customer-list-status', 'customer-detail-status', 'inquiry-count',
      'inquiry-list-status', 'inquiry-detail-status', 'item-count', 'item-list-status']) {
      setText(elements[id], '');
    }
    setText(elements['customer-detail-title'], '客戶資料');
    setText(elements['inquiry-detail-title'], '詢價明細');
    show(elements['customer-detail-panel'], false);
    show(elements['inquiry-detail-panel'], false);
    show(elements['inquiry-section'], false);
    show(elements['item-section'], false);
    showGlobalError();
  }

  function clearProtectedState() {
    invalidateRequests();
    clearExpiryTimer();
    state.session = null;
    clearBusinessData();
    setText(elements['session-summary'], '');
    show(elements['pilot-view'], false);
  }

  function renderLoggedOut({ message = '', logoutUnconfirmed = false } = {}) {
    clearProtectedState();
    state.logoutUnconfirmed = logoutUnconfirmed;
    show(elements['login-view']);
    show(elements['logout-retry'], logoutUnconfirmed);
    elements['login-button'].disabled = logoutUnconfirmed;
    elements.username.disabled = logoutUnconfirmed;
    elements.password.disabled = logoutUnconfirmed;
    showLoginError(message);
    setStatus('', false);
  }

  function handleSessionLoss(message = '登入已失效，請重新登入。') {
    renderLoggedOut({ message });
    elements.password.value = '';
  }

  async function apiFetch(path, options = {}) {
    if (!isRequiredLocation()) throw new RequestError(0, '此頁面未在指定的本機網址運作。');
    if (typeof path !== 'string' || !path.startsWith('/api/')) throw new RequestError(0, '不允許的 API 路徑。');
    const expectedGeneration = options.generation ?? state.generation;
    const controller = new AbortController();
    state.controllers.add(controller);
    const headers = { Accept: 'application/json' };
    const request = {
      method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store',
      redirect: 'error', headers, signal: controller.signal,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(options.body);
    }
    try {
      const response = await window.fetch(path, request);
      if (expectedGeneration !== state.generation) throw new StaleRequestError();
      let payload = null;
      if ((response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
        try { payload = await response.json(); } catch { throw new RequestError(response.status, '伺服器回應格式不正確。'); }
      }
      if (expectedGeneration !== state.generation) throw new StaleRequestError();
      if (!response.ok) {
        if (response.status === 401 && !options.allowUnauthorized) handleSessionLoss();
        throw new RequestError(response.status, response.status === 401 ? '登入已失效。' : '無法完成要求。');
      }
      if (payload === null) throw new RequestError(response.status, '伺服器回應格式不正確。');
      return payload;
    } catch (error) {
      if (expectedGeneration !== state.generation) throw new StaleRequestError();
      throw error;
    } finally {
      state.controllers.delete(controller);
    }
  }

  function isCancelled(error) {
    return error?.name === 'AbortError' || error instanceof StaleRequestError;
  }

  function displayValue(value) {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  function displayDate(value) {
    if (typeof value !== 'string' || value.length === 0) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : formatDateTime.format(date);
  }

  function appendDetails(container, rows) {
    container.replaceChildren();
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      setText(term, label);
      setText(detail, displayValue(value));
      container.append(term, detail);
    }
  }

  function makeRecordButton(kind, title, meta, onClick) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const titleElement = document.createElement('span');
    const metaElement = document.createElement('span');
    button.type = 'button';
    button.className = 'record-button';
    button.dataset.testid = `${kind}-row`;
    titleElement.className = 'record-title';
    metaElement.className = 'record-meta';
    setText(titleElement, displayValue(title));
    setText(metaElement, displayValue(meta));
    button.append(titleElement, metaElement);
    button.addEventListener('click', onClick);
    item.append(button);
    return item;
  }

  function renderCustomers() {
    elements['customer-list'].replaceChildren();
    setText(elements['customer-count'], `${state.customers.length} 筆`);
    if (state.customers.length === 0) {
      setText(elements['customer-list-status'], '目前沒有測試客戶。');
      return;
    }
    setText(elements['customer-list-status'], '請選擇客戶查看資料。');
    for (const customer of state.customers) {
      elements['customer-list'].append(makeRecordButton('customer', customer.display_name,
        customer.contact_name || '未提供聯絡人', () => { void selectCustomer(customer.id); }));
    }
  }

  function renderCustomerDetail(customer) {
    state.selectedCustomer = customer;
    setText(elements['customer-detail-title'], displayValue(customer.display_name));
    appendDetails(elements['customer-detail'], [
      ['聯絡人', customer.contact_name], ['電子郵件', customer.email], ['電話', customer.phone],
      ['建立時間', displayDate(customer.created_at)],
    ]);
    setText(elements['customer-detail-status'], '');
  }

  function renderInquiries() {
    elements['inquiry-list'].replaceChildren();
    setText(elements['inquiry-count'], `${state.inquiries.length} 筆`);
    if (state.inquiries.length === 0) {
      setText(elements['inquiry-list-status'], '此客戶目前沒有詢價紀錄。');
      return;
    }
    setText(elements['inquiry-list-status'], '請選擇詢價查看品項。');
    for (const inquiry of state.inquiries) {
      elements['inquiry-list'].append(makeRecordButton('inquiry', inquiry.title,
        `${displayValue(inquiry.status)}・${displayDate(inquiry.created_at)}`, () => { void selectInquiry(inquiry.id); }));
    }
  }

  function renderInquiryDetail(inquiry) {
    state.selectedInquiry = inquiry;
    setText(elements['inquiry-detail-title'], displayValue(inquiry.title));
    appendDetails(elements['inquiry-detail'], [
      ['狀態', inquiry.status], ['建立時間', displayDate(inquiry.created_at)], ['更新時間', displayDate(inquiry.updated_at)],
    ]);
    setText(elements['inquiry-detail-status'], '');
  }

  function renderItems() {
    elements['item-list'].replaceChildren();
    setText(elements['item-count'], `${state.items.length} 筆`);
    if (state.items.length === 0) {
      setText(elements['item-list-status'], '此詢價目前沒有品項。');
      return;
    }
    setText(elements['item-list-status'], '');
    for (const item of state.items) {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      const quantity = document.createElement('span');
      const notes = document.createElement('p');
      row.dataset.testid = 'item-row';
      quantity.className = 'record-meta';
      notes.className = 'item-notes';
      setText(title, displayValue(item.description));
      setText(quantity, `數量：${displayValue(item.quantity)}`);
      setText(notes, `備註：${displayValue(item.notes)}`);
      row.append(title, quantity, notes);
      elements['item-list'].append(row);
    }
  }

  function scheduleExpiry(expiresAt) {
    clearExpiryTimer();
    const remaining = Number(expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      handleSessionLoss();
      return false;
    }
    const delay = Math.min(remaining, 2_147_483_647);
    state.expiryTimer = window.setTimeout(() => {
      if (delay < remaining) scheduleExpiry(expiresAt);
      else handleSessionLoss();
    }, delay);
    return true;
  }

  async function loadCustomers() {
    const generation = invalidateRequests();
    clearBusinessData();
    show(elements['pilot-view']);
    setText(elements['customer-list-status'], '正在載入客戶…');
    try {
      const payload = await apiFetch('/api/customers?limit=100', { generation });
      if (!Array.isArray(payload.customers)) throw new RequestError(200, '客戶資料格式不正確。');
      state.customers = payload.customers;
      renderCustomers();
    } catch (error) {
      if (isCancelled(error) || error.status === 401) return;
      setText(elements['customer-list-status'], '客戶載入失敗。');
      showGlobalError('無法載入測試客戶，請稍後再試。');
    }
  }

  async function selectCustomer(customerId) {
    const generation = invalidateRequests();
    state.selectedCustomer = null;
    state.inquiries = [];
    state.selectedInquiry = null;
    state.items = [];
    elements['customer-detail'].replaceChildren();
    elements['inquiry-list'].replaceChildren();
    show(elements['customer-detail-panel']);
    show(elements['inquiry-detail-panel'], false);
    show(elements['inquiry-section']);
    showGlobalError();
    setText(elements['customer-detail-status'], '正在載入客戶資料…');
    setText(elements['inquiry-list-status'], '正在載入詢價紀錄…');
    try {
      const [customerPayload, inquiryPayload] = await Promise.all([
        apiFetch(`/api/customers/${encodeURIComponent(customerId)}`, { generation }),
        apiFetch('/api/inquiries?limit=100', { generation }),
      ]);
      if (!customerPayload.customer || !Array.isArray(inquiryPayload.inquiries)) throw new RequestError(200, '資料格式不正確。');
      renderCustomerDetail(customerPayload.customer);
      state.inquiries = inquiryPayload.inquiries.filter((entry) => entry.customer_id === customerPayload.customer.id);
      renderInquiries();
    } catch (error) {
      if (isCancelled(error) || error.status === 401) return;
      setText(elements['customer-detail-status'], '客戶資料載入失敗。');
      setText(elements['inquiry-list-status'], '詢價紀錄載入失敗。');
      showGlobalError('無法載入客戶與詢價資料，請返回後再試。');
    }
  }

  async function selectInquiry(inquiryId) {
    if (!state.selectedCustomer) return;
    const expectedCustomerId = state.selectedCustomer.id;
    const generation = invalidateRequests();
    state.selectedInquiry = null;
    state.items = [];
    elements['inquiry-detail'].replaceChildren();
    elements['item-list'].replaceChildren();
    show(elements['customer-detail-panel'], false);
    show(elements['inquiry-detail-panel']);
    show(elements['item-section']);
    showGlobalError();
    setText(elements['inquiry-detail-status'], '正在載入詢價明細…');
    setText(elements['item-list-status'], '正在載入詢價品項…');
    try {
      const [inquiryPayload, itemPayload] = await Promise.all([
        apiFetch(`/api/inquiries/${encodeURIComponent(inquiryId)}`, { generation }),
        apiFetch(`/api/inquiries/${encodeURIComponent(inquiryId)}/items`, { generation }),
      ]);
      if (!inquiryPayload.inquiry || !Array.isArray(itemPayload.items)) throw new RequestError(200, '資料格式不正確。');
      if (inquiryPayload.inquiry.customer_id !== expectedCustomerId) throw new RequestError(409, '詢價與客戶不相符。');
      renderInquiryDetail(inquiryPayload.inquiry);
      state.items = itemPayload.items;
      renderItems();
    } catch (error) {
      if (isCancelled(error) || error.status === 401) return;
      setText(elements['inquiry-detail-status'], '詢價明細載入失敗。');
      setText(elements['item-list-status'], '詢價品項載入失敗。');
      showGlobalError('無法載入詢價明細與品項，請返回後再試。');
    }
  }

  async function rejectUnexpectedSession() {
    let confirmed = false;
    try {
      await apiFetch('/api/session', { method: 'DELETE', allowUnauthorized: true });
      confirmed = true;
    } catch (error) {
      if (isCancelled(error)) return;
      confirmed = error.status === 401;
    }
    renderLoggedOut({
      message: confirmed ? '此入口僅接受 viewer 測試帳號。' : '工作階段撤銷尚未確認，請重試登出。',
      logoutUnconfirmed: !confirmed,
    });
  }

  async function acceptSession(session, generation) {
    if (generation !== state.generation || state.logoutUnconfirmed) return;
    if (!session || session.role !== 'viewer' || typeof session.actorId !== 'string'
      || !Number.isFinite(Number(session.expiresAt))) {
      await rejectUnexpectedSession();
      return;
    }
    state.session = session;
    state.logoutUnconfirmed = false;
    show(elements['login-view'], false);
    show(elements['logout-retry'], false);
    showLoginError();
    show(elements['pilot-view']);
    setText(elements['session-summary'], `已登入：${session.actorId}（viewer）`);
    setStatus('', false);
    if (!scheduleExpiry(session.expiresAt)) return;
    await loadCustomers();
  }

  async function restoreSession({ afterPageRestore = false } = {}) {
    const generation = invalidateRequests();
    clearExpiryTimer();
    state.session = null;
    clearBusinessData();
    show(elements['login-view'], false);
    show(elements['pilot-view'], false);
    setStatus('正在確認登入狀態…');
    try {
      await apiFetch('/api/session', { generation, allowUnauthorized: true });
      // A surviving cookie cannot tell us whether an earlier DELETE failed.
      // Do not restore business data across a document/page lifecycle boundary.
      // Revoke the old session explicitly, then use the existing login form.
      renderLoggedOut({
        message: '既有工作階段尚未撤銷。請重試登出後重新登入。',
        logoutUnconfirmed: true,
      });
    } catch (error) {
      if (isCancelled(error)) return;
      if (error.status === 401) {
        renderLoggedOut({ message: afterPageRestore && state.wasAuthenticatedBeforePageHide ? '登入已失效，請重新登入。' : '' });
      } else {
        renderLoggedOut({ message: '無法確認工作階段是否已撤銷，請重試登出。', logoutUnconfirmed: true });
      }
    } finally {
      state.wasAuthenticatedBeforePageHide = false;
    }
  }

  async function login(event) {
    event.preventDefault();
    if (state.logoutUnconfirmed) return;
    const username = elements.username.value.trim();
    const password = elements.password.value;
    elements.password.value = '';
    showLoginError();
    if (!username || !password) {
      showLoginError('請輸入帳號與密碼。');
      return;
    }
    const generation = invalidateRequests();
    clearBusinessData();
    elements['login-button'].disabled = true;
    setStatus('正在登入…');
    try {
      await apiFetch('/api/session', { method: 'POST', body: { username, password }, generation, allowUnauthorized: true });
      const session = await apiFetch('/api/session', { generation });
      await acceptSession(session, generation);
    } catch (error) {
      if (isCancelled(error)) return;
      renderLoggedOut({ message: error.status === 401 ? '帳號或密碼不正確。' : '登入失敗，請稍後再試。' });
    } finally {
      if (!state.logoutUnconfirmed) elements['login-button'].disabled = false;
    }
  }

  async function logout() {
    state.logoutUnconfirmed = true;
    const generation = invalidateRequests();
    clearExpiryTimer();
    state.session = null;
    clearBusinessData();
    setText(elements['session-summary'], '');
    elements.password.value = '';
    show(elements['pilot-view'], false);
    show(elements['login-view']);
    elements['login-button'].disabled = true;
    elements.username.disabled = true;
    elements.password.disabled = true;
    showLoginError();
    show(elements['logout-retry'], false);
    setStatus('正在登出…');
    try {
      await apiFetch('/api/session', { method: 'DELETE', generation, allowUnauthorized: true });
      renderLoggedOut({ message: '已安全登出。' });
    } catch (error) {
      if (isCancelled(error)) return;
      if (error.status === 401) {
        renderLoggedOut({ message: '已安全登出。' });
      } else {
        renderLoggedOut({ message: '登出撤銷尚未確認。請重試登出後再登入。', logoutUnconfirmed: true });
      }
    }
  }

  function backToCustomers() {
    invalidateRequests();
    state.selectedCustomer = null;
    state.inquiries = [];
    state.selectedInquiry = null;
    state.items = [];
    for (const id of ['customer-detail', 'inquiry-list', 'inquiry-detail', 'item-list']) elements[id].replaceChildren();
    show(elements['customer-detail-panel'], false);
    show(elements['inquiry-detail-panel'], false);
    showGlobalError();
  }

  function backToInquiries() {
    invalidateRequests();
    state.selectedInquiry = null;
    state.items = [];
    elements['inquiry-detail'].replaceChildren();
    elements['item-list'].replaceChildren();
    show(elements['inquiry-detail-panel'], false);
    show(elements['customer-detail-panel']);
    showGlobalError();
  }

  function bindEvents() {
    elements['login-form'].addEventListener('submit', login);
    elements['logout-button'].addEventListener('click', () => { void logout(); });
    elements['retry-logout-button'].addEventListener('click', () => { void logout(); });
    elements['back-to-customers'].addEventListener('click', backToCustomers);
    elements['back-to-inquiries'].addEventListener('click', backToInquiries);
    window.addEventListener('pagehide', () => {
      state.wasAuthenticatedBeforePageHide = Boolean(state.session);
      clearProtectedState();
    });
    window.addEventListener('pageshow', (event) => {
      if (state.initialized && event.persisted && isRequiredLocation()) void restoreSession({ afterPageRestore: true });
    });
  }

  function initialize() {
    cacheElements();
    bindEvents();
    state.initialized = true;
    if (!isRequiredLocation()) {
      clearProtectedState();
      show(elements['environment-blocked']);
      show(elements['login-view'], false);
      show(elements['pilot-view'], false);
      setStatus('', false);
      return;
    }
    show(elements['environment-blocked'], false);
    void restoreSession();
  }

  document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
