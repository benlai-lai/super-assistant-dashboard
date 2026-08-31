import { badge, displayDate, escapeHtml, progressBar, riskLabel, statusLabel, visibilityLabel, weightLabel } from './ui.js';

export function projectCard(project) {
  return `
    <article class="v2-card v2-clickable" data-link="#/project/${project.id}">
      <div class="v2-card-head">
        <div>
          <span class="v2-eyebrow">專案</span>
          <h2>${escapeHtml(project.projectName)}</h2>
        </div>
        ${badge(riskLabel(project.riskStatus), riskTone(project.riskStatus))}
      </div>
      ${progressBar(project.progress.percent)}
      <dl class="v2-metrics v2-card-fields" data-card-fields="project-name,team-name,progress-percentage,task-count,next-action,risk-status,owner,due-date">
        <div><dt>專案名稱</dt><dd>${escapeHtml(project.projectName)}</dd></div>
        <div><dt>團隊名稱</dt><dd>${escapeHtml(project.teamName || '未分組')}</dd></div>
        <div><dt>進度百分比</dt><dd>${project.progress.percent}%</dd></div>
        <div><dt>已完成／總任務數</dt><dd>${project.progress.completed}/${project.progress.total}</dd></div>
        <div><dt>風險狀態</dt><dd>${escapeHtml(riskLabel(project.riskStatus))}</dd></div>
        <div><dt>負責人</dt><dd>${escapeHtml(project.ownerName)}</dd></div>
        <div><dt>截止日期</dt><dd>${escapeHtml(displayDate(project.dueDate))}</dd></div>
      </dl>
      <p class="v2-next"><strong>下一步</strong>${escapeHtml(project.nextAction || '—')}</p>
    </article>
  `;
}

export function teamCard(team) {
  return `
    <article class="v2-card v2-clickable" data-link="#/team/${team.id}">
      <div class="v2-card-head">
        <div>
          <span class="v2-eyebrow">團隊</span>
          <h2>${escapeHtml(team.teamName)}</h2>
        </div>
        ${badge(riskLabel(team.riskStatus), riskTone(team.riskStatus))}
      </div>
      ${progressBar(team.progress.percent)}
      <dl class="v2-metrics v2-card-fields" data-card-fields="project-name,team-name,progress-percentage,task-count,next-action,risk-status,owner,due-date">
        <div><dt>專案名稱</dt><dd>${escapeHtml(team.projectName)}</dd></div>
        <div><dt>團隊名稱</dt><dd>${escapeHtml(team.teamName || '未分組')}</dd></div>
        <div><dt>進度百分比</dt><dd>${team.progress.percent}%</dd></div>
        <div><dt>已完成／總任務數</dt><dd>${team.progress.completed}/${team.progress.total}</dd></div>
        <div><dt>風險狀態</dt><dd>${escapeHtml(riskLabel(team.riskStatus))}</dd></div>
        <div><dt>負責人</dt><dd>${escapeHtml(team.ownerName)}</dd></div>
        <div><dt>截止日期</dt><dd>${escapeHtml(displayDate(team.dueDate))}</dd></div>
      </dl>
      <p class="v2-next"><strong>下一步</strong>${escapeHtml(team.nextAction || '—')}</p>
    </article>
  `;
}

export function taskRow(task) {
  const tone = task.status === 'done' ? 'good' : task.status === 'blocked' || task.blocked ? 'danger' : 'neutral';
  return `
    <article class="v2-task-row v2-clickable" data-link="#/task/${task.id}">
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <span>${escapeHtml(task.assigneeName)} - ${escapeHtml(weightLabel(task.weight))} - 截止 ${escapeHtml(displayDate(task.dueDate))}</span>
      </div>
      <div class="v2-task-meta">
        ${badge(statusLabel(task.status), tone)}
        ${badge(visibilityLabel(task.visibility || 'private'), 'neutral')}
        ${task.blocked ? badge('受阻', 'danger') : ''}
      </div>
    </article>
  `;
}

function riskTone(value) {
  if (value === 'High' || value === 'Delayed' || value === 'Overloaded') return 'danger';
  if (value === 'Medium' || value === 'Attention' || value === 'Normal') return 'warn';
  return 'good';
}
