import { taskRow, teamCard } from '../components/cards.js';
import { badge, emptyState, escapeHtml, layout, progressBar } from '../components/ui.js';
import {
  getBlockedTasks,
  getDueSoonTasks,
  getHealth,
  getMemberById,
  getMilestonesByProjectId,
  getOverdueTasks,
  getProgress,
  getProjectById,
  getProjectTasks,
  getRisk,
  getTeamsByProjectId,
  getWorkspaceById,
  getWorkload
} from '../store/selectors.js';

export function renderProjectPage(state, projectId) {
  const project = getProjectById(state, projectId) || state.projects[0];
  const workspace = getWorkspaceById(state, project.workspaceId) || state.workspaces[0];
  const teams = getTeamsByProjectId(state, project.id);
  const tasks = getProjectTasks(state, project.id);
  const progress = getProgress(tasks);
  const health = getHealth(project, tasks);
  const risk = getRisk(project, tasks);
  const owner = getMemberById(state, project.ownerId);
  const milestones = getMilestonesByProjectId(state, project.id);
  const blockedTasks = getBlockedTasks(tasks);
  const dueSoonTasks = getDueSoonTasks(tasks);
  const overdueTasks = getOverdueTasks(tasks);

  return layout({
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
  const tasks = state.tasks.filter((task) => task.teamId === team.id);
  return {
    ...team,
    leadName: getMemberById(state, team.leadId).name,
    progress: getProgress(tasks),
    workload: getWorkload(tasks),
    blockedCount: getBlockedTasks(tasks).length
  };
}

function toTaskRow(state, task) {
  return {
    ...task,
    assigneeName: getMemberById(state, task.assigneeId || task.ownerId).name
  };
}
