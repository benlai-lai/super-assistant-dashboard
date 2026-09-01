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
    breadcrumbs: [{ label: '工作區', href: `#/workspace/${workspace.id}` }],
    actions: canCreateProject(state, workspace.id)
      ? '<button class="v2-btn primary" type="button" data-action="toggle-create-project">建立專案</button><a class="v2-btn" href="#/my-tasks">我的任務</a>'
      : '<a class="v2-btn" href="#/my-tasks">我的任務</a>',
    content: `
      <section class="v2-kpis">
        <div><span>工作區進度</span><strong>${progress.percent}%</strong></div>
        <div><span>專案</span><strong>${projects.length}</strong></div>
        <div><span>即將到期</span><strong>${dueSoon}</strong></div>
        <div><span>已逾期</span><strong>${overdue}</strong></div>
        <div><span>受阻</span><strong>${blocked}</strong></div>
      </section>

      <section class="v2-section">
        ${renderCreateProjectPanel(state, workspace)}
        <div class="v2-section-head">
          <h2>專案</h2>
          <p>開啟專案以檢視團隊進度、里程碑、風險與下一步。</p>
        </div>
        <div class="v2-card-grid">
          ${projects.length ? projects.map((project) => projectCard(toProjectCard(state, project))).join('') : emptyState('目前沒有專案', '建立專案後即可開始使用工作區儀表板。')}
        </div>
      </section>
    `
  });
}

function renderCreateProjectPanel(state, workspace) {
  if (!canCreateProject(state, workspace.id)) return '';
  return `
    <section class="v2-card v2-collapsible-panel" id="create-project-panel" hidden>
      <h2>新增專案</h2>
      <form data-action="create-project" class="v2-form">
        <label><span>專案名稱</span><input type="text" name="name" required></label>
        <label><span>說明</span><textarea name="description" rows="3"></textarea></label>
        <label><span>負責人</span><select name="ownerId" required>${state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join('')}</select></label>
        <label><span>開始日期</span><input type="date" name="startDate"></label>
        <label><span>截止日期</span><input type="date" name="dueDate"></label>
        <label><span>下一步</span><input type="text" name="nextAction"></label>
        <label><span>風險</span><select name="riskLevelManual"><option value="">自動</option><option value="Low">低</option><option value="Medium">中</option><option value="High">高</option></select></label>
        <label><span>可見範圍</span><select name="visibility"><option value="workspace">工作區</option><option value="project">專案</option><option value="team">團隊</option><option value="assigned">指派對象</option><option value="private">私人</option></select></label>
        <input type="hidden" name="workspaceId" value="${escapeHtml(workspace.id)}">
        <button type="submit" class="v2-btn primary">建立專案</button>
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
    teamName: teams.length ? `${teams.length} 個團隊` : '未分組',
    ownerName: getMemberById(state, project.ownerId).name,
    progress: getProgress(tasks),
    health: getHealth(project, tasks),
    risk: getRisk(project, tasks),
    riskStatus: getRisk(project, tasks).display,
    blockedCount: getBlockedTasks(tasks).length
  };
}
