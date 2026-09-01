export const mockData = {
  currentUserId: 'user-amy',
  users: [
    { id: 'user-amy', name: 'Amy Chen', role: 'Workspace Owner', teamId: 'team-checkin' },
    { id: 'user-grace', name: 'Grace Hsu', role: 'Workspace Admin', teamId: 'team-admin' },
    { id: 'user-ben', name: 'Ben Lin', role: 'Project Manager', teamId: 'team-admin' },
    { id: 'user-chris', name: 'Chris Wang', role: 'Team Lead', teamId: 'team-teaching' },
    { id: 'user-dora', name: 'Dora Huang', role: 'Member', teamId: 'team-design' },
    { id: 'user-evan', name: 'Evan Wu', role: 'Member', teamId: 'team-equipment' },
    { id: 'user-fiona', name: 'Fiona Tsai', role: 'Viewer', teamId: 'team-traffic' }
  ],
  workspaces: [
    {
      id: 'workspace-camp',
      name: '營隊營運工作區',
      description: '給非技術團隊規劃活動、營隊與事工營運使用的共用指揮中心。',
      ownerId: 'user-amy'
    }
  ],
  projects: [
    {
      id: 'project-summer-camp',
      workspaceId: 'workspace-camp',
      name: '2026 暑期青年營',
      description: '一個營隊就是一個專案；每個工作小組是團隊，每個具體工作項目是任務。',
      ownerId: 'user-ben',
      startDate: '2026-07-20',
      dueDate: '2026-08-08',
      nextAction: '確認投影機可用性，並核准最終報到流程。',
      riskLevelManual: null,
      visibility: 'workspace'
    }
  ],
  teams: [
    { id: 'team-checkin', projectId: 'project-summer-camp', name: '報到團隊', leadId: 'user-amy', nextAction: '與場地方確認報到動線配置。', visibility: 'project' },
    { id: 'team-admin', projectId: 'project-summer-camp', name: '行政團隊', leadId: 'user-grace', nextAction: '確認家長聯絡負責人。', visibility: 'project' },
    { id: 'team-teaching', projectId: 'project-summer-camp', name: '教材團隊', leadId: 'user-chris', nextAction: '確認第一天講義內容。', visibility: 'project' },
    { id: 'team-design', projectId: 'project-summer-camp', name: '美術團隊', leadId: 'user-dora', nextAction: '完成指標設計風格。', visibility: 'team' },
    { id: 'team-equipment', projectId: 'project-summer-camp', name: '器材團隊', leadId: 'user-evan', nextAction: '向場地方追蹤投影機型號。', visibility: 'project' },
    { id: 'team-traffic', projectId: 'project-summer-camp', name: '交通團隊', leadId: 'user-fiona', nextAction: '名單截止後確認接駁車數量。', visibility: 'project' }
  ],
  milestones: [
    {
      id: 'milestone-final-check',
      projectId: 'project-summer-camp',
      name: '最終就緒檢查',
      date: '2026-08-05',
      ownerId: 'user-ben',
      status: 'upcoming',
      critical: true,
      relatedTaskIds: ['task-handout-print', 'task-projector', 'task-shuttle-notice', 'task-name-tags']
    }
  ],
  tasks: [
    { id: 'task-checkin-flow', teamId: 'team-checkin', projectId: 'project-summer-camp', title: '設計報到流程', status: 'in-progress', ownerId: 'user-amy', assigneeId: 'user-amy', dueDate: '2026-07-30', weight: 2, nextAction: '確認報到站配置', dependsOnTaskIds: [], blocked: false, visibility: 'workspace' },
    { id: 'task-attendee-list', teamId: 'team-checkin', projectId: 'project-summer-camp', title: '建立學員名單', status: 'done', ownerId: 'user-ben', assigneeId: 'user-ben', dueDate: '2026-07-28', weight: 1, nextAction: '分享最終名單', dependsOnTaskIds: [], blocked: false, visibility: 'project' },
    { id: 'task-name-tags', teamId: 'team-checkin', projectId: 'project-summer-camp', title: '準備名牌', status: 'not-started', ownerId: 'user-amy', assigneeId: 'user-amy', dueDate: '2026-08-02', weight: 1, nextAction: '送印名牌', dependsOnTaskIds: ['task-attendee-list'], blocked: false, visibility: 'team' },

    { id: 'task-day-one-handout', teamId: 'team-teaching', projectId: 'project-summer-camp', title: '完成第一天講義', status: 'in-progress', ownerId: 'user-chris', assigneeId: 'user-chris', dueDate: '2026-07-31', weight: 3, nextAction: '確認講員修訂', dependsOnTaskIds: [], blocked: false, visibility: 'team' },
    { id: 'task-handout-print', teamId: 'team-teaching', projectId: 'project-summer-camp', title: '印製學員手冊', status: 'blocked', ownerId: 'user-dora', assigneeId: 'user-dora', dueDate: '2026-08-04', weight: 2, nextAction: '等待講義最終版', dependsOnTaskIds: ['task-day-one-handout'], blocked: true, blockedReason: '等待第一天講義最終版。', visibility: 'assigned' },
    { id: 'task-discussion-questions', teamId: 'team-teaching', projectId: 'project-summer-camp', title: '準備討論題目', status: 'not-started', ownerId: 'user-chris', assigneeId: 'user-chris', dueDate: '2026-08-03', weight: 2, nextAction: '將草稿寄給小組長', dependsOnTaskIds: [], blocked: false, visibility: 'private' },

    { id: 'task-design-banner', teamId: 'team-design', projectId: 'project-summer-camp', title: '設計歡迎布條', status: 'not-started', ownerId: 'user-dora', assigneeId: 'user-dora', dueDate: '2026-08-03', weight: 2, nextAction: '確認布條尺寸', dependsOnTaskIds: [], blocked: false, visibility: 'team' },

    { id: 'task-sound-list', teamId: 'team-equipment', projectId: 'project-summer-camp', title: '確認音響器材清單', status: 'done', ownerId: 'user-evan', assigneeId: 'user-evan', dueDate: '2026-07-29', weight: 2, nextAction: '封存器材清單', dependsOnTaskIds: [], blocked: false, visibility: 'project' },
    { id: 'task-projector', teamId: 'team-equipment', projectId: 'project-summer-camp', title: '借用投影機', status: 'blocked', ownerId: 'user-evan', assigneeId: 'user-evan', dueDate: '2026-08-01', weight: 1, nextAction: '向場地方確認型號', dependsOnTaskIds: [], blocked: true, blockedReason: '場地方尚未確認投影機可用性。', visibility: 'workspace' },
    { id: 'task-cables', teamId: 'team-equipment', projectId: 'project-summer-camp', title: '準備延長線與麥克風', status: 'not-started', ownerId: 'user-fiona', assigneeId: 'user-fiona', dueDate: '2026-08-05', weight: 1, nextAction: '檢查教會儲藏室', dependsOnTaskIds: ['task-projector'], blocked: false, visibility: 'assigned' },

    { id: 'task-shuttle-count', teamId: 'team-traffic', projectId: 'project-summer-camp', title: '確認接駁車數量', status: 'in-progress', ownerId: 'user-fiona', assigneeId: 'user-fiona', dueDate: '2026-07-30', weight: 3, nextAction: '確認參加人數', dependsOnTaskIds: ['task-attendee-list'], blocked: false, visibility: 'team' },
    { id: 'task-shuttle-notice', teamId: 'team-traffic', projectId: 'project-summer-camp', title: '建立接駁通知', status: 'not-started', ownerId: 'user-amy', assigneeId: 'user-amy', dueDate: '2026-08-02', weight: 2, nextAction: '撰寫家長訊息草稿', dependsOnTaskIds: ['task-shuttle-count'], blocked: false, visibility: 'project' },
    { id: 'task-driver-sheet', teamId: 'team-traffic', projectId: 'project-summer-camp', title: '建立司機聯絡表', status: 'not-started', ownerId: 'user-ben', assigneeId: 'user-ben', dueDate: null, weight: 1, nextAction: '收集電話號碼', dependsOnTaskIds: [], blocked: false, visibility: 'workspace' }
  ],
  externalLinks: [
    { id: 'link-venue-map', projectId: 'project-summer-camp', teamId: 'team-checkin', taskId: 'task-checkin-flow', title: '場地地圖', type: 'Google Drive', url: 'https://drive.google.com/example/venue-map', note: '供報到團隊與交通團隊使用。', createdBy: 'user-amy', createdAt: '2026-07-24', visibility: 'project' },
    { id: 'link-private-speaker-notes', projectId: 'project-summer-camp', teamId: 'team-teaching', taskId: 'task-discussion-questions', title: '講員私人筆記', type: 'Google Drive', url: 'https://drive.google.com/example/speaker-notes', note: '模擬模式中只讓任務負責人查看。', createdBy: 'user-chris', createdAt: '2026-07-25', visibility: 'private' }
  ],
  activity: [
    { id: 'act-1', projectId: 'project-summer-camp', type: 'status_change', text: '器材團隊將「借用投影機」標記為受阻。', createdAt: '2026-07-25T09:30:00', actorId: 'user-evan' },
    { id: 'act-2', projectId: 'project-summer-camp', type: 'assignment', text: 'Amy 將「建立接駁通知」指派給自己。', createdAt: '2026-07-25T10:20:00', actorId: 'user-amy' },
    { id: 'act-3', projectId: 'project-summer-camp', type: 'external_link', text: '已新增「場地地圖」外部連結。', createdAt: '2026-07-25T11:10:00', actorId: 'user-amy' }
  ]
};
