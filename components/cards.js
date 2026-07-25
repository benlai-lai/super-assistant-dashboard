import { badge, escapeHtml, progressBar, statusLabel, weightLabel } from './ui.js';

export function projectCard(project) {
  return `
    <article class="v2-card v2-clickable" data-link="#/project/${project.id}">
      <div class="v2-card-head">
        <div>
          <span class="v2-eyebrow">Project</span>
          <h2>${escapeHtml(project.name)}</h2>
        </div>
        ${badge(project.health.level, project.health.level === 'Healthy' ? 'good' : project.health.level === 'Attention' ? 'warn' : 'danger')}
      </div>
      ${progressBar(project.progress.percent)}
      <dl class="v2-metrics">
        <div><dt>Progress</dt><dd>${project.progress.percent}%</dd></div>
        <div><dt>Tasks</dt><dd>${project.progress.completed}/${project.progress.total}</dd></div>
        <div><dt>Health</dt><dd>${escapeHtml(project.health.level)}</dd></div>
        <div><dt>Risk</dt><dd>${escapeHtml(project.risk.display)}</dd></div>
        <div><dt>Blocked</dt><dd>${project.blockedCount}</dd></div>
      </dl>
      <p class="v2-next"><strong>Next action</strong>${escapeHtml(project.nextAction)}</p>
      <footer>Owner: ${escapeHtml(project.ownerName)} - Due ${escapeHtml(project.dueDate)}</footer>
    </article>
  `;
}

export function teamCard(team) {
  return `
    <article class="v2-card v2-clickable" data-link="#/team/${team.id}">
      <div class="v2-card-head">
        <div>
          <span class="v2-eyebrow">Team</span>
          <h2>${escapeHtml(team.name)}</h2>
        </div>
        ${badge(team.workload.status, team.workload.status === 'Overloaded' ? 'danger' : team.workload.status === 'Normal' ? 'warn' : 'good')}
      </div>
      ${progressBar(team.progress.percent)}
      <dl class="v2-metrics">
        <div><dt>Progress</dt><dd>${team.progress.percent}%</dd></div>
        <div><dt>Tasks</dt><dd>${team.progress.completed}/${team.progress.total}</dd></div>
        <div><dt>Points</dt><dd>${team.workload.points}</dd></div>
        <div><dt>Blocked</dt><dd>${team.blockedCount}</dd></div>
      </dl>
      <p class="v2-next"><strong>Next action</strong>${escapeHtml(team.nextAction)}</p>
      <footer>Lead: ${escapeHtml(team.leadName)}</footer>
    </article>
  `;
}

export function taskRow(task) {
  const tone = task.status === 'done' ? 'good' : task.status === 'blocked' || task.blocked ? 'danger' : 'neutral';
  return `
    <article class="v2-task-row v2-clickable" data-link="#/task/${task.id}">
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <span>${escapeHtml(task.assigneeName)} - ${escapeHtml(weightLabel(task.weight))} - Due ${escapeHtml(task.dueDate)}</span>
      </div>
      <div class="v2-task-meta">
        ${badge(statusLabel(task.status), tone)}
        ${task.blocked ? badge('Blocked', 'danger') : ''}
      </div>
    </article>
  `;
}
