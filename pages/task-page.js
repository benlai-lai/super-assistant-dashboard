import { badge, emptyState, escapeHtml, layout, statusLabel, weightLabel } from '../components/ui.js';
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
    subtitle: 'Task detail page for reviewing ownership, dates, dependencies, blockers, and external links.',
    breadcrumbs: [
      { label: 'Workspace', href: `#/workspace/${workspace.id}` },
      { label: 'Project', href: `#/project/${project.id}` },
      { label: 'Team', href: `#/team/${team.id}` },
      { label: 'Task', href: `#/task/${task.id}` }
    ],
    actions: renderTaskActions(state, task, team),
    content: `
      <section class="v2-two-column wide-left">
        <article class="v2-card">
          <div class="v2-card-head">
            <div><span class="v2-eyebrow">Task</span><h2>${escapeHtml(task.title)}</h2></div>
            ${badge(statusLabel(task.status), task.status === 'blocked' || task.blocked ? 'danger' : task.status === 'done' ? 'good' : 'neutral')}
          </div>
          <dl class="v2-detail-list">
            <div><dt>Title</dt><dd>${renderTextControl(state, task, 'title', task.title)}</dd></div>
            <div><dt>Status</dt><dd>${renderStatusControl(state, task)}</dd></div>
            <div><dt>Owner</dt><dd>${renderAssigneeControl(state, task, state.members)}</dd></div>
            <div><dt>Team</dt><dd>${escapeHtml(team.name)}</dd></div>
            <div><dt>Due Date</dt><dd>${renderDueDateControl(state, task)}</dd></div>
            <div><dt>Size</dt><dd>${escapeHtml(weightLabel(task.weight))} (${task.weight} points)</dd></div>
            <div><dt>Visibility</dt><dd>${renderVisibilityControl(state, task)}</dd></div>
            <div><dt>Next Action</dt><dd>${renderTextControl(state, task, 'nextAction', task.nextAction || '')}</dd></div>
            <div><dt>Risk</dt><dd>${renderRiskControl(state, task)}</dd></div>
            <div><dt>Description</dt><dd>${renderTextControl(state, task, 'description', task.description || '', true)}</dd></div>
            ${task.blocked ? `<div><dt>Blocked Reason</dt><dd>${escapeHtml(task.blockedReason || 'Blocked by current status.')}</dd></div>` : ''}
          </dl>
        </article>
        <aside class="v2-card">
          <h2>Dependencies</h2>
          ${renderDependencyForm(state, task, availableDependencies)}
          <h3>Depends on</h3>
          ${dependencies.map((item) => `
            <div class="v2-list-link">
              <a href="#/task/${item.id}">${escapeHtml(item.title)}</a>
              ${canWriteTask(state, task) ? `<button class="v2-inline-danger" type="button" data-action="remove-task-dependency" data-task-id="${escapeHtml(task.id)}" data-dependency-task-id="${escapeHtml(item.id)}">Remove</button>` : ''}
            </div>
          `).join('') || emptyState('No dependencies', 'This task can proceed independently.')}
          <h3>Blocking</h3>
          ${blocking.map((item) => `<a class="v2-list-link" href="#/task/${item.id}">${escapeHtml(item.title)}</a>`).join('') || emptyState('Blocking none', 'No downstream tasks wait on this task.')}
        </aside>
      </section>
      <section class="v2-two-column">
        <div class="v2-card">
          <h2>External Links</h2>
          ${renderExternalLinkForm(state, task)}
          ${links.map((link) => `
            <div class="v2-list-link">
              <a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
                <strong>${escapeHtml(link.title)}</strong>
                <span>${escapeHtml(link.type)} - ${escapeHtml(link.note)}</span>
              </a>
              ${canWriteAttachment(state, link) ? renderExternalLinkEditForm(link) : ''}
            </div>
          `).join('') || emptyState('No external links', 'Phase 1 stores links only. Files remain in the original cloud service.')}
        </div>
        <div class="v2-card">
          <h2>Activity</h2>
          ${activity.map((item) => `
            <div class="v2-list-item">
              <div><strong>${escapeHtml(item.type.replace('_', ' '))}</strong><span>${escapeHtml(item.text)} - ${escapeHtml(item.createdAt)}</span></div>
            </div>
          `).join('') || emptyState('No activity yet', 'Task activity will appear here when mock events exist.')}
        </div>
      </section>
    `
  });
}

