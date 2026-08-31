import { taskRow, teamCard } from '../components/cards.js';
import { badge, emptyState, escapeHtml, layout, progressBar } from '../components/ui.js';
import {
  canReadProject,
  getBlockedTasks,
  getDueSoonTasks,
  getHealth,
  getMemberById,
  getMilestonesByProjectId,
  getOverdueTasks,
  getProgress,
  getProjectById,
  getRisk,
  getTeamsByProjectId,
  getVisibleProjectTasks,
  getVisibleTeamTasks,
  getVisibleTeamsByProjectId,
  getWorkspaceById,
  getWorkload
} from '../store/selectors.js';

export function renderProjectPage(state, projectId) {
  if (!canReadProject(state, projectId)) return renderDeniedPage(state);

  const project = getProjectById(state, projectId);
  const workspace = getWorkspaceById(state, project.workspaceId) || state.workspaces[0];
  const teams = getVisibleTeamsByProjectId(state, project.id);
  const tasks = getVisibleProjectTasks(state, project.id);
  const progress = getProgress(tasks);
  const health = getHealth(project, tasks);
  const risk = getRisk(project, tasks);
  const owner = getMemberById(state, project.ownerId);
  const milestones = getMilestonesByProjectId(state, project.id);
  const blockedTasks = getBlockedTasks(tasks);
  const dueSoonTasks = getDueSoonTasks(tasks);
  const overdueTasks = getOverdueTasks(tasks);

  return layout({
    state,
    title: project.name,
    subtitle: project.description,
    breadcrumbs: [
      { label: 'Workspace', href: `#/workspace/${workspace.id}` },
      { label: 'Project', href: `#/project/${project.id}` }
    ],
    actions: '<a class="v2-btn" href="#/my-tasks">My Tasks</a>',
    content: `
      <section class="v2-hero-card">
        <div>
          <span class="v2-eyebrow">Project Health</span>
          <h2>${escapeHtml(health.level)}</h2>
          <p>${escapeHtml(health.reason)}</p>
        </div>
        <div class="v2-hero-metrics">
          <div><span>Progress</span><strong>${progress.percent}%</strong></div>
          <div><span>Tasks</span><strong>${progress.completed}/${progress.total}</strong></div>
          <div><span>Risk</span><strong>${escapeHtml(risk.display)}</strong></div>
          <div><span>Owner</span><strong>${escapeHtml(owner.name)}</strong></div>
        </div>
        ${progressBar(progress.percent)}
        <p class="v2-next"><strong>Next action</strong>${escapeHtml(project.nextAction)}</p>
      </section>

      <section class="v2-kpis">
        <div><span>Teams</span><strong>${teams.length}</strong></div>
        <div><span>Due Soon</span><strong>${dueSoonTasks.length}</strong></div>
        <div><span>Overdue</span><strong>${overdueTasks.length}</strong></div>
        <div><span>Blocked</span><strong>${blockedTasks.length}</strong></div>
      </section>

      <section class="v2-section">
        <div class="v2-section-head"><h2>Teams</h2><p>Each working group stays inside this camp project.</p></div>
        <div class="v2-card-grid">${teams.map((team) => teamCard(toTeamCard(state, team))).join('')}</div>
      </section>

      <section class="v2-two-column">
        <div class="v2-card">
          <h2>Milestones</h2>
          ${milestones.map((milestone) => `
            <div class="v2-list-item">
              <div><strong>${escapeHtml(milestone.name)}</strong><span>${escapeHtml(milestone.date)} - ${escapeHtml(getMemberById(state, milestone.ownerId).name)}</span></div>
              ${badge(milestone.critical ? 'Critical' : milestone.status, milestone.critical ? 'danger' : 'neutral')}
            </div>
          `).join('') || emptyState('No milestones', 'Add milestones when the project needs date-based checkpoints.')}
        </div>
        <div class="v2-card">
          <h2>Blocked Tasks</h2>
          ${blockedTasks.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('No blocked tasks', 'No current blockers in this project.')}
        </div>
      </section>
    `
  });
}

function toTeamCard(state, team) {
  const project = getProjectById(state, team.projectId);
  const tasks = getVisibleTeamTasks(state, team.id);
  const risk = getRisk(project, tasks);
  return {
    ...team,
    projectName: project?.name || 'Unknown project',
    teamName: team.name || '未分組',
    ownerName: getMemberById(state, team.leadId).name,
    dueDate: project?.dueDate || null,
    leadName: getMemberById(state, team.leadId).name,
    progress: getProgress(tasks),
    workload: getWorkload(tasks),
    riskStatus: risk.display,
    blockedCount: getBlockedTasks(tasks).length
  };
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

function toTaskRow(state, task) {
  return {
    ...task,
    assigneeName: getMemberById(state, task.assigneeId || task.ownerId).name
  };
}
