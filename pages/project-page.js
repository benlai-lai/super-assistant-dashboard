import { taskRow, teamCard } from '../components/cards.js';
import { getBlockedTasks, getDueSoonTasks, getHealth, getOverdueTasks, getProgress, getRisk, getUser } from '../components/metrics.js';
import { badge, emptyState, escapeHtml, layout, progressBar } from '../components/ui.js';

export function renderProjectPage(data, projectId) {
  const project = data.projects.find((item) => item.id === projectId) || data.projects[0];
  const workspace = data.workspaces.find((item) => item.id === project.workspaceId);
  const teams = data.teams.filter((team) => team.projectId === project.id);
  const tasks = data.tasks.filter((task) => task.projectId === project.id);
  const progress = getProgress(tasks);
  const health = getHealth(project, tasks);
  const risk = getRisk(project, tasks);
  const owner = getUser(data, project.ownerId);
  const milestones = data.milestones.filter((milestone) => milestone.projectId === project.id);
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
        <div class="v2-card-grid">${teams.map((team) => teamCard(data, team)).join('')}</div>
      </section>

      <section class="v2-two-column">
        <div class="v2-card">
          <h2>Milestones</h2>
          ${milestones.map((milestone) => `
            <div class="v2-list-item">
              <div><strong>${escapeHtml(milestone.name)}</strong><span>${escapeHtml(milestone.date)} · ${escapeHtml(getUser(data, milestone.ownerId).name)}</span></div>
              ${badge(milestone.critical ? 'Critical' : milestone.status, milestone.critical ? 'danger' : 'neutral')}
            </div>
          `).join('') || emptyState('No milestones', 'Add milestones when the project needs date-based checkpoints.')}
        </div>
        <div class="v2-card">
          <h2>Blocked Tasks</h2>
          ${blockedTasks.map((task) => taskRow(data, task)).join('') || emptyState('No blocked tasks', 'No current blockers in this project.')}
        </div>
      </section>
    `
  });
}