function renderStatusControl(state, task) {
  if (!canWriteTask(state, task)) return escapeHtml(statusLabel(task.status));
  return `
    <label class="v2-status-control">
      <span class="sr-only">Task status</span>
      <select data-action="update-task-status" data-task-id="${escapeHtml(task.id)}">
        ${TASK_STATUSES.map((status) => `<option value="${status}" ${task.status === status ? 'selected' : ''}>${escapeHtml(statusLabel(status))}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderVisibilityControl(state, task) {
  if (!canWriteTask(state, task)) return escapeHtml(task.visibility || 'private');
  return `
    <label class="v2-status-control">
      <span class="sr-only">Task visibility</span>
      <select data-action="update-task-field" data-task-id="${escapeHtml(task.id)}" data-field="visibility">
        ${visibilityOptions(task.visibility || 'private')}
      </select>
    </label>
  `;
}

function renderRiskControl(state, task) {
  if (!canWriteTask(state, task)) return escapeHtml(task.riskStatus || 'Low');
  return `
    <label class="v2-status-control">
      <span class="sr-only">Task risk</span>
      <select data-action="update-task-field" data-task-id="${escapeHtml(task.id)}" data-field="riskStatus">
        ${['Low', 'Medium', 'High'].map((value) => `<option value="${value}" ${value === (task.riskStatus || 'Low') ? 'selected' : ''}>${value}</option>`).join('')}
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
        <span>Add dependency</span>
        <select name="dependencyTaskId" ${options.length ? '' : 'disabled'}>
          ${options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('')}
        </select>
      </label>
      <button type="submit" class="v2-btn" ${options.length ? '' : 'disabled'}>Add</button>
    </form>
  `;
}

function renderExternalLinkForm(state, task) {
  if (!canWriteTask(state, task)) return '';
  return `
    <form data-action="add-external-link" class="v2-form compact">
      <input type="hidden" name="taskId" value="${escapeHtml(task.id)}">
      <label><span>Title</span><input type="text" name="title" required></label>
      <label><span>Type</span><input type="text" name="type" value="External Link"></label>
      <label><span>URL</span><input type="url" name="url" placeholder="https://example.com" required></label>
      <label><span>Note</span><input type="text" name="note"></label>
      <label><span>Visibility</span><select name="visibility">${visibilityOptions(task.visibility || 'team')}</select></label>
      <button type="submit" class="v2-btn">Add Link</button>
    </form>
  `;
}

function renderExternalLinkEditForm(link) {
  return `
    <form data-action="edit-external-link" class="v2-form compact">
      <input type="hidden" name="attachmentId" value="${escapeHtml(link.id)}">
      <label><span>Title</span><input type="text" name="title" value="${escapeHtml(link.title)}" required></label>
      <label><span>Type</span><input type="text" name="type" value="${escapeHtml(link.type || 'External Link')}"></label>
      <label><span>URL</span><input type="url" name="url" value="${escapeHtml(link.url)}" required></label>
      <label><span>Note</span><input type="text" name="note" value="${escapeHtml(link.note || '')}"></label>
      <label><span>Visibility</span><select name="visibility">${visibilityOptions(link.visibility || 'private')}</select></label>
      <div class="v2-form-actions">
        <button type="submit" class="v2-btn">Save Link</button>
        <button type="button" class="v2-btn danger" data-action="remove-external-link" data-attachment-id="${escapeHtml(link.id)}">Remove</button>
      </div>
    </form>
  `;
}

function visibilityOptions(selected) {
  return ['private', 'assigned', 'team', 'project', 'workspace']
    .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`)
    .join('');
}

function renderTaskActions(state, task, team) {
  if (!canWriteTask(state, task)) {
    return `<a class="v2-btn" href="#/team/${team.id}">Back to Team</a><span class="v2-readonly-note">Read-only for this mock user</span>`;
  }
  const primaryAction = task.status === 'done'
    ? `<button class="v2-btn" type="button" data-action="reopen-task" data-task-id="${escapeHtml(task.id)}">Reopen Task</button>`
    : `<button class="v2-btn primary" type="button" data-action="complete-task" data-task-id="${escapeHtml(task.id)}">Complete Task</button>`;

  return `
    <a class="v2-btn" href="#/team/${team.id}">Back to Team</a>
    ${primaryAction}
    <button class="v2-btn danger" type="button" data-action="delete-task" data-task-id="${escapeHtml(task.id)}" data-team-id="${escapeHtml(team.id)}">Delete Task</button>
  `;
}

function renderAssigneeControl(state, task, members) {
  if (!canWriteTask(state, task)) return escapeHtml(getDisplayOwner(state, task));
  const currentId = task.assigneeId || task.ownerId;
  return `
    <label class="v2-status-control">
      <span class="sr-only">Task owner</span>
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
      <span class="sr-only">Task due date</span>
      <input type="date" data-action="update-task-due-date" data-task-id="${escapeHtml(task.id)}" value="${escapeHtml(task.dueDate || '')}">
    </label>
  `;
}

function renderDeniedPage() {
  return `
    <aside class="v2-sidebar">
      <div class="v2-brand">Dashboard V2<span>Prototype</span></div>
      <nav class="v2-nav" aria-label="Prototype navigation">
        <a href="#/workspace/workspace-camp">Workspace</a>
        <a href="#/my-tasks">My Tasks</a>
      </nav>
      <p class="v2-sidebar-note">Static Vanilla JS prototype with local browser persistence.</p>
    </aside>
    <main class="v2-main">
      <header class="v2-topbar">
        <div>
          <div class="v2-crumbs"><a href="#/workspace/workspace-camp">Workspace</a></div>
          <h1>無法查看此內容</h1>
          <p>目前選取的 mock user 沒有權限查看此內容，或此內容不存在。</p>
        </div>
        <div class="v2-actions"><a class="v2-btn" href="#/workspace/workspace-camp">Back to Workspace</a></div>
      </header>
      <section class="v2-card"><h2>無法查看此內容</h2><p>請返回 Workspace，或在可查看頁面切換具備授權的 mock user。</p></section>
    </main>
  `;
}

function getDisplayOwner(state, task) {
  const member = state.members.find((item) => item.id === (task.assigneeId || task.ownerId));
  return member?.name || 'Unassigned';
}
