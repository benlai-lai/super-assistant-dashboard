/**
 * 超級隨身助理 Dashboard V1
 * 應用邏輯、資料管理與交互
 */

// ====== 常量與配置 ======
const STORAGE_KEY = 'superAssistantDashboardData';
const VIEWS = {
  overview: 'overview',
  calendar: 'calendar',
  tasks: 'tasks',
  projects: 'projects',
  inbox: 'inbox',
  more: 'more'
};

// ====== 資料模型 ======
class DataManager {
  constructor() {
    this.data = this.loadOrInitialize();
  }

  loadOrInitialize() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return this.getDefaultData();
  }

  getDefaultData() {
    return {
      ideas: [
        { id: 'idea-1', title: '研究市場上的 AI 助理產品', created: new Date(2026, 6, 20), archived: false },
        { id: 'idea-2', title: '規劃下一季度的產品路線圖', created: new Date(2026, 6, 19), archived: false }
      ],
      tasks: [
        {
          id: 'task-1',
          title: '確認超級隨身助理第一版介面',
          description: '等待你的設計決策',
          status: 'waiting', // 未開始、進行中、等待決策、已完成、逾期、已封存
          priority: 1,
          dueDate: new Date(2026, 6, 22),
          projectId: 'project-1',
          archived: false
        },
        {
          id: 'task-2',
          title: '準備台北郵局拜訪資料',
          description: '產品、公司 DM、合約書',
          status: 'inprogress',
          priority: 1,
          dueDate: new Date(2026, 6, 23),
          projectId: null,
          archived: false
        },
        {
          id: 'task-3',
          title: '整理 AI Sales OS 下一階段',
          description: '定義 Codex 執行範圍',
          status: 'inprogress',
          priority: 1,
          dueDate: new Date(2026, 6, 25),
          projectId: 'project-2',
          archived: false
        },
        {
          id: 'task-4',
          title: 'BagKing 網站首頁設計',
          description: '完成視覺稿與交互原型',
          status: 'notstarted',
          priority: 2,
          dueDate: new Date(2026, 6, 28),
          projectId: 'project-3',
          archived: false
        },
        {
          id: 'task-5',
          title: '產品資料整理',
          description: '統整所有產品文件與規格',
          status: 'completed',
          priority: 2,
          dueDate: new Date(2026, 6, 20),
          projectId: null,
          archived: false
        },
        {
          id: 'task-6',
          title: '參加團隊週會',
          description: '討論本週進度與風險',
          status: 'notstarted',
          priority: 3,
          dueDate: new Date(2026, 6, 25),
          projectId: null,
          archived: false
        },
        {
          id: 'task-7',
          title: '逾期的舊專案討論',
          description: '應該在上週完成',
          status: 'overdue',
          priority: 2,
          dueDate: new Date(2026, 6, 15),
          projectId: null,
          archived: false
        }
      ],
      events: [
        {
          id: 'event-1',
          title: '整理拜訪資料',
          time: '09:00',
          date: new Date(2026, 6, 22),
          location: '辦公室',
          duration: '30 分鐘',
          completed: false
        },
        {
          id: 'event-2',
          title: '台北郵局會議',
          time: '10:00',
          date: new Date(2026, 6, 22),
          location: '台北',
          duration: '1 小時',
          completed: false
        },
        {
          id: 'event-3',
          title: '專案進度檢視',
          time: '14:00',
          date: new Date(2026, 6, 22),
          location: '線上',
          duration: '1 小時',
          completed: false
        },
        {
          id: 'event-4',
          title: '今日收尾',
          time: '17:00',
          date: new Date(2026, 6, 22),
          location: '辦公室',
          duration: '30 分鐘',
          completed: false
        },
        {
          id: 'event-5',
          title: '下週規劃會議',
          time: '10:00',
          date: new Date(2026, 6, 28),
          location: '線上',
          duration: '1 小時',
          completed: false
        }
      ],
      projects: [
        {
          id: 'project-1',
          title: '超級隨身助理',
          progress: 35,
          color: 'blue',
          nextStep: '完成首版介面',
          risk: '設計決策尚未確認'
        },
        {
          id: 'project-2',
          title: 'AI Sales OS',
          progress: 72,
          color: 'green',
          nextStep: '定義 Codex 範圍',
          risk: '無'
        },
        {
          id: 'project-3',
          title: 'BagKing 網站',
          progress: 58,
          color: 'orange',
          nextStep: '完成首頁設計',
          risk: '需要確認品牌色系'
        },
        {
          id: 'project-4',
          title: '產品資料整理',
          progress: 84,
          color: 'purple',
          nextStep: '最後審核',
          risk: '無'
        }
      ],
      settings: {
        initialized: true,
        version: 1
      }
    };
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  addIdea(title) {
    const idea = {
      id: 'idea-' + Date.now(),
      title,
      created: new Date(),
      archived: false
    };
    this.data.ideas.push(idea);
    this.save();
    return idea;
  }

  addTask(title, description, dueDate, projectId = null) {
    const task = {
      id: 'task-' + Date.now(),
      title,
      description: description || '',
      status: 'notstarted',
      priority: 2,
      dueDate: new Date(dueDate),
      projectId,
      archived: false
    };
    this.data.tasks.push(task);
    this.save();
    return task;
  }

  addEvent(title, date, time, location, duration) {
    const event = {
      id: 'event-' + Date.now(),
      title,
      date: new Date(date),
      time,
      location: location || '',
      duration: duration || '',
      completed: false
    };
    this.data.events.push(event);
    this.save();
    return event;
  }

  updateTask(taskId, updates) {
    const task = this.data.tasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      this.save();
    }
  }

  updateIdea(ideaId, updates) {
    const idea = this.data.ideas.find(i => i.id === ideaId);
    if (idea) {
      Object.assign(idea, updates);
      this.save();
    }
  }

  getTasksByStatus(status) {
    return this.data.tasks.filter(t => t.status === status && !t.archived);
  }

  getTodayTasks() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.data.tasks.filter(t => {
      const taskDate = new Date(t.dueDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === today.getTime() && !t.archived;
    });
  }

  getTodayEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.data.events
      .filter(e => {
        const eventDate = new Date(e.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.getTime() === today.getTime();
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  getEventsByDate(date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    return this.data.events
      .filter(e => {
        const eventDate = new Date(e.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.getTime() === targetDate.getTime();
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  getUpcomingItems() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneWeekLater = new Date(today);
    oneWeekLater.setDate(oneWeekLater.getDate() + 7);

    return this.data.tasks.filter(t => {
      if (t.archived || t.status === 'completed') return false;
      const taskDate = new Date(t.dueDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate >= today && taskDate <= oneWeekLater;
    });
  }

  getWaitingDecisionTasks() {
    return this.data.tasks.filter(t => t.status === 'waiting' && !t.archived);
  }

  getTasksWithPriority(priority, limit = null) {
    let tasks = this.data.tasks.filter(t => t.priority === priority && !t.archived);
    if (limit) tasks = tasks.slice(0, limit);
    return tasks;
  }

  reset() {
    this.data = this.getDefaultData();
    this.save();
  }
}

// ====== UI 管理器 ======
class UIManager {
  constructor(dataManager) {
    this.dm = dataManager;
    this.currentView = VIEWS.overview;
    this.selectedCalendarDate = new Date();
    this.init();
  }

  init() {
    this.renderOverview();
    this.attachEventListeners();
  }

  attachEventListeners() {
    // 側邊欄導覽
    const sidebarButtons = document.querySelectorAll('.nav button');
    sidebarButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => this.switchView(idx, 'sidebar'));
    });

    // 手機底部導覽
    const mobileButtons = document.querySelectorAll('.mobile-nav button');
    mobileButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => this.switchView(idx, 'mobile'));
    });
  }

  switchView(index, from = 'sidebar') {
    const viewMap = [VIEWS.overview, VIEWS.calendar, VIEWS.tasks, VIEWS.projects, VIEWS.inbox];
    if (from === 'mobile') {
      if (index === 4) {
        this.currentView = VIEWS.more;
      } else {
        this.currentView = viewMap[index];
      }
    } else {
      this.currentView = viewMap[index];
    }

    this.updateNavigation();
    this.render();
  }

  updateNavigation() {
    const viewToIndex = {
      [VIEWS.overview]: 0,
      [VIEWS.calendar]: 1,
      [VIEWS.tasks]: 2,
      [VIEWS.projects]: 3,
      [VIEWS.inbox]: 4,
      [VIEWS.more]: 4
    };

    const idx = viewToIndex[this.currentView];

    // 更新側邊欄
    const sidebarButtons = document.querySelectorAll('.nav button');
    sidebarButtons.forEach((btn, i) => {
      btn.classList.toggle('active', i === idx);
    });

    // 更新手機導覽
    const mobileButtons = document.querySelectorAll('.mobile-nav button');
    mobileButtons.forEach((btn, i) => {
      btn.classList.toggle('active', i === idx);
    });
  }

  render() {
    const main = document.querySelector('main.main');
    main.innerHTML = '';

    switch (this.currentView) {
      case VIEWS.overview:
        this.renderOverview();
        break;
      case VIEWS.calendar:
        this.renderCalendarView();
        break;
      case VIEWS.tasks:
        this.renderTasksView();
        break;
      case VIEWS.projects:
        this.renderProjectsView();
        break;
      case VIEWS.inbox:
        this.renderInboxView();
        break;
      case VIEWS.more:
        this.renderMoreView();
        break;
    }

    this.attachViewSpecificListeners();
  }

  renderOverview() {
    const today = new Date();
    const todayTasks = this.dm.getTodayTasks();
    const todayEvents = this.dm.getTodayEvents();
    const topTasks = todayTasks.filter(t => t.priority === 1).slice(0, 3);
    const waitingTasks = this.dm.getWaitingDecisionTasks();
    const upcomingItems = this.dm.getUpcomingItems();

    const completedCount = this.dm.getTasksByStatus('completed').length;
    const inprogressCount = this.dm.getTasksByStatus('inprogress').length;
    const waitingCount = waitingTasks.length;
    const overdueCount = this.dm.getTasksByStatus('overdue').length;

    let html = `
      <header class="topbar">
        <div class="title">
          <h1>早安，Andy</h1>
          <p>今天先處理最重要的事，不必把全部工作背在腦中。</p>
        </div>
        <div class="actions">
          <button class="btn">本週</button>
          <button class="btn primary" onclick="window.appUI.openQuickAdd()">＋ 快速新增</button>
        </div>
      </header>

      <section class="grid kpis">
        <div class="card kpi">
          <div class="label">今日任務</div>
          <div class="value">${todayTasks.length}</div>
          <div class="note">最重要 ${Math.min(topTasks.length, 3)} 項</div>
        </div>
        <div class="card kpi">
          <div class="label">已完成</div>
          <div class="value">${completedCount}</div>
          <div class="note">本月完成率</div>
        </div>
        <div class="card kpi">
          <div class="label">進行中</div>
          <div class="value">${inprogressCount}</div>
          <div class="note">請持續推進</div>
        </div>
        <div class="card kpi">
          <div class="label">等待決策</div>
          <div class="value">${waitingCount}</div>
          <div class="note">需要你確認</div>
        </div>
        <div class="card kpi hide-mobile">
          <div class="label">逾期</div>
          <div class="value">${overdueCount}</div>
          <div class="note">建議今天處理</div>
        </div>
      </section>

      <section class="grid content">
        <div class="card">
          <h2>今天最重要的三件事</h2>
          ${topTasks.length > 0
            ? topTasks.map(t => `
              <div class="focus">
                <strong>${t.title}</strong>
                <small>${t.description || ''}</small>
              </div>
            `).join('')
            : '<div style="color: var(--muted);">沒有優先任務</div>'
          }
        </div>

        <div class="card">
          <h2>今日行程</h2>
          <div class="timeline">
            ${todayEvents.length > 0
              ? todayEvents.map(e => `
                <div class="event">
                  <b>${e.time}</b>
                  <i class="dot"></i>
                  <div>
                    <strong>${e.title}</strong>
                    <small>${e.location || e.duration}</small>
                  </div>
                </div>
              `).join('')
              : '<div style="color: var(--muted);">今日無行程</div>'
            }
          </div>
        </div>

        <div class="card">
          <h2>專案進度概覽</h2>
          <div class="progress-list">
            ${this.dm.data.projects.map(p => `
              <div class="progress-row">
                <div>
                  ${p.title}
                  <div class="bar">
                    <div class="fill" style="width:${p.progress}%; background:var(--${p.color === 'blue' ? 'blue' : p.color === 'green' ? 'green' : p.color === 'orange' ? 'orange' : 'purple'})"></div>
                  </div>
                </div>
                <b>${p.progress}%</b>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <section class="grid bottom" style="margin-top:16px">
        <div class="card">
          <h2>等待你決策</h2>
          <div class="status-list">
            ${waitingTasks.length > 0
              ? waitingTasks.map(t => `
                <div class="status">
                  <span>${t.title}</span>
                  <span class="badge">待確認</span>
                </div>
              `).join('')
              : '<div style="color: var(--muted); font-size: 14px;">暫無待確認項目</div>'
            }
          </div>
        </div>
        <div class="card">
          <h2>即將到期</h2>
          <div class="status-list">
            ${upcomingItems.length > 0
              ? upcomingItems.slice(0, 3).map(t => {
                const dueDate = new Date(t.dueDate);
                const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                let badgeClass = 'green';
                let badgeText = '本週';
                if (daysUntil <= 1) {
                  badgeClass = 'red';
                  badgeText = '明天';
                } else if (daysUntil <= 3) {
                  badgeClass = 'orange';
                  badgeText = '本週';
                }
                return `
                  <div class="status">
                    <span>${t.title}</span>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                  </div>
                `;
              }).join('')
              : '<div style="color: var(--muted); font-size: 14px;">暫無即將到期項目</div>'
            }
          </div>
        </div>
        <div class="card">
          <h2>本月</h2>
          ${this.renderSmallCalendar()}
        </div>
      </section>
    `;

    document.querySelector('main.main').innerHTML = html;
  }

  renderSmallCalendar() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const daysWithEvents = new Set();
    this.dm.data.events.forEach(e => {
      const eDate = new Date(e.date);
      if (eDate.getFullYear() === year && eDate.getMonth() === month) {
        daysWithEvents.add(eDate.getDate());
      }
    });

    let html = '<div class="calendar">';
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
    dayLabels.forEach(label => {
      html += `<span class="head">${label}</span>`;
    });

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      const isToday =
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();

      const isCurrentMonth = date.getMonth() === month;
      const hasEvent = daysWithEvents.has(date.getDate());

      let className = '';
      if (isToday) className += 'today ';
      if (!isCurrentMonth) className += 'other-month ';
      if (hasEvent && isCurrentMonth) className += 'has-event ';

      html += `<span class="${className}">${date.getDate()}</span>`;
    }

    html += '</div>';
    return html;
  }

  renderCalendarView() {
    const year = this.selectedCalendarDate.getFullYear();
    const month = this.selectedCalendarDate.getMonth();
    const monthName = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'][month];

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const daysWithEvents = new Set();
    this.dm.data.events.forEach(e => {
      const eDate = new Date(e.date);
      if (eDate.getFullYear() === year && eDate.getMonth() === month) {
        daysWithEvents.add(eDate.getDate());
      }
    });

    let html = `
      <header class="topbar">
        <div class="title">
          <h1>${year} 年 ${monthName}</h1>
          <p>點擊日期查看當日行程</p>
        </div>
        <div class="actions">
          <button class="btn" onclick="window.appUI.prevMonth()">◄ 上月</button>
          <button class="btn primary" onclick="window.appUI.nextMonth()">下月 ►</button>
        </div>
      </header>

      <section class="grid" style="grid-template-columns: 1fr;">
        <div class="card">
          <div class="calendar">
    `;

    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
    dayLabels.forEach(label => {
      html += `<span class="head">${label}</span>`;
    });

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      const isCurrentMonth = date.getMonth() === month;
      const hasEvent = daysWithEvents.has(date.getDate());
      const isSelected =
        date.getDate() === this.selectedCalendarDate.getDate() &&
        date.getMonth() === this.selectedCalendarDate.getMonth() &&
        date.getFullYear() === this.selectedCalendarDate.getFullYear();

      let className = '';
      if (!isCurrentMonth) className += 'other-month ';
      if (hasEvent && isCurrentMonth) className += 'has-event ';
      if (isSelected) className += 'selected ';

      html += `
        <span class="${className}" onclick="window.appUI.selectCalendarDate(new Date(${date.getFullYear()}, ${date.getMonth()}, ${date.getDate()}))">
          ${date.getDate()}
        </span>
      `;
    }

    html += `
          </div>
        </div>
      </section>
    `;

    const selectedEvents = this.dm.getEventsByDate(this.selectedCalendarDate);
    if (selectedEvents.length > 0) {
      html += `
        <section class="grid" style="grid-template-columns: 1fr; margin-top: 16px;">
          <div class="card">
            <h2>${this.selectedCalendarDate.getMonth() + 1} 月 ${this.selectedCalendarDate.getDate()} 日的行程</h2>
            <div class="timeline">
              ${selectedEvents.map(e => `
                <div class="event">
                  <b>${e.time}</b>
                  <i class="dot"></i>
                  <div>
                    <strong>${e.title}</strong>
                    <small>${e.location || e.duration}</small>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>
      `;
    }

    document.querySelector('main.main').innerHTML = html;
  }

  renderTasksView() {
    const notstarted = this.dm.getTasksByStatus('notstarted');
    const inprogress = this.dm.getTasksByStatus('inprogress');
    const waiting = this.dm.getTasksByStatus('waiting');
    const completed = this.dm.getTasksByStatus('completed');
    const overdue = this.dm.getTasksByStatus('overdue');

    let html = `
      <header class="topbar">
        <div class="title">
          <h1>任務管理</h1>
          <p>檢視與管理所有任務</p>
        </div>
        <div class="actions">
          <button class="btn primary" onclick="window.appUI.openQuickAdd()">＋ 新增任務</button>
        </div>
      </header>

      <section class="grid" style="grid-template-columns: 1fr;">
    `;

    const sections = [
      { title: '未開始', tasks: notstarted, color: 'blue' },
      { title: '進行中', tasks: inprogress, color: 'green' },
      { title: '等待決策', tasks: waiting, color: 'orange' },
      { title: '逾期', tasks: overdue, color: 'red' },
      { title: '已完成', tasks: completed, color: 'gray' }
    ];

    sections.forEach(section => {
      if (section.tasks.length > 0) {
        html += `
          <div class="card">
            <h2>${section.title} (${section.tasks.length})</h2>
            <div class="task-list">
              ${section.tasks.map(t => this.renderTaskItem(t)).join('')}
            </div>
          </div>
        `;
      }
    });

    html += `</section>`;
    document.querySelector('main.main').innerHTML = html;
  }

  renderTaskItem(task) {
    const statusMap = {
      'notstarted': '未開始',
      'inprogress': '進行中',
      'waiting': '等待決策',
      'completed': '已完成',
      'overdue': '逾期',
      'archived': '已封存'
    };

    return `
      <div class="task-item" data-task-id="${task.id}">
        <div style="display: flex; gap: 12px; align-items: start;">
          <input type="checkbox" ${task.status === 'completed' ? 'checked' : ''} 
            onchange="window.appUI.toggleTaskComplete('${task.id}')" 
            style="margin-top: 4px; cursor: pointer;">
          <div style="flex: 1;">
            <strong style="display: block; ${task.status === 'completed' ? 'text-decoration: line-through; color: var(--muted);' : ''}">${task.title}</strong>
            ${task.description ? `<small style="color: var(--muted);">${task.description}</small>` : ''}
            <small style="display: block; margin-top: 6px; color: var(--muted);">
              到期: ${new Date(task.dueDate).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
            </small>
          </div>
          <div style="display: flex; gap: 8px;">
            <select onchange="window.appUI.updateTaskStatus('${task.id}', this.value)" 
              style="padding: 6px; border: 1px solid var(--line); border-radius: 8px; font-size: 12px;">
              <option value="notstarted" ${task.status === 'notstarted' ? 'selected' : ''}>未開始</option>
              <option value="inprogress" ${task.status === 'inprogress' ? 'selected' : ''}>進行中</option>
              <option value="waiting" ${task.status === 'waiting' ? 'selected' : ''}>等待決策</option>
              <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>已完成</option>
              <option value="overdue" ${task.status === 'overdue' ? 'selected' : ''}>逾期</option>
            </select>
            <button class="btn" style="padding: 6px 10px; font-size: 12px;" onclick="window.appUI.archiveTask('${task.id}')">封存</button>
          </div>
        </div>
      </div>
    `;
  }

  renderProjectsView() {
    const projects = this.dm.data.projects;

    let html = `
      <header class="topbar">
        <div class="title">
          <h1>專案進度</h1>
          <p>監控所有專案的進度與風險</p>
        </div>
      </header>

      <section class="grid" style="grid-template-columns: 1fr;">
    `;

    projects.forEach(p => {
      const tasks = this.dm.data.tasks.filter(t => t.projectId === p.id && !t.archived);
      const completedTasks = tasks.filter(t => t.status === 'completed').length;

      html += `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <h3 style="margin: 0;">${p.title}</h3>
            <span class="badge">${p.progress}%</span>
          </div>
          <div class="bar" style="margin-bottom: 12px;">
            <div class="fill" style="width: ${p.progress}%; background: var(--${p.color})"></div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
            <div>
              <strong>下一步</strong>
              <p style="color: var(--muted); margin: 4px 0 0;">${p.nextStep}</p>
            </div>
            <div>
              <strong>風險</strong>
              <p style="color: var(--muted); margin: 4px 0 0;">${p.risk}</p>
            </div>
          </div>
          ${tasks.length > 0 ? `
            <div style="margin-top: 12px; border-top: 1px solid var(--line); padding-top: 12px;">
              <small style="color: var(--muted);">相關任務: ${completedTasks}/${tasks.length} 已完成</small>
            </div>
          ` : ''}
        </div>
      `;
    });

    html += `</section>`;
    document.querySelector('main.main').innerHTML = html;
  }

  renderInboxView() {
    const ideas = this.dm.data.ideas.filter(i => !i.archived);

    let html = `
      <header class="topbar">
        <div class="title">
          <h1>Inbox（想法箱）</h1>
          <p>存放尚未承諾執行的想法與靈感</p>
        </div>
        <div class="actions">
          <button class="btn primary" onclick="window.appUI.openQuickAdd()">＋ 新增想法</button>
        </div>
      </header>

      <section class="grid" style="grid-template-columns: 1fr;">
        <div class="card">
          <h2>未處理想法 (${ideas.length})</h2>
          ${ideas.length > 0
            ? `<div style="display: grid; gap: 12px;">
                ${ideas.map(i => `
                  <div style="padding: 12px; border: 1px solid var(--line); border-radius: 12px;">
                    <strong>${i.title}</strong>
                    <div style="margin-top: 8px; display: flex; gap: 8px;">
                      <button class="btn" style="padding: 6px 10px; font-size: 12px;" onclick="window.appUI.convertIdeaToTask('${i.id}')">轉換為任務</button>
                      <button class="btn" style="padding: 6px 10px; font-size: 12px;" onclick="window.appUI.archiveIdea('${i.id}')">封存</button>
                    </div>
                  </div>
                `).join('')}
              </div>`
            : '<div style="color: var(--muted);">Inbox 已清空</div>'
          }
        </div>
      </section>
    `;

    document.querySelector('main.main').innerHTML = html;
  }

  renderMoreView() {
    let html = `
      <header class="topbar">
        <div class="title">
          <h1>更多</h1>
          <p>其他功能與設定</p>
        </div>
      </header>

      <section class="grid" style="grid-template-columns: 1fr;">
        <div class="card">
          <h2>功能</h2>
          <div style="display: grid; gap: 12px;">
            <div style="padding: 12px; border: 1px solid var(--line); border-radius: 12px;">
              <strong>報表</strong>
              <p style="color: var(--muted); margin: 6px 0; font-size: 14px;">尚未開放</p>
            </div>
            <div style="padding: 12px; border: 1px solid var(--line); border-radius: 12px;">
              <strong>設定</strong>
              <p style="color: var(--muted); margin: 6px 0; font-size: 14px;">尚未開放</p>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>開發者工具</h2>
          <div style="display: grid; gap: 12px;">
            <button class="btn" style="padding: 12px; width: 100%;" onclick="window.appUI.resetData()">重設示範資料</button>
            <small style="color: var(--muted);">清除所有資料並重新載入預設示範資料。</small>
          </div>
        </div>
      </section>
    `;

    document.querySelector('main.main').innerHTML = html;
  }

  attachViewSpecificListeners() {
    // 視圖特定的事件監聽會在 render 函式中的 onclick 等處理
  }

  openQuickAdd() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0;">快速新增</h2>
          <button onclick="this.closest('.modal').remove()" style="border: 0; background: transparent; font-size: 24px; cursor: pointer;">✕</button>
        </div>

        <div style="display: grid; gap: 12px;">
          <label style="display: block;">
            <strong style="display: block; margin-bottom: 6px;">類型</strong>
            <select id="quickAddType" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px;">
              <option value="idea">想法</option>
              <option value="task">任務</option>
              <option value="event">行程</option>
            </select>
          </label>

          <label style="display: block;">
            <strong style="display: block; margin-bottom: 6px;">標題/內容 *</strong>
            <input type="text" id="quickAddTitle" placeholder="例如：明天十點去台北郵局開會" 
              style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px;">
          </label>

          <label id="quickAddDescLabel" style="display: block;">
            <strong style="display: block; margin-bottom: 6px;">描述</strong>
            <input type="text" id="quickAddDescription" placeholder="額外說明"
              style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px;">
          </label>

          <label id="quickAddDateLabel" style="display: none;">
            <strong style="display: block; margin-bottom: 6px;">日期</strong>
            <input type="date" id="quickAddDate" 
              style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px;">
          </label>

          <label id="quickAddTimeLabel" style="display: none;">
            <strong style="display: block; margin-bottom: 6px;">時間</strong>
            <input type="time" id="quickAddTime" 
              style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px;">
          </label>

          <label id="quickAddLocationLabel" style="display: none;">
            <strong style="display: block; margin-bottom: 6px;">地點</strong>
            <input type="text" id="quickAddLocation" placeholder="例如：台北"
              style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px;">
          </label>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
          <button class="btn" onclick="this.closest('.modal').remove()">取消</button>
          <button class="btn primary" onclick="window.appUI.submitQuickAdd()">新增</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
      }
      .modal-content {
        background: white;
        border-radius: 18px;
        padding: 24px;
        max-width: 500px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
      }
    `;

    if (!document.querySelector('style[data-modal-style]')) {
      style.setAttribute('data-modal-style', '1');
      document.head.appendChild(style);
    }

    document.body.appendChild(modal);

    const typeSelect = document.getElementById('quickAddType');
    const descLabel = document.getElementById('quickAddDescLabel');
    const dateLabel = document.getElementById('quickAddDateLabel');
    const timeLabel = document.getElementById('quickAddTimeLabel');
    const locationLabel = document.getElementById('quickAddLocationLabel');

    const updateFields = () => {
      const type = typeSelect.value;
      descLabel.style.display = type !== 'idea' ? 'block' : 'none';
      dateLabel.style.display = type !== 'idea' ? 'block' : 'none';
      timeLabel.style.display = type === 'event' ? 'block' : 'none';
      locationLabel.style.display = type === 'event' ? 'block' : 'none';
    };

    typeSelect.addEventListener('change', updateFields);
    updateFields();

    // 設定日期預設為今天
    const today = new Date();
    document.getElementById('quickAddDate').valueAsDate = today;
  }

  submitQuickAdd() {
    const modal = document.querySelector('.modal');
    if (!modal) return;

    const type = document.getElementById('quickAddType').value;
    const title = document.getElementById('quickAddTitle').value.trim();

    if (!title) {
      alert('請輸入標題');
      return;
    }

    try {
      if (type === 'idea') {
        this.dm.addIdea(title);
      } else if (type === 'task') {
        const description = document.getElementById('quickAddDescription').value.trim();
        const date = document.getElementById('quickAddDate').value;
        this.dm.addTask(title, description, date);
      } else if (type === 'event') {
        const date = document.getElementById('quickAddDate').value;
        const time = document.getElementById('quickAddTime').value;
        const location = document.getElementById('quickAddLocation').value.trim();

        if (!date || !time) {
          alert('請選擇日期和時間');
          return;
        }

        this.dm.addEvent(title, date, time, location);
      }

      modal.remove();
      this.render();
    } catch (err) {
      console.error('新增項目失敗:', err);
      alert('新增失敗，請檢查輸入');
    }
  }

  toggleTaskComplete(taskId) {
    const task = this.dm.data.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = task.status === 'completed' ? 'inprogress' : 'completed';
      this.dm.save();
      this.render();
    }
  }

  updateTaskStatus(taskId, status) {
    this.dm.updateTask(taskId, { status });
    this.render();
  }

  archiveTask(taskId) {
    this.dm.updateTask(taskId, { archived: true });
    this.render();
  }

  archiveIdea(ideaId) {
    this.dm.updateIdea(ideaId, { archived: true });
    this.render();
  }

  convertIdeaToTask(ideaId) {
    const idea = this.dm.data.ideas.find(i => i.id === ideaId);
    if (idea) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      this.dm.addTask(idea.title, '', tomorrow);
      this.dm.updateIdea(ideaId, { archived: true });
      alert(`已將「${idea.title}」轉換為任務`);
      this.render();
    }
  }

  prevMonth() {
    this.selectedCalendarDate.setMonth(this.selectedCalendarDate.getMonth() - 1);
    this.render();
  }

  nextMonth() {
    this.selectedCalendarDate.setMonth(this.selectedCalendarDate.getMonth() + 1);
    this.render();
  }

  selectCalendarDate(date) {
    this.selectedCalendarDate = date;
    this.render();
  }

  resetData() {
    if (confirm('確定要重設所有資料為預設示範資料嗎？這個動作無法復原。')) {
      this.dm.reset();
      this.currentView = VIEWS.overview;
      this.render();
      alert('資料已重設');
    }
  }
}

// ====== 初始化 ======
document.addEventListener('DOMContentLoaded', () => {
  window.appDM = new DataManager();
  window.appUI = new UIManager(window.appDM);
});
