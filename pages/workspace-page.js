import { projectCard } from '../components/cards.js';
import { getBlockedTasks, getDueSoonTasks, getOverdueTasks, getProgress } from '../components/metrics.js';
import { emptyState, layout } from '../components/ui.js';

export function renderWorkspacePage(data, workspaceId) {
  const workspace = data.workspaces.find((item) => item.id === workspaceId) || data.workspaces[0];
  const projects = data.projects.filter((project) => project.workspaceId === workspace.id);
  const projectTasks = data.tasks.filter((task) => projects.some((project) => project.id === task.projectId));
  const progress = getProgress(projectTasks);
  const overdue = getOverdueTasks(projectTasks).length;
  const dueSoon = getDueSoonTasks(projectTasks).length;
  const blocked = getBlockedTasks(projectTasks).length;

  return layout({
    title: workspace.name,
    subtitle: workspace.description,
    breadcrumbs: [{ label: 'Workspace', href: `#/workspace/${workspace.id}` }],
    actions: '<a class="v2-btn" href="#/my-tasks">My Tasks</a>',
    content: `
      <section class="v2-kpis">
        <div><span>Workspace Progress</span><strong>${progress.percent}%</strong></div>
        <div><span>Projects</span><strong>${projects.length}</strong></div>
        <div><span>Due Soon</span><strong>${dueSoon}</strong></div>
        <div><span>Overdue</span><strong>${overdue}</strong></div>
        <div><span>Blocked</span><strong>${blocked}</strong></div>
      </section>

      <section class="v2-section">
        <div class="v2-section-head">
          <h2>Projects</h2>
          <p>Open a project to review team progress, milestones, risk, and next actions.</p>
        </div>
        <div class="v2-card-grid">
          ${projects.length ? projects.map((project) => projectCard(data, project)).join('') : emptyState('No projects yet', 'Create a project to start the workspace dashboard.')}
        </div>
      </section>
    `
  });
}