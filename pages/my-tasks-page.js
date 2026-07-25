import { taskRow } from '../components/cards.js';
import { getBlockedTasks, getDueSoonTasks, getOverdueTasks, getUser, getWorkload } from '../components/metrics.js';
import { emptyState, escapeHtml, layout } from '../components/ui.js';

export function renderMyTasksPage(data) {
  const user = getUser(data, data.currentUserId);
  const tasks = data.tasks.filter((task) => task.ownerId === user.id);
  const dueSoon = getDueSoonTasks(tasks);
  const overdue = getOverdueTasks(tasks);
  const blocked = getBlockedTasks(tasks);
  const workload = getWorkload(tasks);

  return layout({
    title: 'My Tasks',
    subtitle: `Focused list for ${user.name}. This is powered by mock user context only.`,
    breadcrumbs: [{ label: 'My Tasks', href: '#/my-tasks' }],
    actions: '<a class="v2-btn" href="#/workspace/workspace-camp">Workspace</a>',
    content: `
      <section class="v2-hero-card">
        <div>
          <span class="v2-eyebrow">Current mock user</span>
          <h2>${escapeHtml(user.name)}</h2>
          <p>${escapeHtml(user.role)} · Workload ${escapeHtml(workload.status)}</p>
        </div>
      </section>
      <section class="v2-kpis">
        <div><span>Assigned</span><strong>${tasks.length}</strong></div>
        <div><span>Due Soon</span><strong>${dueSoon.length}</strong></div>
        <div><span>Overdue</span><strong>${overdue.length}</strong></div>
        <div><span>Blocked</span><strong>${blocked.length}</strong></div>
        <div><span>Points</span><strong>${workload.points}</strong></div>
      </section>
      <section class="v2-section">
        <div class="v2-section-head"><h2>Assigned to me</h2><p>Use this view to see only the tasks owned by the selected mock user.</p></div>
        <div class="v2-task-list">${tasks.map((task) => taskRow(data, task)).join('') || emptyState('No assigned tasks', 'This mock user has no assigned work.')}</div>
      </section>
    `
  });
}