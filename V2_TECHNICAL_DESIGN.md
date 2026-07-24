# Dashboard V2 Technical Design

## 1. 技術方向

Dashboard V2 建議採用漸進式升級策略。短期維持現有 HTML、CSS、Vanilla JavaScript 的可運作狀態，中期導入 Supabase Auth、PostgreSQL、Row Level Security、Storage 與雲端同步，長期再評估是否需要前端框架。

本文件是技術設計，不代表本階段要實作資料庫、登入、Supabase 或前端重構。

## 2. 建議架構

```text
Browser UI
  Existing HTML / CSS / Vanilla JS
    Data Adapter
      LocalStorage Adapter
      Supabase Adapter
        Supabase Auth
        Supabase PostgreSQL
        Supabase RLS
        External Link Metadata
```

核心原則：

- UI 不直接綁死資料來源。
- V1 localStorage 可保留為 fallback。
- V2 Supabase 可透過 adapter 導入。
- 權限判斷以資料庫 RLS 為最終防線。
- 第一階段可先用 mock users 和 mock roles 進行單機多人模擬，在本機測試。
- 未來接入 Supabase 時，保留既有資料模型與前端流程。
- 多租戶 SaaS 階段必須依 `workspace_id` 隔離資料，Workspace 作為租戶隔離基礎。
- 前端只做體驗層的顯示與互動限制，不能取代後端權限。

## 3. 資料表總覽

建議資料表：

- `profiles`
- `workspaces`
- `workspace_members`
- `projects`
- `project_members`
- `teams`
- `team_members`
- `tasks`
- `task_dependencies`
- `events`
- `invitations`
- `activity_logs`
- `external_links`

## 4. Entity Relationship

```text
profiles
  1 -> many workspace_members
  1 -> many project_members
  1 -> many team_members
  1 -> many tasks.created_by
  1 -> many tasks.assignee_id

workspaces
  1 -> many workspace_members
  1 -> many projects
  1 -> many teams
  1 -> many tasks
  1 -> many invitations
  1 -> many external_links

projects
  many -> 1 workspaces
  1 -> many project_members
  1 -> many teams
  1 -> many tasks

teams
  many -> 1 workspaces
  many -> 1 projects, optional
  1 -> many team_members
  1 -> many tasks

tasks
  many -> 1 workspaces
  many -> 1 projects, optional
  many -> 1 teams, optional
  many -> 1 profiles, assignee
  many -> 1 tasks, parent task

external_links
  many -> 1 workspaces
  many -> 1 projects, optional
  many -> 1 teams, optional
  many -> 1 tasks, optional
  many -> 1 profiles, created_by
```

## 5. 資料表設計

