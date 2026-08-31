import { projectCard } from '../components/cards.js';
import { emptyState, layout } from '../components/ui.js';
import {
  getBlockedTasks,
  getDueSoonTasks,
  getHealth,
  getMemberById,
  getOverdueTasks,
  getProgress,
  getVisibleProjectsByWorkspaceId,
  getVisibleWorkspaceTasks,
  getRisk,
  getTeamsByProjectId,
  getVisibleProjectTasks,
  getWorkspaceById
} from '../store/selectors.js';

export function renderWorkspacePage(state, workspaceId) {
  const workspace = getWorkspaceById(state, workspaceId) || state.workspaces[0];
  const projects = getVisibleProjectsByWorkspaceId(state, workspace.id);
  const workspaceTasks = getVisibleWorkspaceTasks(state, workspace.id);
  const progress = getProgress(workspaceTasks);
  const overdue = getOverdueTasks(workspaceTasks).length;
  const dueSoon = getDueSoonTasks(workspaceTasks).length;
  const blocked = getBlockedTasks(workspaceTasks).length;

  return layout({
    state,
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
          ${projects.length ? projects.map((project) => projectCard(toProjectCard(state, project))).join('') : emptyState('No projects yet', 'Create a project to start the workspace dashboard.')}
        </div>
      </section>
    `
  });
}

function toProjectCard(state, project) {
  const tasks = getVisibleProjectTasks(state, project.id);
  const teams = getTeamsByProjectId(state, project.id);
  return {
    ...project,
    projectName: project.name,
    teamName: teams.length ? `${teams.length} teams` : '未分組',
    ownerName: getMemberById(state, project.ownerId).name,
    progress: getProgress(tasks),
    health: getHealth(project, tasks),
    risk: getRisk(project, tasks),
    riskStatus: getRisk(project, tasks).display,
    blockedCount: getBlockedTasks(tasks).length
  };
}
