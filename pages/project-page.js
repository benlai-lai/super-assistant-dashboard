import { taskRow, teamCard } from '../components/cards.js';
import { badge, emptyState, escapeHtml, layout, progressBar, riskLabel, roleLabel } from '../components/ui.js';
import {
  canReadProject,
  canManageProject,
  canCreateTeam,
  getBlockedTasks,
  getDueSoonTasks,
  getHealth,
  getMemberById,
  getMilestonesByProjectId,
  getOverdueTasks,
  getProgress,
  getProjectById,
  getRisk,
  getTeamsByProjectId,
  getVisibleProjectTasks,
  getVisibleTeamTasks,
  getVisibleTeamsByProjectId,
  getWorkspaceById,
  getWorkload
} from '../store/selectors.js';

export function renderProjectPage(state, projectId) {
  if (!canReadProject(state, projectId)) return renderDeniedPage(state);

  const project = getProjectById(state, projectId);
  const workspace = getWorkspaceById(state, project.workspaceId) || state.workspaces[0];
  const teams = getVisibleTeamsByProjectId(state, project.id);
  const tasks = getVisibleProjectTasks(state, project.id);
  const progress = getProgress(tasks);
  const health = getHealth(project, tasks);
  const risk = getRisk(project, tasks);
  const owner = getMemberById(state, project.ownerId);
  const milestones = getMilestonesByProjectId(state, project.id);
  const blockedTasks = getBlockedTasks(tasks);
  const dueSoonTasks = getDueSoonTasks(tasks);
  const overdueTasks = getOverdueTasks(tasks);

  return layout({
    state,
    title: project.name,
    subtitle: project.description,
    breadcrumbs: [
      { label: '工作區', href: `#/workspace/${workspace.id}` },
      { label: '專案', href: `#/project/${project.id}` }
    ],
    actions: canManageProject(state, project)
      ? '<button class="v2-btn primary" type="button" data-action="toggle-edit-project">編輯專案</button><button class="v2-btn" type="button" data-action="toggle-create-team">建立團隊</button><a class="v2-btn" href="#/my-tasks">我的任務</a>'
      : '<a class="v2-btn" href="#/my-tasks">我的任務</a>',
    content: `
      ${renderProjectManagementPanels(state, project)}
      <section class="v2-hero-card">
        <div>
          <span class="v2-eyebrow">專案健康度</span>
          <h2>${escapeHtml(riskLabel(health.level))}</h2>
          <p>${escapeHtml(health.reason)}</p>
        </div>
        <div class="v2-hero-metrics">
          <div><span>進度</span><strong>${progress.percent}%</strong></div>
          <div><span>任務</span><strong>${progress.completed}/${progress.total}</strong></div>
          <div><span>風險</span><strong>${escapeHtml(riskLabel(risk.display))}</strong></div>
          <div><span>負責人</span><strong>${escapeHtml(owner.name)}</strong></div>
        </div>
        ${progressBar(progress.percent)}
        <p class="v2-next"><strong>下一步</strong>${escapeHtml(project.nextAction)}</p>
      </section>

      <section class="v2-kpis">
        <div><span>團隊</span><strong>${teams.length}</strong></div>
        <div><span>即將到期</span><strong>${dueSoonTasks.length}</strong></div>
        <div><span>已逾期</span><strong>${overdueTasks.length}</strong></div>
        <div><span>受阻</span><strong>${blockedTasks.length}</strong></div>
      </section>

      <section class="v2-section">
        <div class="v2-section-head"><h2>團隊</h2><p>每個工作小組都保留在同一個營隊專案中。</p></div>
        <div class="v2-card-grid">${teams.map((team) => teamCard(toTeamCard(state, team))).join('')}</div>
      </section>

      <section class="v2-two-column">
        <div class="v2-card">
          <h2>里程碑</h2>
          ${milestones.map((milestone) => `
            <div class="v2-list-item">
              <div><strong>${escapeHtml(milestone.name)}</strong><span>${escapeHtml(milestone.date)} - ${escapeHtml(getMemberById(state, milestone.ownerId).name)}</span></div>
              ${badge(milestone.critical ? '關鍵' : milestone.status, milestone.critical ? 'danger' : 'neutral')}
            </div>
          `).join('') || emptyState('目前沒有里程碑', '專案需要日期檢查點時，可以新增里程碑。')}
        </div>
        <div class="v2-card">
          <h2>受阻任務</h2>
          ${blockedTasks.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('目前沒有受阻任務', '這個專案目前沒有阻塞事項。')}
        </div>
      </section>
    `
  });
}

