import { badge, emptyState, escapeHtml, layout, statusLabel, weightLabel } from '../components/ui.js';
import {
  getActivitiesByTaskId,
  getBlockingTasks,
  getDependencyTasks,
  getProjectById,
  getTaskById,
  getTeamById,
  getVisibleAttachmentsByTaskId,
  getVisibleTaskById,
  canWriteTask,
  getWorkspaceById
} from '../store/selectors.js';
import { TASK_STATUSES } from '../store/state-utils.js';

export function renderTaskPage(state, taskId) {
  const task = getVisibleTaskById(state, taskId) || getVisibleTaskById(state, state.selectedTaskId) || null;
  if (!task) {
    return layout({
      state,
      title: 'Task unavailable',
      subtitle: 'This task is not visible to the selected mock user.',
      breadcrumbs: [{ label: 'Workspace', href: '#/workspace/workspace-camp' }],
      actions: '<a class="v2-btn" href="#/workspace/workspace-camp">Back to Workspace</a>',
      content: '<section class="v2-card"><h2>Unauthorized</h2><p>The mock visibility rules hide this task for the current user.</p></section>'
    });
  }
  const team = getTeamById(state, task.teamId) || state.teams[0];
  const project = getProjectById(state, task.projectId) || state.projects[0];
  const workspace = getWorkspaceById(state, project.workspaceId) || state.workspaces[0];
  const dependencies = getDependencyTasks(state, task);
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
            <div><dt>Status</dt><dd>${renderStatusControl(state, task)}</dd></div>
            <div><dt>Owner</dt><dd>${renderAssigneeControl(state, task, state.members)}</dd></div>
            <div><dt>Team</dt><dd>${escapeHtml(team.name)}</dd></div>
            <div><dt>Due Date</dt><dd>${renderDueDateControl(state, task)}</dd></div>
            <div><dt>Size</dt><dd>${escapeHtml(weightLabel(task.weight))} (${task.weight} points)</dd></div>
            <div><dt>Next Action</dt><dd>${escapeHtml(task.nextAction)}</dd></div>
            ${task.blocked ? `<div><dt>Blocked Reason</dt><dd>${escapeHtml(task.blockedReason || 'Blocked by current status.')}</dd></div>` : ''}
          </dl>
        </article>
        <aside class="v2-card">
          <h2>Dependencies</h2>
          <h3>Depends on</h3>
          ${dependencies.map((item) => `<a class="v2-list-link" href="#/task/${item.id}">${escapeHtml(item.title)}</a>`).join('') || emptyState('No dependencies', 'This task can proceed independently.')}
          <h3>Blocking</h3>
          ${blocking.map((item) => `<a class="v2-list-link" href="#/task/${item.id}">${escapeHtml(item.title)}</a>`).join('') || emptyState('Blocking none', 'No downstream tasks wait on this task.')}
        </aside>
      </section>
      <section class="v2-two-column">
        <div class="v2-card">
          <h2>External Links</h2>
          ${links.map((link) => `
            <a class="v2-list-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(link.title)}</strong>
              <span>${escapeHtml(link.type)} - ${escapeHtml(link.note)}</span>
            </a>
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

function getDisplayOwner(state, task) {
  const member = state.members.find((item) => item.id === (task.assigneeId || task.ownerId));
  return member?.name || 'Unassigned';
}