### profiles

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | 對應 Supabase auth user id |
| email | text | 使用者 Email |
| display_name | text | 顯示名稱 |
| avatar_url | text | 頭像 |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### workspaces

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Workspace ID |
| name | text | 名稱 |
| slug | text, unique | URL 或識別用 slug |
| description | text | 描述 |
| owner_id | uuid, FK profiles.id | 擁有者 |
| status | text | active / archived |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### workspace_members

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Membership ID |
| workspace_id | uuid, FK workspaces.id | Workspace |
| user_id | uuid, FK profiles.id | 成員 |
| role | text | owner / admin / member / viewer |
| status | text | active / invited / removed |
| joined_at | timestamptz | 加入時間 |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### projects

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Project ID |
| workspace_id | uuid, FK workspaces.id | 所屬 Workspace |
| name | text | Project 名稱 |
| description | text | Project 描述 |
| status | text | active / paused / completed / archived |
| manager_id | uuid, FK profiles.id | Project Manager |
| visibility | text | private / project / workspace |
| start_date | date | 開始日 |
| due_date | date | 截止日 |
| created_by | uuid, FK profiles.id | 建立者 |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### project_members

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Membership ID |
| project_id | uuid, FK projects.id | Project |
| user_id | uuid, FK profiles.id | 成員 |
| role | text | manager / member / viewer |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### teams

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Team ID |
| workspace_id | uuid, FK workspaces.id | Workspace |
| project_id | uuid, FK projects.id, nullable | 可選 Project |
| name | text | Team 名稱 |
| description | text | Team 描述 |
| lead_id | uuid, FK profiles.id, nullable | Team Lead |
| status | text | active / archived |
| created_by | uuid, FK profiles.id | 建立者 |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### team_members

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Membership ID |
| team_id | uuid, FK teams.id | Team |
| user_id | uuid, FK profiles.id | 成員 |
| role | text | lead / member / viewer |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### tasks

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Task ID |
| workspace_id | uuid, FK workspaces.id | Workspace |
| project_id | uuid, FK projects.id, nullable | Project |
| team_id | uuid, FK teams.id, nullable | Team |
| parent_task_id | uuid, FK tasks.id, nullable | 父任務 |
| title | text | 任務標題 |
| description | text | 任務描述 |
| status | text | backlog / not_started / in_progress / blocked / review / done / archived |
| priority | text | low / medium / high / urgent |
| assignee_id | uuid, FK profiles.id, nullable | 負責人 |
| created_by | uuid, FK profiles.id | 建立者 |
| due_date | date | 截止日 |
| start_date | date | 開始日 |
| completed_at | timestamptz | 完成時間 |
| visibility | text | private / assigned / team / project / workspace |
| weight | integer | 進度權重，預設 1 |
| sort_order | integer | 排序 |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### task_dependencies

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Dependency ID |
| task_id | uuid, FK tasks.id | 被阻擋或依賴方 |
| depends_on_task_id | uuid, FK tasks.id | 依賴任務 |
| created_at | timestamptz | 建立時間 |

### events

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Event ID |
| workspace_id | uuid, FK workspaces.id | Workspace |
| project_id | uuid, FK projects.id, nullable | Project |
| team_id | uuid, FK teams.id, nullable | Team |
| task_id | uuid, FK tasks.id, nullable | Task |
| type | text | due_date / milestone / reminder |
| title | text | 標題 |
| starts_at | timestamptz | 開始時間 |
| ends_at | timestamptz | 結束時間 |
| created_by | uuid, FK profiles.id | 建立者 |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### invitations

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Invitation ID |
| workspace_id | uuid, FK workspaces.id | Workspace |
| project_id | uuid, FK projects.id, nullable | Project |
| team_id | uuid, FK teams.id, nullable | Team |
| email | text | 受邀 Email |
| role | text | 指派角色 |
| token | text | 邀請 token |
| status | text | pending / accepted / expired / revoked |
| invited_by | uuid, FK profiles.id | 邀請者 |
| expires_at | timestamptz | 到期時間 |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

### activity_logs

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | Log ID |
| workspace_id | uuid, FK workspaces.id | Workspace |
| actor_id | uuid, FK profiles.id | 操作者 |
| entity_type | text | workspace / project / team / task / invitation |
| entity_id | uuid | 目標 entity |
| action | text | create / update / delete / invite / assign / status_change |
| before_data | jsonb | 變更前資料 |
| after_data | jsonb | 變更後資料 |
| created_at | timestamptz | 建立時間 |

### external_links

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | uuid, PK | External link ID |
| workspace_id | uuid, FK workspaces.id | Workspace |
| project_id | uuid, FK projects.id, nullable | Project |
| team_id | uuid, FK teams.id, nullable | Team |
| task_id | uuid, FK tasks.id, nullable | Task |
| event_id | uuid, FK events.id, nullable | Event |
| url | text | 外部連結 URL |
| title | text | 連結名稱 |
| file_type | text | drive / document / image / video / url / other |
| description | text | 說明 |
| visibility | text | private / assigned / team / project / workspace |
| created_by | uuid, FK profiles.id | 建立者 |
| created_at | timestamptz | 建立時間 |
| updated_at | timestamptz | 更新時間 |

## 6. Index 建議

建議索引：

