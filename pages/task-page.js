import { badge, emptyState, escapeHtml, layout, riskLabel, statusLabel, visibilityLabel, weightLabel } from '../components/ui.js';
import {
  getActivitiesByTaskId,
  getAvailableDependencyTasks,
  getBlockingTasks,
  getDependencyTasks,
  getProjectById,
  getTeamById,
  getVisibleAttachmentsByTaskId,
  getVisibleTaskById,
  canReadTask,
  canWriteTask,
  canWriteAttachment,
  getWorkspaceById
} from '../store/selectors.js';
import { TASK_STATUSES } from '../store/state-utils.js';

export function renderTaskPage(state, taskId) {
  if (!canReadTask(state, taskId)) return renderDeniedPage(state);

  const task = getVisibleTaskById(state, taskId);
  const team = getTeamById(state, task.teamId) || state.teams[0];
  const project = getProjectById(state, task.projectId) || state.projects[0];
  const workspace = getWorkspaceById(state, project.workspaceId) || state.workspaces[0];
  const dependencies = getDependencyTasks(state, task);
  const availableDependencies = getAvailableDependencyTasks(state, task.id);
  const blocking = getBlockingTasks(state, task.id);
  const links = getVisibleAttachmentsByTaskId(state, task.id);
  const activity = getActivitiesByTaskId(state, task.id);

  return layout({
    state,
    title: task.title,
    subtitle: '任務詳細頁，用來檢視負責人、日期、依賴、阻塞與外部連結。',
    breadcrumbs: [
      { label: '工作區', href: `#/workspace/${workspace.id}` },
      { label: '專案', href: `#/project/${project.id}` },
      { label: '團隊', href: `#/team/${team.id}` },
      { label: '任務', href: `#/task/${task.id}` }
    ],
    actions: renderTaskActions(state, task, team),
    content: `
      <section class="v2-two-column wide-left">
        <article class="v2-card">
          <div class="v2-card-head">
            <div><span class="v2-eyebrow">任務</span><h2>${escapeHtml(task.title)}</h2></div>
            ${badge(statusLabel(task.status), task.status === 'blocked' || task.blocked ? 'danger' : task.status === 'done' ? 'good' : 'neutral')}
          </div>
          <dl class="v2-detail-list">
            <div><dt>標題</dt><dd>${renderTextControl(state, task, 'title', task.title)}</dd></div>
            <div><dt>狀態</dt><dd>${renderStatusControl(state, task)}</dd></div>
            <div><dt>負責人</dt><dd>${renderAssigneeControl(state, task, state.members)}</dd></div>
            <div><dt>團隊</dt><dd>${escapeHtml(team.name)}</dd></div>
            <div><dt>截止日期</dt><dd>${renderDueDateControl(state, task)}</dd></div>
            <div><dt>大小</dt><dd>${escapeHtml(weightLabel(task.weight))}（${task.weight} 點）</dd></div>
            <div><dt>可見範圍</dt><dd>${renderVisibilityControl(state, task)}</dd></div>
            <div><dt>下一步</dt><dd>${renderTextControl(state, task, 'nextAction', task.nextAction || '')}</dd></div>
            <div><dt>風險</dt><dd>${renderRiskControl(state, task)}</dd></div>
            <div><dt>說明</dt><dd>${renderTextControl(state, task, 'description', task.description || '', true)}</dd></div>
            ${task.blocked ? `<div><dt>阻塞原因</dt><dd>${escapeHtml(task.blockedReason || '目前狀態為受阻。')}</dd></div>` : ''}
          </dl>
        </article>
        <aside class="v2-card">
          <h2>依賴任務</h2>
          ${renderDependencyForm(state, task, availableDependencies)}
          <h3>此任務依賴</h3>
          ${dependencies.map((item) => `
            <div class="v2-list-link">
              <a href="#/task/${item.id}">${escapeHtml(item.title)}</a>
              ${canWriteTask(state, task) ? `<button class="v2-inline-danger" type="button" data-action="remove-task-dependency" data-task-id="${escapeHtml(task.id)}" data-dependency-task-id="${escapeHtml(item.id)}">移除</button>` : ''}
            </div>
          `).join('') || emptyState('沒有依賴任務', '此任務可以獨立進行。')}
          <h3>阻塞其他任務</h3>
          ${blocking.map((item) => `<a class="v2-list-link" href="#/task/${item.id}">${escapeHtml(item.title)}</a>`).join('') || emptyState('沒有阻塞項目', '目前沒有其他任務等待此任務完成。')}
        </aside>
      </section>
      <section class="v2-two-column">
        <div class="v2-card">
          <h2>外部連結</h2>
          ${renderExternalLinkForm(state, task)}
          ${links.map((link) => `
            <div class="v2-list-link">
              <a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
                <strong>${escapeHtml(link.title)}</strong>
                <span>${escapeHtml(link.type)} - ${escapeHtml(link.note)}</span>
              </a>
              ${canWriteAttachment(state, link) ? renderExternalLinkEditForm(link) : ''}
            </div>
          `).join('') || emptyState('沒有外部連結', '本階段只儲存外部連結資訊，檔案仍留在原本的雲端服務。')}
        </div>
        <div class="v2-card">
          <h2>活動紀錄</h2>
          ${activity.map((item) => `
            <div class="v2-list-item">
              <div><strong>${escapeHtml(activityTypeLabel(item.type))}</strong><span>${escapeHtml(item.text)} - ${escapeHtml(item.createdAt)}</span></div>
            </div>
          `).join('') || emptyState('尚無活動紀錄', '有模擬事件時，任務活動會顯示在這裡。')}
        </div>
      </section>
    `
  });
}