function renderProjectManagementPanels(state, project) {
  if (!canManageProject(state, project)) return '';
  return `
    <section class="v2-two-column">
      <div class="v2-card v2-collapsible-panel" id="edit-project-panel" hidden>
        <h2>編輯專案</h2>
        <form data-action="edit-project" class="v2-form">
          <label><span>專案名稱</span><input type="text" name="name" value="${escapeHtml(project.name)}" required></label>
          <label><span>說明</span><textarea name="description" rows="3">${escapeHtml(project.description || '')}</textarea></label>
          <label><span>負責人</span><select name="ownerId" required>${state.members.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === project.ownerId ? 'selected' : ''}>${escapeHtml(member.name)} — ${escapeHtml(roleLabel(member.role))}</option>`).join('')}</select></label>
          <label><span>開始日期</span><input type="date" name="startDate" value="${escapeHtml(project.startDate || '')}"></label>
          <label><span>截止日期</span><input type="date" name="dueDate" value="${escapeHtml(project.dueDate || '')}"></label>
          <label><span>下一步</span><input type="text" name="nextAction" value="${escapeHtml(project.nextAction || '')}"></label>
          <label><span>風險</span><select name="riskLevelManual">${riskOptions(project.riskLevelManual)}</select></label>
          <label><span>可見範圍</span><select name="visibility">${visibilityOptions(project.visibility || 'workspace')}</select></label>
          <input type="hidden" name="projectId" value="${escapeHtml(project.id)}">
          <button type="submit" class="v2-btn primary">儲存專案</button>
        </form>
      </div>
      <div class="v2-card v2-collapsible-panel" id="create-team-panel" hidden>
        <h2>新增團隊</h2>
        <form data-action="create-team" class="v2-form">
          <label><span>團隊名稱</span><input type="text" name="name" required></label>
          <label><span>團隊負責人</span><select name="leadId" required>${state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)} — ${escapeHtml(roleLabel(member.role))}</option>`).join('')}</select></label>
          <label><span>成員</span><select name="memberIds" multiple size="5">${state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)} — ${escapeHtml(roleLabel(member.role))}</option>`).join('')}</select></label>
          <label><span>下一步</span><input type="text" name="nextAction"></label>
          <label><span>可見範圍</span><select name="visibility">${visibilityOptions('project')}</select></label>
          <input type="hidden" name="projectId" value="${escapeHtml(project.id)}">
          <button type="submit" class="v2-btn primary">建立團隊</button>
        </form>
      </div>
    </section>
  `;
}

function visibilityOptions(selected) {
  return ['private', 'assigned', 'team', 'project', 'workspace']
    .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${visibilityOptionLabel(value)}</option>`)
    .join('');
}

function riskOptions(selected) {
  return ['', 'Low', 'Medium', 'High']
    .map((value) => `<option value="${value}" ${value === (selected || '') ? 'selected' : ''}>${value ? riskLabel(value) : '自動'}</option>`)
    .join('');
}

function visibilityOptionLabel(value) {
  const labels = { private: '私人', assigned: '指派對象', team: '團隊', project: '專案', workspace: '工作區' };
  return labels[value] || value;
}

function toTeamCard(state, team) {
  const project = getProjectById(state, team.projectId);
  const tasks = getVisibleTeamTasks(state, team.id);
  const risk = getRisk(project, tasks);
  return {
    ...team,
    projectName: project?.name || '未知專案',
    teamName: team.name || '未分組',
    ownerName: getMemberById(state, team.leadId).name,
    dueDate: project?.dueDate || null,
    leadName: getMemberById(state, team.leadId).name,
    progress: getProgress(tasks),
    workload: getWorkload(tasks),
    riskStatus: risk.display,
    blockedCount: getBlockedTasks(tasks).length
  };
}

function renderDeniedPage() {
  return `
    <aside class="v2-sidebar">
      <div class="v2-brand">儀表板 V2<span>原型</span></div>
      <nav class="v2-nav" aria-label="原型導覽">
        <a href="#/workspace/workspace-camp">工作區</a>
        <a href="#/my-tasks">我的任務</a>
      </nav>
      <p class="v2-sidebar-note">靜態 Vanilla JS 原型，使用本機瀏覽器保存資料。</p>
    </aside>
    <main class="v2-main">
      <header class="v2-topbar">
        <div>
          <div class="v2-crumbs"><a href="#/workspace/workspace-camp">工作區</a></div>
          <h1>無法查看此內容</h1>
          <p>目前選取的模擬使用者沒有權限查看此內容，或此內容不存在。</p>
        </div>
        <div class="v2-actions"><a class="v2-btn" href="#/workspace/workspace-camp">回到工作區</a></div>
      </header>
      <section class="v2-card"><h2>無法查看此內容</h2><p>請返回工作區，或在可查看頁面切換具備授權的模擬使用者。</p></section>
    </main>
  `;
}

function toTaskRow(state, task) {
  return {
    ...task,
    assigneeName: getMemberById(state, task.assigneeId || task.ownerId).name
  };
}