- `workspace_members(workspace_id, user_id)`
- `project_members(project_id, user_id)`
- `team_members(team_id, user_id)`
- `projects(workspace_id)`
- `teams(workspace_id)`
- `teams(project_id)`
- `tasks(workspace_id)`
- `tasks(project_id)`
- `tasks(team_id)`
- `tasks(assignee_id)`
- `tasks(status)`
- `tasks(due_date)`
- `activity_logs(workspace_id, created_at)`
- `invitations(email, status)`
- `external_links(workspace_id)`
- `external_links(project_id)`
- `external_links(team_id)`
- `external_links(task_id)`

## 7. Row Level Security 原則

RLS 是 V2 的必要安全層。前端不能只靠隱藏按鈕保護資料。

### 基本規則

- 使用者只能讀取自己所屬 Workspace 的資料。
- Workspace Owner / Admin 可管理 Workspace 內多數資料。
- Project Manager 可管理自己負責的 Project。
- Team Lead 可管理自己負責 Team 的任務與成員。
- Member 可建立任務，並修改自己建立或被指派的任務。
- Viewer 只能讀取授權範圍內資料。
- Private 任務只允許建立者、被指派者或管理者讀取。
- Assigned 任務只允許被指派者與管理者讀取。
- Team 任務只允許 Team 成員與上層管理者讀取。
- Project 任務只允許 Project 成員與上層管理者讀取。
- Workspace 任務允許 Workspace 成員讀取。

## 8. RLS Helper Function 建議

為避免每個 policy 重複複雜邏輯，建議建立 helper function：

- `is_workspace_member(workspace_id uuid)`
- `is_workspace_admin(workspace_id uuid)`
- `is_workspace_owner(workspace_id uuid)`
- `is_project_member(project_id uuid)`
- `is_project_manager(project_id uuid)`
- `is_team_member(team_id uuid)`
- `is_team_lead(team_id uuid)`
- `can_read_task(task_id uuid)`
- `can_update_task(task_id uuid)`

## 9. Dashboard 查詢模型

Dashboard 卡片查詢結果必須能直接提供以下欄位，避免前端用不一致的近似詞彙自行推導：

- 專案名稱：`projects.name`
- 組別名稱：`teams.name`
- 進度百分比：由完成任務權重或完成任務數計算
- 已完成任務數 / 總任務數：`completed_task_count` / `total_task_count`
- 下一步：下一個未完成、未封鎖且最接近截止日的 Task，或任務 metadata 中的 next action
- 風險狀態：由 blocked、overdue、高優先級任務與依賴阻塞計算
- 負責人：Project Manager、Team Lead 或 Task assignee
- 截止日期：Project、Team 或 Task 的 `due_date`

營隊使用情境的查詢模型：營隊是一個 Project；報到組、教材組、美術組、器材組、行政組、交通組等是 Team；各組具體工作是 Task。不得把每個組別建成獨立 Project，否則跨組 Dashboard 與 Project 進度會失真。


Dashboard 不一定要一開始建立 materialized view。MVP 可先由查詢組合而成，資料量變大後再優化。

需要計算：

- Workspace task total
- Workspace task completed
- Workspace overdue count
- Workspace blocked count
- Project progress
- Team progress
- Assignee workload
- Next action
- Recently updated tasks

進度計算：

```text
task_progress = done_subtasks / all_subtasks
group_progress = sum(done_task_weight) / sum(all_task_weight)
```

## 10. Data Adapter 設計

前端應逐步抽出資料存取層：

```text
TaskRepository
  listTasks(scope)
  createTask(input)
  updateTask(id, patch)
  deleteTask(id)
  importLocalTasks(input)

WorkspaceRepository
  listWorkspaces()
  createWorkspace(input)
  updateWorkspace(id, patch)

MembershipRepository
  inviteMember(input)
  acceptInvitation(token)
```

V1 可先由 `LocalStorageTaskRepository` 實作，V2 再新增 `SupabaseTaskRepository`。第一階段可先使用 `MockUserRepository`、`MockRoleRepository`、mock users 和 mock roles 在本機驗證多人流程、角色權限與 visibility。未來接入 Supabase 時，保留既有資料模型與前端流程，只替換 adapter、auth provider 與雲端儲存。

