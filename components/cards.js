import { badge, displayDate, escapeHtml, progressBar, statusLabel, weightLabel } from './ui.js';

export function projectCard(project) {
  return `
    <article class="v2-card v2-clickable" data-link="#/project/${project.id}">
      <div class="v2-card-head">
        <div>
          <span class="v2-eyebrow">Project</span>
          <h2>${escapeHtml(project.projectName)}</h2>
        </div>
        ${badge(project.riskStatus, riskTone(project.riskStatus))}
      </div>
      ${progressBar(project.progress.percent)}
      <dl class="v2-metrics v2-card-fields" data-card-fields="project-name,team-name,progress-percentage,task-count,next-action,risk-status,owner,due-date">
        <div><dt>Project name</dt><dd>${escapeHtml(project.projectName)}</dd></div>
        <div><dt>Team name</dt><dd>${escapeHtml(project.teamName || '未分組')}</dd></div>
        <div><dt>Progress percentage</dt><dd>${project.progress.percent}%</dd></div>
        <div><dt>Completed / total tasks</dt><dd>${project.progress.completed}/${project.progress.total}</dd></div>
        <div><dt>Risk status</dt><dd>${escapeHtml(project.riskStatus)}</dd></div>
        <div><dt>Owner</dt><dd>${escapeHtml(project.ownerName)}</dd></div>
        <div><dt>Due date</dt><dd>${escapeHtml(displayDate(project.dueDate))}</dd></div>
      </dl>
      <p class="v2-next"><strong>Next action</strong>${escapeHtml(project.nextAction || '—')}</p>
    </article>
  `;
}

export function teamCard(team) {
  return `
    <article class="v2-card v2-clickable" data-link="#/team/${team.id}">
      <div class="v2-card-head">
        <div>
          <span class="v2-eyebrow">Team</span>
          <h2>${escapeHtml(team.teamName)}</h2>
        </div>
        ${badge(team.riskStatus, riskTone(team.riskStatus))}
      </div>
      ${progressBar(team.progress.percent)}
      <dl class="v2-metrics v2-card-fields" data-card-fields="project-name,team-name,progress-percentage,task-count,next-action,risk-status,owner,due-date">
        <div><dt>Project name</dt><dd>${escapeHtml(team.projectName)}</dd></div>
        <div><dt>Team name</dt><dd>${escapeHtml(team.teamName || '未分組')}</dd></div>
        <div><dt>Progress percentage</dt><dd>${team.progress.percent}%</dd></div>
        <div><dt>Completed / total tasks</dt><dd>${team.progress.completed}/${team.progress.total}</dd></div>
        <div><dt>Risk status</dt><dd>${escapeHtml(team.riskStatus)}</dd></div>
        <div><dt>Owner</dt><dd>${escapeHtml(team.ownerName)}</dd></div>
        <div><dt>Due date</dt><dd>${escapeHtml(displayDate(team.dueDate))}</dd></div>
      </dl>
      <p class="v2-next"><strong>Next action</strong>${escapeHtml(team.nextAction || '—')}</p>
    </article>
  `;
}

export function taskRow(task) {
  const tone = task.status === 'done' ? 'good' : task.status === 'blocked' || task.blocked ? 'danger' : 'neutral';
  return `
    <article class="v2-task-row v2-clickable" data-link="#/task/${task.id}">
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <span>${escapeHtml(task.assigneeName)} - ${escapeHtml(weightLabel(task.weight))} - Due ${escapeHtml(displayDate(task.dueDate))}</span>
      </div>
      <div class="v2-task-meta">
        ${badge(statusLabel(task.status), tone)}
        ${badge(task.visibility || 'private', 'neutral')}
        ${task.blocked ? badge('Blocked', 'danger') : ''}
      </div>
    </article>
  `;
}

function riskTone(value) {
  if (value === 'High' || value === 'Delayed' || value === 'Overloaded') return 'danger';
  if (value === 'Medium' || value === 'Attention' || value === 'Normal') return 'warn';
  return 'good';
}
