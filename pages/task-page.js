import { badge, emptyState, escapeHtml, layout, statusLabel, weightLabel } from '../components/ui.js';
import {
  getActivitiesByTaskId,
  getAttachmentsByTaskId,
  getBlockingTasks,
  getDependencyTasks,
  getProjectById,
  getTaskById,
  getTeamById,
  getWorkspaceById
} from '../store/selectors.js';
import { TASK_STATUSES } from '../store/state-utils.js';

export function renderTaskPage(state, taskId) {
  const task = getTaskById(state, taskId) || state.tasks[0];
  const team = getTeamById(state, task.teamId) || state.teams[0];
  const project = getProjectById(state, task.projectId) || state.projects[0];
  const workspace = getWorkspaceById(state, project.workspaceId) || state.workspaces[0];
  const dependencies = getDependencyTasks(state, task);
  const blocking = getBlockingTasks(state, task.id);
  const links = getAttachmentsByTaskId(state, task.id);
  const activity = getActivitiesByTaskId(state, task.id);

  return layout({
    title: task.title,
    subtitle: 'Task detail page for reviewing ownership, dates, dependencies, blockers, and external links.',
    breadcrumbs: [
      { label: 'Workspace', href: `#/workspace/${workspace.id}` },
      { label: 'Project', href: `#/project/${project.id}` },
      { label: 'Team', href: `#/team/${team.id}` },
      { label: 'Task', href: `#/task/${task.id}` }
    ],
    actions: `<a class="v2-btn" href="#/team/${team.id}">Back to Team</a>`,
    content: `
      <section class="v2-two-column wide-left">
        <article class="v2-card">
          <div class="v2-card-head">
            <div><span class="v2-eyebrow">Task</span><h2>${escapeHtml(task.title)}</h2></div>
            ${badge(statusLabel(task.status), task.status === 'blocked' || task.blocked ? 'danger' : task.status === 'done' ? 'good' : 'neutral')}
          </div>
          <dl class="v2-detail-list">
            <div><dt>Status</dt><dd>${renderStatusControl(task)}</dd></div>
            <div><dt>Owner</dt><dd>${renderAssigneeControl(task, state.members)}</dd></div>
            <div><dt>Team</dt><dd>${escapeHtml(team.name)}</dd></div>
            <div><dt>Due Date</dt><dd>${renderDueDateControl(task)}</dd></div>
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

function renderStatusControl(task) {
  return `
    <label class="v2-status-control">
      <span class="sr-only">Task status</span>
      <select data-action="update-task-status" data-task-id="${escapeHtml(task.id)}">
        ${TASK_STATUSES.map((status) => `<option value="${status}" ${task.status === status ? 'selected' : ''}>${escapeHtml(statusLabel(status))}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderAssigneeControl(task, members) {
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

function renderDueDateControl(task) {
  return `
    <label class="v2-status-control">
      <span class="sr-only">Task due date</span>
      <input type="date" data-action="update-task-due-date" data-task-id="${escapeHtml(task.id)}" value="${escapeHtml(task.dueDate || '')}">
    </label>
  `;
}
