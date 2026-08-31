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
      name: 'Camp Operations Workspace',
      description: 'A shared command center for non-technical teams planning events, camps, and ministry operations.',
      ownerId: 'user-amy'
    }
  ],
  projects: [
    {
      id: 'project-summer-camp',
      workspaceId: 'workspace-camp',
      name: '2026 Summer Youth Camp',
      description: 'One camp is modeled as one Project. Each working group is a Team, and every concrete item is a Task.',
      ownerId: 'user-ben',
      startDate: '2026-07-20',
      dueDate: '2026-08-08',
      nextAction: 'Resolve projector availability and approve final check-in flow.',
      riskLevelManual: null,
      visibility: 'workspace'
    }
  ],
  teams: [
    { id: 'team-checkin', projectId: 'project-summer-camp', name: 'Check-in Team', leadId: 'user-amy', nextAction: 'Confirm station layout with venue staff.', visibility: 'project' },
    { id: 'team-admin', projectId: 'project-summer-camp', name: 'Administration Team', leadId: 'user-grace', nextAction: 'Confirm parent communication owner.', visibility: 'project' },
    { id: 'team-teaching', projectId: 'project-summer-camp', name: 'Teaching Team', leadId: 'user-chris', nextAction: 'Lock first-day handout content.', visibility: 'project' },
    { id: 'team-design', projectId: 'project-summer-camp', name: 'Design Team', leadId: 'user-dora', nextAction: 'Finalize signage style.', visibility: 'team' },
    { id: 'team-equipment', projectId: 'project-summer-camp', name: 'Equipment Team', leadId: 'user-evan', nextAction: 'Follow up with venue about projector model.', visibility: 'project' },
    { id: 'team-traffic', projectId: 'project-summer-camp', name: 'Traffic Team', leadId: 'user-fiona', nextAction: 'Confirm shuttle count after attendee list closes.', visibility: 'project' }
  ],
  milestones: [
    {
      id: 'milestone-final-check',
      projectId: 'project-summer-camp',
      name: 'Final readiness check',
      date: '2026-08-05',
      ownerId: 'user-ben',
      status: 'upcoming',
      critical: true,
      relatedTaskIds: ['task-handout-print', 'task-projector', 'task-shuttle-notice', 'task-name-tags']
    }
  ],
  tasks: [
    { id: 'task-checkin-flow', teamId: 'team-checkin', projectId: 'project-summer-camp', title: 'Design check-in flow', status: 'in-progress', ownerId: 'user-amy', assigneeId: 'user-amy', dueDate: '2026-07-30', weight: 2, nextAction: 'Confirm station layout', dependsOnTaskIds: [], blocked: false, visibility: 'workspace' },
    { id: 'task-attendee-list', teamId: 'team-checkin', projectId: 'project-summer-camp', title: 'Build attendee list', status: 'done', ownerId: 'user-ben', assigneeId: 'user-ben', dueDate: '2026-07-28', weight: 1, nextAction: 'Share final list', dependsOnTaskIds: [], blocked: false, visibility: 'project' },
    { id: 'task-name-tags', teamId: 'team-checkin', projectId: 'project-summer-camp', title: 'Prepare name tags', status: 'not-started', ownerId: 'user-amy', assigneeId: 'user-amy', dueDate: '2026-08-02', weight: 1, nextAction: 'Send badges to print', dependsOnTaskIds: ['task-attendee-list'], blocked: false, visibility: 'team' },

    { id: 'task-day-one-handout', teamId: 'team-teaching', projectId: 'project-summer-camp', title: 'Finish day-one handout', status: 'in-progress', ownerId: 'user-chris', assigneeId: 'user-chris', dueDate: '2026-07-31', weight: 3, nextAction: 'Confirm speaker edits', dependsOnTaskIds: [], blocked: false, visibility: 'team' },
    { id: 'task-handout-print', teamId: 'team-teaching', projectId: 'project-summer-camp', title: 'Print participant handbooks', status: 'blocked', ownerId: 'user-dora', assigneeId: 'user-dora', dueDate: '2026-08-04', weight: 2, nextAction: 'Wait for handout final copy', dependsOnTaskIds: ['task-day-one-handout'], blocked: true, blockedReason: 'Waiting for final day-one handout.', visibility: 'assigned' },
    { id: 'task-discussion-questions', teamId: 'team-teaching', projectId: 'project-summer-camp', title: 'Prepare discussion questions', status: 'not-started', ownerId: 'user-chris', assigneeId: 'user-chris', dueDate: '2026-08-03', weight: 2, nextAction: 'Send draft to group leaders', dependsOnTaskIds: [], blocked: false, visibility: 'private' },

    { id: 'task-design-banner', teamId: 'team-design', projectId: 'project-summer-camp', title: 'Design welcome banner', status: 'not-started', ownerId: 'user-dora', assigneeId: 'user-dora', dueDate: '2026-08-03', weight: 2, nextAction: 'Confirm banner size', dependsOnTaskIds: [], blocked: false, visibility: 'team' },

    { id: 'task-sound-list', teamId: 'team-equipment', projectId: 'project-summer-camp', title: 'Confirm sound equipment list', status: 'done', ownerId: 'user-evan', assigneeId: 'user-evan', dueDate: '2026-07-29', weight: 2, nextAction: 'Archive equipment list', dependsOnTaskIds: [], blocked: false, visibility: 'project' },
    { id: 'task-projector', teamId: 'team-equipment', projectId: 'project-summer-camp', title: 'Borrow projector', status: 'blocked', ownerId: 'user-evan', assigneeId: 'user-evan', dueDate: '2026-08-01', weight: 1, nextAction: 'Ask venue for model number', dependsOnTaskIds: [], blocked: true, blockedReason: 'Venue has not confirmed projector availability.', visibility: 'workspace' },
    { id: 'task-cables', teamId: 'team-equipment', projectId: 'project-summer-camp', title: 'Prepare extension cords and microphones', status: 'not-started', ownerId: 'user-fiona', assigneeId: 'user-fiona', dueDate: '2026-08-05', weight: 1, nextAction: 'Check church storage', dependsOnTaskIds: ['task-projector'], blocked: false, visibility: 'assigned' },

    { id: 'task-shuttle-count', teamId: 'team-traffic', projectId: 'project-summer-camp', title: 'Confirm shuttle count', status: 'in-progress', ownerId: 'user-fiona', assigneeId: 'user-fiona', dueDate: '2026-07-30', weight: 3, nextAction: 'Confirm attendee number', dependsOnTaskIds: ['task-attendee-list'], blocked: false, visibility: 'team' },
    { id: 'task-shuttle-notice', teamId: 'team-traffic', projectId: 'project-summer-camp', title: 'Create shuttle notice', status: 'not-started', ownerId: 'user-amy', assigneeId: 'user-amy', dueDate: '2026-08-02', weight: 2, nextAction: 'Draft parent message', dependsOnTaskIds: ['task-shuttle-count'], blocked: false, visibility: 'project' },
    { id: 'task-driver-sheet', teamId: 'team-traffic', projectId: 'project-summer-camp', title: 'Build driver contact sheet', status: 'not-started', ownerId: 'user-ben', assigneeId: 'user-ben', dueDate: null, weight: 1, nextAction: 'Collect phone numbers', dependsOnTaskIds: [], blocked: false, visibility: 'workspace' }
  ],
  externalLinks: [
    { id: 'link-venue-map', projectId: 'project-summer-camp', teamId: 'team-checkin', taskId: 'task-checkin-flow', title: 'Venue map', type: 'Google Drive', url: 'https://drive.google.com/example/venue-map', note: 'Used by check-in and traffic teams.', createdBy: 'user-amy', createdAt: '2026-07-24', visibility: 'project' },
    { id: 'link-private-speaker-notes', projectId: 'project-summer-camp', teamId: 'team-teaching', taskId: 'task-discussion-questions', title: 'Private speaker notes', type: 'Google Drive', url: 'https://drive.google.com/example/speaker-notes', note: 'Visible to the task owner only in mock mode.', createdBy: 'user-chris', createdAt: '2026-07-25', visibility: 'private' }
  ],
  activity: [
    { id: 'act-1', projectId: 'project-summer-camp', type: 'status_change', text: 'Equipment Team marked Borrow projector as blocked.', createdAt: '2026-07-25T09:30:00', actorId: 'user-evan' },
    { id: 'act-2', projectId: 'project-summer-camp', type: 'assignment', text: 'Amy assigned Create shuttle notice to herself.', createdAt: '2026-07-25T10:20:00', actorId: 'user-amy' },
    { id: 'act-3', projectId: 'project-summer-camp', type: 'external_link', text: 'Venue map external link was added.', createdAt: '2026-07-25T11:10:00', actorId: 'user-amy' }
  ]
};
