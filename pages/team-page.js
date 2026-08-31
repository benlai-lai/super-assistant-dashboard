import { taskRow } from '../components/cards.js';
import { badge, emptyState, escapeHtml, layout, progressBar, roleLabel, visibilityLabel, workloadLabel } from '../components/ui.js';
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
    subtitle: '團隊儀表板，提供原型階段的輕量任務管理操作。',
    breadcrumbs: [
      { label: '工作區', href: `#/workspace/${workspace.id}` },
      { label: '專案', href: `#/project/${project.id}` },
      { label: '團隊', href: `#/team/${team.id}` }
    ],
    actions: `${canManageTeam(state, team) ? '<button class="v2-btn" type="button" data-action="toggle-edit-team">編輯團隊</button>' : ''}${
      canCreateTask(state, { teamId: team.id, projectId: project.id, assigneeId: state.currentUserId })
        ? '<button class="v2-btn primary" type="button" data-action="toggle-create-task">建立任務</button>'
        : '<span class="v2-readonly-note">此模擬使用者為唯讀</span>'
    }`,
    content: `
      <section class="v2-hero-card">
        <div>
          <span class="v2-eyebrow">團隊儀表板</span>
          <h2>${progress.percent}% 完成</h2>
          <p>負責人：${escapeHtml(lead.name)}。下一步：${escapeHtml(team.nextAction)}</p>
        </div>
        ${progressBar(progress.percent)}
      </section>
      <section class="v2-kpis">
        <div><span>任務</span><strong>${progress.completed}/${progress.total}</strong></div>
        <div><span>即將到期</span><strong>${dueSoon.length}</strong></div>
        <div><span>已逾期</span><strong>${overdue.length}</strong></div>
        <div><span>受阻</span><strong>${blocked.length}</strong></div>
        <div><span>工作量</span><strong>${workloadLabel(workload.status)}</strong></div>
      </section>
      ${renderEditTeamPanel(state, team)}
      <section class="v2-card v2-create-task-panel" id="create-task-panel" hidden>
        <h2>新增任務</h2>
        <form data-action="create-task" class="v2-form">
          <label>
            <span>任務標題</span>
            <input type="text" name="title" placeholder="任務標題" required>
          </label>
          <label>
            <span>負責人</span>
            <select name="assigneeId" required>
              ${state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>可見範圍</span>
            <select name="visibility">
              <option value="team">團隊</option>
              <option value="project">專案</option>
              <option value="workspace">工作區</option>
              <option value="assigned">指派對象</option>
              <option value="private">私人</option>
            </select>
          </label>
          <label>
            <span>截止日期</span>
            <input type="date" name="dueDate">
          </label>
          <input type="hidden" name="teamId" value="${escapeHtml(team.id)}">
          <input type="hidden" name="projectId" value="${escapeHtml(project.id)}">
          <button type="submit" class="v2-btn primary">建立</button>
        </form>
      </section>
      <section class="v2-section">
        <div class="v2-section-head">
          <h2>團隊任務</h2>
          <p>原型支援查看、建立、指派、更新狀態與調整截止日期；暫不包含留言與提及功能。</p>
        </div>
        <div class="v2-table-toolbar">
          ${badge(`${workload.points} 點`, workload.status === 'Overloaded' ? 'danger' : 'neutral')}
          ${badge(`${workload.openTasks} 個未完成任務`, 'neutral')}
        </div>
        <div class="v2-task-list">${tasks.map((task) => taskRow(toTaskRow(state, task))).join('') || emptyState('目前沒有任務', '為這個團隊建立第一個任務。')}</div>
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
      <h2>編輯團隊</h2>
      <form data-action="edit-team" class="v2-form">
        <label><span>團隊名稱</span><input type="text" name="name" value="${escapeHtml(team.name)}" required></label>
        <label><span>專案</span><select name="projectId" required>${manageableProjects.map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === team.projectId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}</select></label>
        <label><span>團隊負責人</span><select name="leadId" required>${state.members.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === team.leadId ? 'selected' : ''}>${escapeHtml(member.name)} — ${escapeHtml(roleLabel(member.role))}</option>`).join('')}</select></label>
        <label><span>成員</span><select name="memberIds" multiple size="5">${state.members.map((member) => `<option value="${escapeHtml(member.id)}" ${teamMembers.has(member.id) ? 'selected' : ''}>${escapeHtml(member.name)} — ${escapeHtml(roleLabel(member.role))}</option>`).join('')}</select></label>
        <label><span>下一步</span><input type="text" name="nextAction" value="${escapeHtml(team.nextAction || '')}"></label>
        <label><span>可見範圍</span><select name="visibility">${visibilityOptions(team.visibility || 'project')}</select></label>
        <input type="hidden" name="teamId" value="${escapeHtml(team.id)}">
        <button type="submit" class="v2-btn primary">儲存團隊</button>
      </form>
    </section>
  `;
}

function visibilityOptions(selected) {
  return ['private', 'assigned', 'team', 'project', 'workspace']
    .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${visibilityLabel(value)}</option>`)
    .join('');
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
