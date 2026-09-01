import { taskRow } from '../components/cards.js';
import { emptyState, escapeHtml, layout, roleLabel, workloadLabel } from '../components/ui.js';
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
    title: '我的任務',
    subtitle: `${user.name} 的任務清單。此頁只依照模擬使用者情境顯示。`,
    breadcrumbs: [{ label: '我的任務', href: '#/my-tasks' }],
    actions: '<a class="v2-btn" href="#/workspace/workspace-camp">工作區</a>',
    content: `
      <section class="v2-hero-card">
        <div>
          <span class="v2-eyebrow">目前模擬使用者</span>
          <h2>${escapeHtml(user.name)}</h2>
          <p>${escapeHtml(roleLabel(user.role))} - 工作量 ${escapeHtml(workloadLabel(workload.status))}</p>
        </div>
      </section>
      <section class="v2-kpis">
        <div><span>指派任務</span><strong>${tasks.length}</strong></div>
        <div><span>即將到期</span><strong>${dueSoon.length}</strong></div>
        <div><span>已逾期</span><strong>${overdue.length}</strong></div>
        <div><span>受阻</span><strong>${blocked.length}</strong></div>
        <div><span>點數</span><strong>${workload.points}</strong></div>
      </section>
      <section class="v2-two-column">
        <div class="v2-card">
          <h2>今天</h2>
          <div class="v2-task-list">${today.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('今天沒有到期任務', '目前沒有今天到期的已指派任務。')}</div>
        </div>
        <div class="v2-card">
          <h2>已逾期</h2>
          <div class="v2-task-list">${overdue.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('沒有逾期任務', '目前沒有已逾期的已指派任務。')}</div>
        </div>
      </section>
      <section class="v2-section">
        <div class="v2-section-head"><h2>即將到期</h2><p>未來七天內到期的已指派任務。</p></div>
        <div class="v2-task-list">${dueSoon.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('沒有即將到期任務', '目前沒有近期到期的已指派任務。')}</div>
      </section>
      <section class="v2-section">
        <div class="v2-section-head"><h2>所有已指派任務</h2><p>此檢視只顯示目前模擬使用者負責的任務。</p></div>
        <div class="v2-task-list">${tasks.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('沒有已指派任務', '此模擬使用者目前沒有被指派的工作。')}</div>
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
