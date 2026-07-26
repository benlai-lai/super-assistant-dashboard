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
    'not-started': 'Not Started',
    'in-progress': 'In Progress',
    blocked: 'Blocked',
    done: 'Done',
    archived: 'Archived'
  };
  return labels[status] || status;
}

export function weightLabel(weight = 2) {
  if (weight <= 1) return 'Small';
  if (weight >= 3) return 'Large';
  return 'Medium';
}

export function badge(text, tone = 'neutral') {
  return `<span class="v2-badge ${tone}">${escapeHtml(text)}</span>`;
}

export function progressBar(percent) {
  return `
    <div class="v2-progress" aria-label="Progress ${percent}%">
      <span style="width:${Math.max(0, Math.min(100, percent))}%"></span>
    </div>
  `;
}

export function emptyState(title, detail) {
  return `<div class="v2-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

export function layout({ title, subtitle, breadcrumbs = [], actions = '', content }) {
  return `
    <aside class="v2-sidebar">
      <div class="v2-brand">Dashboard V2<span>Prototype</span></div>
      <nav class="v2-nav" aria-label="Prototype navigation">
        <a href="#/workspace/workspace-camp">Workspace</a>
        <a href="#/project/project-summer-camp">Project</a>
        <a href="#/team/team-checkin">Team</a>
        <a href="#/my-tasks">My Tasks</a>
      </nav>
      <p class="v2-sidebar-note">Static Vanilla JS prototype with local browser persistence. No backend, auth, or Supabase.</p>
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