## 11. V1 localStorage Migration

遷移器建議責任：

- 偵測 V1 key。
- 驗證 JSON 格式。
- 對應 V1 任務欄位到 V2 `tasks`。
- 產生預覽，不直接寫入。
- 支援 dry run。
- 匯入後寫入 `activity_logs`。
- 不自動刪除 V1 localStorage。

欄位對應範例：

| V1 | V2 |
| --- | --- |
| title | tasks.title |
| description | tasks.description |
| status | tasks.status |
| priority | tasks.priority |
| dueDate | tasks.due_date |
| completedAt | tasks.completed_at |
| nextAction | tasks.description 或 metadata |

## 12. Audit Log

下列事件應寫入 `activity_logs`：

- Workspace 建立、修改、刪除
- Project 建立、修改、刪除
- Team 建立、修改、刪除
- 成員邀請、加入、移除、角色變更
- Task 建立、修改、刪除
- Task 狀態變更
- Task 負責人變更
- Task 截止日變更
- V1 資料匯入

## 13. External Link Attachments

V2 第一階段不提供大量圖片、影片或大型附件直接上傳到系統，也不以 Supabase Storage 作為 MVP 附件功能。第一階段採用外部連結模式，系統只保存外部檔案或媒體的 URL 與 metadata。

允許的連結來源範例：

- Google Drive
- OneDrive
- Dropbox
- YouTube
- Vimeo
- 其他 HTTPS 網址

系統不得把本機路徑視為多人可共享附件，例如：

```text
C:\Users\...
file:///...
/Users/...
```

連結驗證規則：

- MVP 僅接受 `https://` URL。
- 可選擇允許 `http://localhost` 或 `http://127.0.0.1` 作為本機測試資料，但不得用於正式多人協作。
- 不接受 `file://`。
- 不接受 Windows 或 macOS / Unix 本機絕對路徑。
- 前端應提示外部檔案權限由原始雲端服務控制。

外部連結的讀取權限應跟隨 `visibility` 與所屬 Workspace / Project / Team / Task 的權限規則。

Supabase Storage 僅作為未來 SaaS 付費版本評估項目，可能包含：

- 系統內建檔案上傳
- 工作區容量限制
- 訂閱方案儲存配額
- 單檔大小限制
- 圖片壓縮
- 影片轉碼
- 防毒掃描
- 檔案版本管理
- 自動備份
- 儲存用量計費

## 14. 環境變數

若導入 Supabase，前端需要：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

管理端或 migration script 可能需要：

- `SUPABASE_SERVICE_ROLE_KEY`

Service role key 不可放在前端。

## 15. 風險

- RLS 設計錯誤會造成資料外洩。
- 前端若直接混用 localStorage 與 Supabase，資料一致性會變差。
- 角色與 scope 若太早做太複雜，MVP 會拖慢。
- V1 migration 若沒有 preview，可能造成使用者誤匯入。
- SaaS 化前若資料表沒有 `workspace_id`，後續重構成本會很高。

## 16. MVP 技術建議

一致性要求：三份 V2 文件使用相同角色名稱：Workspace Owner、Workspace Admin、Project Manager、Team Lead、Member、Viewer；相同任務狀態：Backlog、Not Started、In Progress、Blocked、Review、Done、Archived；相同 visibility 層級：Private、Assigned Users、Team、Project、Workspace；相同附件策略：第一階段只保存外部連結 metadata，不使用本機檔案路徑共享；相同升級方向：V1 localStorage migration 先 preview / dry run，再接 Supabase Auth、PostgreSQL 與 RLS。


第一個可交付版本建議只做：

- Auth：Email / Google
- Workspace：建立與加入
- Project：建立與管理
- Task：CRUD、狀態、指派、截止日
- Membership：Workspace / Project 基本角色
- Dashboard：Workspace、Project、Member 三種
- Migration：V1 localStorage preview + import

Team、Storage、完整通知與進階權限可放到後續 Phase。
