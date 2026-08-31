import { taskRow } from '../components/cards.js';
import { emptyState, escapeHtml, layout } from '../components/ui.js';
import {
  getBlockedTasks,
  getCurrentUser,
  getDueSoonTasks,
  getMemberById,
  getMyTasks,
  getOverdueTasks,
  getTodayTasks,
  getUpcomingTasks,
  getWorkload
} from '../store/selectors.js';

export function renderMyTasksPage(state) {
  const user = getCurrentUser(state);
  const tasks = getMyTasks(state, user.id);
  const today = getTodayTasks(state, user.id);
  const dueSoon = getUpcomingTasks(state, user.id);
  const overdue = getOverdueTasks(state, user.id);
  const blocked = getBlockedTasks(tasks);
  const workload = getWorkload(tasks);

  return layout({
    state,
    title: 'My Tasks',
    subtitle: `Focused list for ${user.name}. This is powered by mock user context only.`,
    breadcrumbs: [{ label: 'My Tasks', href: '#/my-tasks' }],
    actions: '<a class="v2-btn" href="#/workspace/workspace-camp">Workspace</a>',
    content: `
      <section class="v2-hero-card">
        <div>
          <span class="v2-eyebrow">Current mock user</span>
          <h2>${escapeHtml(user.name)}</h2>
          <p>${escapeHtml(user.role)} - Workload ${escapeHtml(workload.status)}</p>
        </div>
      </section>
      <section class="v2-kpis">
        <div><span>Assigned</span><strong>${tasks.length}</strong></div>
        <div><span>Due Soon</span><strong>${dueSoon.length}</strong></div>
        <div><span>Overdue</span><strong>${overdue.length}</strong></div>
        <div><span>Blocked</span><strong>${blocked.length}</strong></div>
        <div><span>Points</span><strong>${workload.points}</strong></div>
      </section>
      <section class="v2-two-column">
        <div class="v2-card">
          <h2>Today</h2>
          <div class="v2-task-list">${today.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('Nothing due today', 'No assigned tasks are due today.')}</div>
        </div>
        <div class="v2-card">
          <h2>Overdue</h2>
          <div class="v2-task-list">${overdue.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('No overdue tasks', 'No assigned tasks are overdue.')}</div>
        </div>
      </section>
      <section class="v2-section">
        <div class="v2-section-head"><h2>Upcoming</h2><p>Assigned tasks due in the next seven days.</p></div>
        <div class="v2-task-list">${dueSoon.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('No upcoming tasks', 'No assigned tasks are due soon.')}</div>
      </section>
      <section class="v2-section">
        <div class="v2-section-head"><h2>All Assigned</h2><p>Use this view to see only the tasks owned by the selected mock user.</p></div>
        <div class="v2-task-list">${tasks.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('No assigned tasks', 'This mock user has no assigned work.')}</div>
      </section>
    `
  });
}

function toTaskRow(state, task) {
  return {
    ...task,
    assigneeName: getMemberById(state, task.assigneeId || task.ownerId).name
  };
}