function renderStatusControl(state, task) {
  if (!canWriteTask(state, task)) return escapeHtml(statusLabel(task.status));
  return `
    <label class="v2-status-control">
      <span class="sr-only">任務狀態</span>
      <select data-action="update-task-status" data-task-id="${escapeHtml(task.id)}">
        ${TASK_STATUSES.map((status) => `<option value="${status}" ${task.status === status ? 'selected' : ''}>${escapeHtml(statusLabel(status))}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderVisibilityControl(state, task) {
  if (!canWriteTask(state, task)) return escapeHtml(visibilityLabel(task.visibility || 'private'));
  return `
    <label class="v2-status-control">
      <span class="sr-only">任務可見範圍</span>
      <select data-action="update-task-field" data-task-id="${escapeHtml(task.id)}" data-field="visibility">
        ${visibilityOptions(task.visibility || 'private')}
      </select>
    </label>
  `;
}

function renderRiskControl(state, task) {
  if (!canWriteTask(state, task)) return escapeHtml(riskLabel(task.riskStatus || 'Low'));
  return `
    <label class="v2-status-control">
      <span class="sr-only">任務風險</span>
      <select data-action="update-task-field" data-task-id="${escapeHtml(task.id)}" data-field="riskStatus">
        ${['Low', 'Medium', 'High'].map((value) => `<option value="${value}" ${value === (task.riskStatus || 'Low') ? 'selected' : ''}>${escapeHtml(riskLabel(value))}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderTextControl(state, task, field, value, multiline = false) {
  if (!canWriteTask(state, task)) return escapeHtml(value || '—');
  if (multiline) {
    return `<textarea class="v2-inline-input" data-action="update-task-field" data-task-id="${escapeHtml(task.id)}" data-field="${escapeHtml(field)}" rows="3">${escapeHtml(value)}</textarea>`;
  }
  return `<input class="v2-inline-input" type="text" data-action="update-task-field" data-task-id="${escapeHtml(task.id)}" data-field="${escapeHtml(field)}" value="${escapeHtml(value)}">`;
}

function renderDependencyForm(state, task, options) {
  if (!canWriteTask(state, task)) return '';
  return `
    <form data-action="add-task-dependency" class="v2-form compact">
      <input type="hidden" name="taskId" value="${escapeHtml(task.id)}">
      <label>
        <span>新增依賴任務</span>
        <select name="dependencyTaskId" ${options.length ? '' : 'disabled'}>
          ${options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('')}
        </select>
      </label>
      <button type="submit" class="v2-btn" ${options.length ? '' : 'disabled'}>新增</button>
    </form>
  `;
}

function renderExternalLinkForm(state, task) {
  if (!canWriteTask(state, task)) return '';
  return `
    <form data-action="add-external-link" class="v2-form compact">
      <input type="hidden" name="taskId" value="${escapeHtml(task.id)}">
      <label><span>標題</span><input type="text" name="title" required></label>
      <label><span>類型</span><input type="text" name="type" value="外部連結"></label>
      <label><span>URL</span><input type="url" name="url" placeholder="https://example.com" required></label>
      <label><span>備註</span><input type="text" name="note"></label>
      <label><span>可見範圍</span><select name="visibility">${visibilityOptions(task.visibility || 'team')}</select></label>
      <button type="submit" class="v2-btn">新增連結</button>
    </form>
  `;
}

function renderExternalLinkEditForm(link) {
  return `
    <form data-action="edit-external-link" class="v2-form compact">
      <input type="hidden" name="attachmentId" value="${escapeHtml(link.id)}">
      <label><span>標題</span><input type="text" name="title" value="${escapeHtml(link.title)}" required></label>
      <label><span>類型</span><input type="text" name="type" value="${escapeHtml(link.type || '外部連結')}"></label>
      <label><span>URL</span><input type="url" name="url" value="${escapeHtml(link.url)}" required></label>
      <label><span>備註</span><input type="text" name="note" value="${escapeHtml(link.note || '')}"></label>
      <label><span>可見範圍</span><select name="visibility">${visibilityOptions(link.visibility || 'private')}</select></label>
      <div class="v2-form-actions">
        <button type="submit" class="v2-btn">儲存連結</button>
        <button type="button" class="v2-btn danger" data-action="remove-external-link" data-attachment-id="${escapeHtml(link.id)}">移除</button>
      </div>
    </form>
  `;
}

function visibilityOptions(selected) {
  return ['private', 'assigned', 'team', 'project', 'workspace']
    .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(visibilityLabel(value))}</option>`)
    .join('');
}

function renderTaskActions(state, task, team) {
  if (!canWriteTask(state, task)) {
    return `<a class="v2-btn" href="#/team/${team.id}">回到團隊</a><span class="v2-readonly-note">此模擬使用者為唯讀</span>`;
  }
  const primaryAction = task.status === 'done'
    ? `<button class="v2-btn" type="button" data-action="reopen-task" data-task-id="${escapeHtml(task.id)}">重新開啟任務</button>`
    : `<button class="v2-btn primary" type="button" data-action="complete-task" data-task-id="${escapeHtml(task.id)}">完成任務</button>`;

  return `
    <a class="v2-btn" href="#/team/${team.id}">回到團隊</a>
    ${primaryAction}
    <button class="v2-btn danger" type="button" data-action="delete-task" data-task-id="${escapeHtml(task.id)}" data-team-id="${escapeHtml(team.id)}">刪除任務</button>
  `;
}

function renderAssigneeControl(state, task, members) {
  if (!canWriteTask(state, task)) return escapeHtml(getDisplayOwner(state, task));
  const currentId = task.assigneeId || task.ownerId;
  return `
    <label class="v2-status-control">
      <span class="sr-only">任務負責人</span>
      <select data-action="update-task-assignee" data-task-id="${escapeHtml(task.id)}">
        ${members.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === currentId ? 'selected' : ''}>${escapeHtml(member.name)}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderDueDateControl(state, task) {
  if (!canWriteTask(state, task)) return escapeHtml(task.dueDate || '—');
  return `
    <label class="v2-status-control">
      <span class="sr-only">任務截止日期</span>
      <input type="date" data-action="update-task-due-date" data-task-id="${escapeHtml(task.id)}" value="${escapeHtml(task.dueDate || '')}">
    </label>
  `;
}

function renderDeniedPage() {
  return `
    <aside class="v2-sidebar">
      <div class="v2-brand">儀表板 V2<span>原型</span></div>
      <nav class="v2-nav" aria-label="原型導覽">
        <a href="#/workspace/workspace-camp">工作區</a>
        <a href="#/my-tasks">我的任務</a>
      </nav>
      <p class="v2-sidebar-note">靜態 Vanilla JS 原型，使用本機瀏覽器保存資料。</p>
    </aside>
    <main class="v2-main">
      <header class="v2-topbar">
        <div>
          <div class="v2-crumbs"><a href="#/workspace/workspace-camp">工作區</a></div>
          <h1>無法查看此內容</h1>
          <p>目前選取的模擬使用者沒有權限查看此內容，或此內容不存在。</p>
        </div>
        <div class="v2-actions"><a class="v2-btn" href="#/workspace/workspace-camp">回到工作區</a></div>
      </header>
      <section class="v2-card"><h2>無法查看此內容</h2><p>請返回工作區，或在可查看頁面切換具備授權的模擬使用者。</p></section>
    </main>
  `;
}

function getDisplayOwner(state, task) {
  const member = state.members.find((item) => item.id === (task.assigneeId || task.ownerId));
  return member?.name || '未指派';
}

function activityTypeLabel(type) {
  const labels = {
    note: '紀錄',
    status_change: '狀態變更',
    external_link: '外部連結',
    dependency: '依賴任務'
  };
  return labels[type] || String(type || '').replace('_', ' ');
}
