import { badge, escapeHtml, progressBar, statusLabel, weightLabel } from './ui.js';
import { getBlockedTasks, getHealth, getProgress, getRisk, getTeamTasks, getUser, getWorkload } from './metrics.js';

export function projectCard(data, project) {
  const tasks = data.tasks.filter((task) => task.projectId === project.id);
  const progress = getProgress(tasks);
  const health = getHealth(project, tasks);
  const risk = getRisk(project, tasks);
  const blocked = getBlockedTasks(tasks).length;
  const owner = getUser(data, project.ownerId);

  return `
    <article class="v2-card v2-clickable" data-link="#/project/${project.id}">
      <div class="v2-card-head">
        <div>
          <span class="v2-eyebrow">Project</span>
          <h2>${escapeHtml(project.name)}</h2>
        </div>
        ${badge(health.level, health.level === 'Healthy' ? 'good' : health.level === 'Attention' ? 'warn' : 'danger')}
      </div>
      ${progressBar(progress.percent)}
      <dl class="v2-metrics">
        <div><dt>Progress</dt><dd>${progress.percent}%</dd></div>
        <div><dt>Tasks</dt><dd>${progress.completed}/${progress.total}</dd></div>
        <div><dt>Health</dt><dd>${health.level}</dd></div>
        <div><dt>Risk</dt><dd>${risk.display}</dd></div>
        <div><dt>Blocked</dt><dd>${blocked}</dd></div>
      </dl>
      <p class="v2-next"><strong>Next action</strong>${escapeHtml(project.nextAction)}</p>
      <footer>Owner: ${escapeHtml(owner.name)} · Due ${escapeHtml(project.dueDate)}</footer>
    </article>
  `;
}

export function teamCard(data, team) {
  const tasks = getTeamTasks(data, team.id);
  const progress = getProgress(tasks);
  const workload = getWorkload(tasks);
  const lead = getUser(data, team.leadId);
  const blocked = getBlockedTasks(tasks).length;

  return `
    <article class="v2-card v2-clickable" data-link="#/team/${team.id}">
      <div class="v2-card-head">
        <div>
          <span class="v2-eyebrow">Team</span>
          <h2>${escapeHtml(team.name)}</h2>
        </div>
        ${badge(workload.status, workload.status === 'Overloaded' ? 'danger' : workload.status === 'Normal' ? 'warn' : 'good')}
      </div>
      ${progressBar(progress.percent)}
      <dl class="v2-metrics">
        <div><dt>Progress</dt><dd>${progress.percent}%</dd></div>
        <div><dt>Tasks</dt><dd>${progress.completed}/${progress.total}</dd></div>
        <div><dt>Points</dt><dd>${workload.points}</dd></div>
        <div><dt>Blocked</dt><dd>${blocked}</dd></div>
      </dl>
      <p class="v2-next"><strong>Next action</strong>${escapeHtml(team.nextAction)}</p>
      <footer>Lead: ${escapeHtml(lead.name)}</footer>
    </article>
  `;
}

export function taskRow(data, task) {
  const owner = getUser(data, task.ownerId);
  const tone = task.status === 'done' ? 'good' : task.status === 'blocked' || task.blocked ? 'danger' : 'neutral';
  return `
    <article class="v2-task-row v2-clickable" data-link="#/task/${task.id}">
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <span>${escapeHtml(owner.name)} · ${escapeHtml(weightLabel(task.weight))} · Due ${escapeHtml(task.dueDate)}</span>
      </div>
      <div class="v2-task-meta">
        ${badge(statusLabel(task.status), tone)}
        ${task.blocked ? badge('Blocked', 'danger') : ''}
      </div>
    </article>
  `;
}