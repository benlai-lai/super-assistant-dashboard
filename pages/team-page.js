import { taskRow } from '../components/cards.js';
import { badge, emptyState, escapeHtml, layout, progressBar } from '../components/ui.js';
import {
  canReadTeam,
  canManageProject,
  canManageTeam,
  getBlockedTasks,
  getDueSoonTasks,
  getMemberById,
  getOverdueTasks,
  getProgress,
  getProjectById,
  getTeamById,
  getVisibleTeamTasks,
  canCreateTask,
  getWorkload,
  getWorkspaceById
} from '../store/selectors.js';

export function renderTeamPage(state, teamId) {
  if (!canReadTeam(state, teamId)) return renderDeniedPage(state);

  const team = getTeamById(state, teamId);
  const project = getProjectById(state, team.projectId) || state.projects[0];
  const workspace = getWorkspaceById(state, project.workspaceId) || state.workspaces[0];
  const tasks = getVisibleTeamTasks(state, team.id);
  const progress = getProgress(tasks);
  const workload = getWorkload(tasks);
  const lead = getMemberById(state, team.leadId);
  const blocked = getBlockedTasks(tasks);
  const dueSoon = getDueSoonTasks(tasks);
  const overdue = getOverdueTasks(tasks);

  return layout({
    state,
    title: team.name,
    subtitle: 'A focused team dashboard with lightweight task management actions for the prototype.',
    breadcrumbs: [
      { label: 'Workspace', href: `#/workspace/${workspace.id}` },
      { label: 'Project', href: `#/project/${project.id}` },
      { label: 'Team', href: `#/team/${team.id}` }
    ],
    actions: `${canManageTeam(state, team) ? '<button class="v2-btn" type="button" data-action="toggle-edit-team">Edit Team</button>' : ''}${
      canCreateTask(state, { teamId: team.id, projectId: project.id, assigneeId: state.currentUserId })
        ? '<button class="v2-btn primary" type="button" data-action="toggle-create-task">Create Task</button>'
        : '<span class="v2-readonly-note">Read-only for this mock user</span>'
    }`,
    content: `
      <section class="v2-hero-card">
        <div>
          <span class="v2-eyebrow">Team Dashboard</span>
          <h2>${progress.percent}% complete</h2>
          <p>Lead: ${escapeHtml(lead.name)}. Next action: ${escapeHtml(team.nextAction)}</p>
        </div>
        ${progressBar(progress.percent)}
      </section>
      <section class="v2-kpis">
        <div><span>Tasks</span><strong>${progress.completed}/${progress.total}</strong></div>
        <div><span>Due Soon</span><strong>${dueSoon.length}</strong></div>
        <div><span>Overdue</span><strong>${overdue.length}</strong></div>
        <div><span>Blocked</span><strong>${blocked.length}</strong></div>
        <div><span>Workload</span><strong>${workload.status}</strong></div>
      </section>
      ${renderEditTeamPanel(state, team)}
      <section class="v2-card v2-create-task-panel" id="create-task-panel" hidden>
        <h2>New Task</h2>
        <form data-action="create-task" class="v2-form">
          <label>
            <span>Task title</span>
            <input type="text" name="title" placeholder="Task title" required>
          </label>
          <label>
            <span>Assignee</span>
            <select name="assigneeId" required>
              ${state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Visibility</span>
            <select name="visibility">
              <option value="team">team</option>
              <option value="project">project</option>
              <option value="workspace">workspace</option>
              <option value="assigned">assigned</option>
              <option value="private">private</option>
            </select>
          </label>
          <label>
            <span>Due date</span>
            <input type="date" name="dueDate">
          </label>
          <input type="hidden" name="teamId" value="${escapeHtml(team.id)}">
          <input type="hidden" name="projectId" value="${escapeHtml(project.id)}">
          <button type="submit" class="v2-btn primary">Create</button>
        </form>
      </section>
      <section class="v2-section">
        <div class="v2-section-head">
          <h2>Team Tasks</h2>
          <p>Prototype actions: view, create, assign, update status, and adjust due date. Comments and mentions are intentionally excluded.</p>
        </div>
        <div class="v2-table-toolbar">
          ${badge(`${workload.points} points`, workload.status === 'Overloaded' ? 'danger' : 'neutral')}
          ${badge(`${workload.openTasks} open tasks`, 'neutral')}
        </div>
        <div class="v2-task-list">${tasks.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('No tasks', 'Create the first task for this team.')}</div>
      </section>
    `
  });
}

function renderEditTeamPanel(state, team) {
  if (!canManageTeam(state, team)) return '';
  const manageableProjects = state.projects.filter((project) => canManageProject(state, project));
  const teamMembers = new Set(state.members.filter((member) => member.teamId === team.id).map((member) => member.id));
  return `
    <section class="v2-card v2-collapsible-panel" id="edit-team-panel" hidden>
      <h2>Edit Team</h2>
      <form data-action="edit-team" class="v2-form">
        <label><span>Team name</span><input type="text" name="name" value="${escapeHtml(team.name)}" required></label>
        <label><span>Project</span><select name="projectId" required>${manageableProjects.map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === team.projectId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}</select></label>
        <label><span>Lead</span><select name="leadId" required>${state.members.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === team.leadId ? 'selected' : ''}>${escapeHtml(member.name)} — ${escapeHtml(member.role)}</option>`).join('')}</select></label>
        <label><span>Members</span><select name="memberIds" multiple size="5">${state.members.map((member) => `<option value="${escapeHtml(member.id)}" ${teamMembers.has(member.id) ? 'selected' : ''}>${escapeHtml(member.name)} — ${escapeHtml(member.role)}</option>`).join('')}</select></label>
        <label><span>Next action</span><input type="text" name="nextAction" value="${escapeHtml(team.nextAction || '')}"></label>
        <label><span>Visibility</span><select name="visibility">${visibilityOptions(team.visibility || 'project')}</select></label>
        <input type="hidden" name="teamId" value="${escapeHtml(team.id)}">
        <button type="submit" class="v2-btn primary">Save Team</button>
      </form>
    </section>
  `;
}

function visibilityOptions(selected) {
  return ['private', 'assigned', 'team', 'project', 'workspace']
    .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`)
    .join('');
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
