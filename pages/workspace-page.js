import { projectCard } from '../components/cards.js';
import { emptyState, escapeHtml, layout } from '../components/ui.js';
import {
  canCreateProject,
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
    actions: canCreateProject(state, workspace.id)
      ? '<button class="v2-btn primary" type="button" data-action="toggle-create-project">Create Project</button><a class="v2-btn" href="#/my-tasks">My Tasks</a>'
      : '<a class="v2-btn" href="#/my-tasks">My Tasks</a>',
    content: `
      <section class="v2-kpis">
        <div><span>Workspace Progress</span><strong>${progress.percent}%</strong></div>
        <div><span>Projects</span><strong>${projects.length}</strong></div>
        <div><span>Due Soon</span><strong>${dueSoon}</strong></div>
        <div><span>Overdue</span><strong>${overdue}</strong></div>
        <div><span>Blocked</span><strong>${blocked}</strong></div>
      </section>

      <section class="v2-section">
        ${renderCreateProjectPanel(state, workspace)}
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

function renderCreateProjectPanel(state, workspace) {
  if (!canCreateProject(state, workspace.id)) return '';
  return `
    <section class="v2-card v2-collapsible-panel" id="create-project-panel" hidden>
      <h2>New Project</h2>
      <form data-action="create-project" class="v2-form">
        <label><span>Project name</span><input type="text" name="name" required></label>
        <label><span>Description</span><textarea name="description" rows="3"></textarea></label>
        <label><span>Owner</span><select name="ownerId" required>${state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)} — ${escapeHtml(member.role)}</option>`).join('')}</select></label>
        <label><span>Start date</span><input type="date" name="startDate"></label>
        <label><span>Due date</span><input type="date" name="dueDate"></label>
        <label><span>Next action</span><input type="text" name="nextAction"></label>
        <label><span>Risk</span><select name="riskLevelManual"><option value="">Auto</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option></select></label>
        <label><span>Visibility</span><select name="visibility"><option value="workspace">workspace</option><option value="project">project</option><option value="team">team</option><option value="assigned">assigned</option><option value="private">private</option></select></label>
        <input type="hidden" name="workspaceId" value="${escapeHtml(workspace.id)}">
        <button type="submit" class="v2-btn primary">Create Project</button>
      </form>
    </section>
  `;
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
