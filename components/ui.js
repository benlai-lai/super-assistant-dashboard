export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function statusLabel(status) {
  const labels = {
    'not-started': '未開始',
    'in-progress': '進行中',
    blocked: '受阻',
    done: '完成',
    archived: '已封存'
  };
  return labels[status] || status;
}

export function displayDate(value) {
  return value || '—';
}

export function weightLabel(weight = 2) {
  if (weight <= 1) return '小';
  if (weight >= 3) return '大';
  return '中';
}

export function roleLabel(role) {
  const labels = {
    'Workspace Owner': '工作區擁有者',
    'Workspace Admin': '工作區管理員',
    'Project Manager': '專案經理',
    'Team Lead': '團隊負責人',
    Member: '成員',
    Viewer: '檢視者'
  };
  return labels[role] || role;
}

export function visibilityLabel(visibility) {
  const labels = {
    private: '私人',
    assigned: '指派對象',
    team: '團隊',
    project: '專案',
    workspace: '工作區'
  };
  return labels[visibility] || visibility;
}

export function riskLabel(value) {
  const labels = {
    Low: '低',
    Medium: '中',
    High: '高',
    'High Risk': '高風險',
    Delayed: '延遲',
    Attention: '需注意',
    Healthy: '正常',
    Overloaded: '負荷過高',
    Normal: '正常'
  };
  return labels[value] || value;
}

export function workloadLabel(value) {
  const labels = {
    Low: '低',
    Normal: '正常',
    Overloaded: '負荷過高'
  };
  return labels[value] || value;
}

export function badge(text, tone = 'neutral') {
  return `<span class="v2-badge ${tone}">${escapeHtml(text)}</span>`;
}

export function progressBar(percent) {
  return `
    <div class="v2-progress" aria-label="進度 ${percent}%">
      <span style="width:${Math.max(0, Math.min(100, percent))}%"></span>
    </div>
  `;
}

export function emptyState(title, detail) {
  return `<div class="v2-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

export function renderUserSwitcher(state) {
  const current = state.members.find((member) => member.id === state.currentUserId) || state.members[0];
  return `
    <label class="v2-user-switcher">
      <span>模擬使用者</span>
      <select data-action="switch-current-user" aria-label="模擬使用者">
        ${state.members.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === current.id ? 'selected' : ''}>${escapeHtml(member.name)} — ${escapeHtml(roleLabel(member.role))}</option>`).join('')}
      </select>
    </label>
  `;
}

export function layout({ state, title, subtitle, breadcrumbs = [], actions = '', content }) {
  const switcher = state ? renderUserSwitcher(state) : '';
  return `
    <aside class="v2-sidebar">
      <div class="v2-brand">儀表板 V2<span>原型</span></div>
      <nav class="v2-nav" aria-label="原型導覽">
        <a href="#/workspace/workspace-camp">工作區</a>
        <a href="#/project/project-summer-camp">專案</a>
        <a href="#/team/team-checkin">團隊</a>
        <a href="#/my-tasks">我的任務</a>
      </nav>
      ${switcher}
      <p class="v2-sidebar-note">靜態 Vanilla JS 原型，使用本機瀏覽器保存資料。沒有後端、登入或 Supabase。</p>
    </aside>
    <main class="v2-main">
      <header class="v2-topbar">
        <div>
          <div class="v2-crumbs">${breadcrumbs.map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join('<span>/</span>')}</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="v2-actions">${actions}</div>
      </header>
      ${content}
    </main>
  `;
}
