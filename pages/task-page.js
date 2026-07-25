import { getUser } from '../components/metrics.js';
import { badge, emptyState, escapeHtml, layout, statusLabel, weightLabel } from '../components/ui.js';

export function renderTaskPage(data, taskId) {
  const task = data.tasks.find((item) => item.id === taskId) || data.tasks[0];
  const team = data.teams.find((item) => item.id === task.teamId);
  const project = data.projects.find((item) => item.id === task.projectId);
  const workspace = data.workspaces.find((item) => item.id === project.workspaceId);
  const owner = getUser(data, task.ownerId);
  const dependencies = task.dependsOnTaskIds.map((id) => data.tasks.find((item) => item.id === id)).filter(Boolean);
  const blocking = data.tasks.filter((item) => item.dependsOnTaskIds.includes(task.id));
  const links = data.externalLinks.filter((link) => link.taskId === task.id || link.projectId === task.projectId);

  return layout({
    title: task.title,
    subtitle: 'Task detail page for reviewing ownership, dates, dependencies, blockers, and external links.',
    breadcrumbs: [
      { label: 'Workspace', href: `#/workspace/${workspace.id}` },
      { label: 'Project', href: `#/project/${project.id}` },
      { label: 'Team', href: `#/team/${team.id}` },
      { label: 'Task', href: `#/task/${task.id}` }
    ],
    actions: `<a class="v2-btn" href="#/team/${team.id}">Back to Team</a>`,
    content: `
      <section class="v2-two-column wide-left">
        <article class="v2-card">
          <div class="v2-card-head">
            <div><span class="v2-eyebrow">Task</span><h2>${escapeHtml(task.title)}</h2></div>
            ${badge(statusLabel(task.status), task.status === 'blocked' || task.blocked ? 'danger' : task.status === 'done' ? 'good' : 'neutral')}
          </div>
          <dl class="v2-detail-list">
            <div><dt>Owner</dt><dd>${escapeHtml(owner.name)}</dd></div>
            <div><dt>Team</dt><dd>${escapeHtml(team.name)}</dd></div>
            <div><dt>Due Date</dt><dd>${escapeHtml(task.dueDate)}</dd></div>
            <div><dt>Size</dt><dd>${escapeHtml(weightLabel(task.weight))} (${task.weight} points)</dd></div>
            <div><dt>Next Action</dt><dd>${escapeHtml(task.nextAction)}</dd></div>
            ${task.blocked ? `<div><dt>Blocked Reason</dt><dd>${escapeHtml(task.blockedReason)}</dd></div>` : ''}
          </dl>
        </article>
        <aside class="v2-card">
          <h2>Dependencies</h2>
          <h3>Depends on</h3>
          ${dependencies.map((item) => `<a class="v2-list-link" href="#/task/${item.id}">${escapeHtml(item.title)}</a>`).join('') || emptyState('No dependencies', 'This task can proceed independently.')}
          <h3>Blocking</h3>
          ${blocking.map((item) => `<a class="v2-list-link" href="#/task/${item.id}">${escapeHtml(item.title)}</a>`).join('') || emptyState('Blocking none', 'No downstream tasks wait on this task.')}
        </aside>
      </section>
      <section class="v2-card">
        <h2>External Links</h2>
        ${links.map((link) => `
          <a class="v2-list-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
            <strong>${escapeHtml(link.title)}</strong>
            <span>${escapeHtml(link.type)} · ${escapeHtml(link.note)}</span>
          </a>
        `).join('') || emptyState('No external links', 'Phase 1 stores links only. Files remain in the original cloud service.')}
      </section>
    `
  });
}