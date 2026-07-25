import { taskRow } from '../components/cards.js';
import { getBlockedTasks, getDueSoonTasks, getOverdueTasks, getProgress, getTeamTasks, getUser, getWorkload } from '../components/metrics.js';
import { badge, emptyState, escapeHtml, layout, progressBar } from '../components/ui.js';

export function renderTeamPage(data, teamId) {
  const team = data.teams.find((item) => item.id === teamId) || data.teams[0];
  const project = data.projects.find((item) => item.id === team.projectId);
  const workspace = data.workspaces.find((item) => item.id === project.workspaceId);
  const tasks = getTeamTasks(data, team.id);
  const progress = getProgress(tasks);
  const workload = getWorkload(tasks);
  const lead = getUser(data, team.leadId);
  const blocked = getBlockedTasks(tasks);
  const dueSoon = getDueSoonTasks(tasks);
  const overdue = getOverdueTasks(tasks);

  return layout({
    title: team.name,
    subtitle: 'A focused team dashboard with lightweight task management actions for the prototype.',
    breadcrumbs: [
      { label: 'Workspace', href: `#/workspace/${workspace.id}` },
      { label: 'Project', href: `#/project/${project.id}` },
      { label: 'Team', href: `#/team/${team.id}` }
    ],
    actions: '<button class="v2-btn primary" type="button" data-action="open-create-task">Create Task</button>',
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
      <section class="v2-section">
        <div class="v2-section-head">
          <h2>Team Tasks</h2>
          <p>Prototype actions: view, create, assign, update status, and adjust due date. Comments and mentions are intentionally excluded.</p>
        </div>
        <div class="v2-table-toolbar">
          ${badge(`${workload.points} points`, workload.status === 'Overloaded' ? 'danger' : 'neutral')}
          ${badge(`${workload.openTasks} open tasks`, 'neutral')}
        </div>
        <div class="v2-task-list">${tasks.map((task) => taskRow(data, task)).join('') || emptyState('No tasks', 'Create the first task for this team.')}</div>
      </section>
    `
  });
}