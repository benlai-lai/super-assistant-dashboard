# V2 Feature Backlog

## 1. 產品定位

本產品是給非技術團隊使用的視覺化協作 Dashboard，適合營隊、活動、教會、社團、非營利組織與小型團隊。

它不是給專業 PM 或工程團隊使用的重型專案管理系統。第一階段的重點，是讓一個團隊可以快速建立 Workspace、Project、Team 與 Task，並用 Dashboard 看懂現在進度、誰負責、哪裡卡住、下一步要做什麼。

核心價值：

- 建立容易：使用者不需要理解複雜設定，就能建立一個專案與組別。
- 組別責任清楚：每個 Team 有 owner / lead，每個 Task 有 owner。
- 進度自動計算：由任務完成數、權重與 blocked 狀態推導 Dashboard 進度。
- 一眼看見風險：Dashboard 主動標示 overdue、blocked、no next action、低於預期進度。
- 清楚顯示下一步：每個 Project、Team、Task 都應有 Next Action。
- 不需要理解複雜專案管理術語：介面文字應偏向「下一步」「誰負責」「何時完成」「卡在哪裡」。

## 2. 核心產品原則

### Action Dashboard

Dashboard 不只是呈現資料，也要引導下一步行動。每個主要 Dashboard 區塊都應回答三個問題：

- 現在狀況如何？
- 哪裡需要注意？
- 下一步誰要做什麼？

### Progressive Disclosure

預設畫面只顯示最重要資訊。使用者需要時才逐層展開 Workspace、Project、Team、Task。

初始畫面不得塞入所有任務與欄位。第一層應以摘要卡片、風險提示、Next Action、逾期與即將到期事項為主。詳細任務欄位、活動紀錄、相依關係與工作量細節，應在展開或進入細節頁後顯示。

### 保守 MVP

若功能範圍與既有規格有衝突，第一階段以較保守的 MVP 範圍為準：

- 先使用本機 mock users / mock roles 驗證多人資料模型。
- 先使用外部連結附件，不做系統內建大型檔案上傳。
- 先建立 Dashboard 與資料規則，不急著導入完整 Supabase、RLS、通知與 SaaS billing。

## 3. 功能優先級

| 優先級 | 定義 | 目標 |
| --- | --- | --- |
| MVP / Phase 1 | 第一個可驗證版本 | 用本機多人模擬驗證 Workspace / Project / Team / Task Dashboard、Health、Risk、Blocked、My Tasks。 |
| Phase 2 | 協作效率增強 | 加入 saved views、通知中心、表單轉任務、留言、提及、報表與基本 timeline。 |
| Phase 3 | 進階平台能力 | 加入 widgets、自動化、AI summary、進階報表、完整 Gantt、系統管理儲存與 SaaS 管理。 |
| Not Planned Now | 現階段不做 | 避免重型企業系統、聊天、視訊、複雜 OKR、大型儲存與過度自由的 builder。 |

## 4. MVP / Phase 1

MVP / Phase 1 功能：

- Workspace Dashboard
- Project Dashboard
- Team Dashboard
- My Tasks
- 自動進度計算
- Project Health
- Risk Status
- Due Date
- Owner
- Next Action
- 已完成任務數 / 總任務數
- 逾期任務
- 即將到期任務
- Blocked Tasks
- Task Dependencies
- Team Progress
- 基本篩選
- 只看我的任務
- 里程碑清單
- 最近活動
- 簡化工作量
- Team Dashboard 精簡任務管理：查看任務、建立任務、指派成員、修改狀態、修改截止日
- 外部連結附件基本新增與顯示 UI
- 單機多人模擬
- mock users
- mock roles

Phase 1 的資料來源可以是本機 mock data，但資料模型必須保留 `workspace_id`、`project_id`、`team_id`、`user_id`、`created_by`、`assignee_id`、`role`、`visibility`、`created_at`、`updated_at`。

Phase 1 不包含 comments、mentions、系統內建檔案上傳、內建儲存、轉檔、大型檔案預覽處理或模板選擇系統。營隊情境只提供 seed / mock camp project data，作為展示、測試與驗收資料。

## 5. Phase 2

Phase 2 目標是提升日常協作效率，但仍不進入重型企業級管理。

功能包含：

- Saved Views：使用者可保存常用篩選條件，例如「本週到期」「我的 blocked tasks」。
- Notification Center：集中顯示任務指派、逾期、提及與權限變更。
- Forms to Tasks：用簡單表單收集需求並轉成 Task。
- Timeline：以時間軸顯示里程碑與任務到期日。
- 基本 Gantt：只顯示 Project / Team / milestone / task date，不做完整排程引擎。
- Workload Enhancement：加入更多工作量統計，例如 by week、by owner、by team。
- Comments：任務留言，Phase 2 才實作；Phase 1 只預留 activity event 與資料模型擴充點。
- Mentions：留言中提及成員，Phase 2 才實作；Phase 1 不提供 mentions UI。
- Activity Filters：依事件類型、成員、日期篩選 activity feed。
- Report Export：匯出 Project / Team summary。
- Project Templates：常用活動、營隊、社團專案模板。營隊模板留到 Phase 2；Phase 1 只提供 seed / mock camp project data。
- 自訂 Dashboard 區塊顯示順序：只允許排序與顯示/隱藏區塊，不做自由拖拉 builder。

## 6. Phase 3

Phase 3 是進階平台能力，需在 Phase 1 / Phase 2 穩定後再評估。

功能包含：

- Dashboard Widgets
- Automation Builder
- AI Summary
- Advanced Reports
- Budget Tracking
- Time Tracking
- Full Gantt
- Mobile App
- System-managed Storage
- 多租戶 SaaS 管理功能

Phase 3 的 System-managed Storage 才評估系統內建上傳、容量限制、檔案版本、壓縮、轉碼、防毒掃描與計費。Phase 1 不做。

## 7. 現階段不開發

現階段不開發：

- 完整聊天系統
- 視訊會議
- 內建大型檔案儲存
- 複雜 OKR
- 大量第三方整合
- 高自由度拖曳 Dashboard Builder
- 完整企業級資源管理

原因：這些功能會大幅增加資料模型、權限、通知、儲存、同步與 UI 複雜度，容易讓 MVP 偏離「非技術團隊快速看懂進度與下一步」的核心價值。

## 8. Dashboard 類型

### Workspace Dashboard

| 項目 | 定義 |
| --- | --- |
| 目的 | 顯示整個 Workspace 的專案總覽、風險、逾期、近期活動與下一步。 |
| 主要使用者 | Workspace Owner、Workspace Admin、Viewer。 |
| 顯示資料 | Project cards、Workspace progress、high risk projects、overdue tasks、blocked tasks、recent activity、team workload summary。 |
| 可執行操作 | 建立 Project、查看 Project、篩選 Health / Risk、進入 Team / Task、查看活動紀錄。 |
| 權限 | Owner / Admin 可建立與管理；Viewer 只讀；Member 只看授權範圍。 |
| 空白狀態 | 顯示「尚未建立 Project」，提供建立第一個 Project 的動作。 |
| 錯誤狀態 | 無法載入資料時，顯示重試與本機資料狀態，不顯示空白假資料。 |
| 未來擴充 | Saved views、Workspace report、billing / SaaS admin、跨 Project workload。 |

### Project Dashboard

| 項目 | 定義 |
| --- | --- |
| 目的 | 顯示單一 Project 的進度、Team 分工、風險、里程碑與下一步。 |
| 主要使用者 | Project Manager、Workspace Admin、Team Lead、Project Member、Viewer。 |
| 顯示資料 | Project health、progress、Team cards、milestones、blocked tasks、overdue tasks、next action、recent activity。 |
| 可執行操作 | 建立 Team、建立 Task、更新 Next Action、查看 blocked tasks、調整 owner、進入 Team Dashboard。 |
| 權限 | PM / Admin 可管理 Project；Team Lead 可管理所屬 Team；Member 可管理自己建立或被指派任務；Viewer 只讀。 |
| 空白狀態 | 顯示「此 Project 尚未建立 Team 或 Task」，引導建立 Team 或使用模板。 |
| 錯誤狀態 | 若進度計算失敗，顯示資料不完整原因，例如缺少 due date 或任務狀態。 |
| 未來擴充 | Timeline、基本 Gantt、Project templates、Report export。 |

### Team Dashboard

| 項目 | 定義 |
| --- | --- |
| 目的 | 顯示單一 Team 的任務、負責人、進度、工作量與卡關狀態。 |
| 主要使用者 | Team Lead、Team Member、Project Manager。 |
| 顯示資料 | Team progress、task list summary、owner workload、blocked tasks、due soon tasks、next action、activity。 |
| 可執行操作 | Phase 1 提供完整但精簡的任務管理：查看任務、建立 Task、指派 owner / member、修改 Task status、修改 due date、設定 dependency、更新 blocked reason。Phase 1 不包含 comments 與 mentions。 |
| 權限 | Team Lead 可管理 Team 任務；Member 可更新自己有權限的任務；PM / Admin 可查看與介入。 |
| 空白狀態 | 顯示「此 Team 尚未有任務」，引導新增第一個任務。 |
| 錯誤狀態 | 若 Team 不屬於目前 Project 或權限不足，顯示不可查看原因。 |
| 未來擴充 | Team saved view、Team comments、mentions、Team workload trend。 |

### My Tasks Dashboard

| 項目 | 定義 |
| --- | --- |
| 目的 | 幫使用者快速看到自己今天、本週、逾期與 blocked 的任務。 |
| 主要使用者 | 所有登入或 mock user。 |
| 顯示資料 | Assigned tasks、created by me、due soon、overdue、blocked、next action、related Project / Team。 |
| 可執行操作 | 更新任務狀態、標記完成、更新 Next Action、查看前置任務、篩選 My Tasks。 |
| 權限 | 使用者只看到自己可見或被指派的任務；Viewer 只讀。 |
| 空白狀態 | 顯示「目前沒有指派給你的任務」。 |
| 錯誤狀態 | 若 mock user 未選擇，提示先選擇測試使用者。 |
| 未來擴充 | 個人提醒、通知中心、週報匯出。 |

## 9. Dashboard 卡片規格

每張 Dashboard 卡片至少包含：

| 欄位 | 說明 |
| --- | --- |
| Workspace | 所屬 Workspace 名稱。 |
| Project Name | 所屬 Project 名稱。 |
| Team Name | 所屬 Team 名稱，Project card 可顯示主要 Team 摘要。 |
| Progress % | 由完成任務數或權重計算。 |
| Completed Tasks / Total Tasks | 顯示已完成任務數與總任務數。 |
| Progress Source | 顯示 progress 來源，例如 task count、weighted tasks、subtasks。 |
| Owner | Project Manager、Team Lead 或 Task assignee。 |
| Next Action | 下一個應執行行動。 |
| Risk | Low / Medium / High / Critical。 |
| Health | Healthy / Attention / High Risk / Delayed。 |
| Due Date | 截止日期。 |
| Blocked Count | blocked tasks 數量。 |
| Last Updated | 最近更新時間。 |

必須永遠顯示：

- Project Name 或 Team Name
- Progress %
- Completed Tasks / Total Tasks
- Health
- Risk
- Next Action
- Owner
- Due Date

可收合：

- Workspace
- Progress Source
- Blocked Count 明細
- Last Updated
- Team list
- Activity preview

依權限隱藏：

- Private task 數量與內容：只對建立者、被指派者、管理者顯示。
- Assigned task 明細：只對被指派者與管理者顯示。
- 成員工作量：Viewer 可看摘要，不能看私人任務內容。
- 權限與成員管理操作：只給 Owner / Admin / PM / Team Lead 的授權範圍。

手機版顯示優先順序：

1. Project / Team 名稱
2. Health + Risk
3. Progress %
4. Next Action
5. Due Date
6. Owner
7. Completed / Total
8. Blocked Count
9. Last Updated
10. Progress Source

## 10. Project Health 計算規則

Health 描述 Project 是否按計畫前進，重點是「目前整體狀態」。

判定順序採由嚴重到輕微，符合較嚴重條件即停止：

### Delayed

符合任一條件：

- Project due date 已過，且 progress < 100%。
- overdue tasks / total open tasks >= 25%。
- 有 critical blocking task，且已 blocked 超過 3 天。
- 距 due date <= 2 天，且 progress < 70%。

### High Risk

符合任一條件：

- overdue tasks / total open tasks >= 10%。
- blocked tasks >= 3，或 blocked tasks / total open tasks >= 15%。
- 距 due date <= 7 天，且 progress < expected progress - 20%。
- Project 沒有 Next Action，且超過 3 天未更新。
- 任一關鍵里程碑 delayed。

### Attention

符合任一條件：

- 有 1 個以上 overdue task。
- 有 1 個以上 blocked task。
- 距 due date <= 14 天，且 progress < expected progress - 10%。
- 沒有 Next Action。
- 超過 7 天沒有更新。

### Healthy

必須全部符合：

- 沒有 overdue task。
- 沒有 unresolved blocked task。
- 有 Next Action。
- progress >= expected progress - 10%。
- 最近 7 天內有更新，或 Project 尚未進入 active period。

Expected progress 第一階段使用線性時間估算：

```text
expected_progress = elapsed_days / total_project_days * 100
elapsed_days = today - start_date
total_project_days = due_date - start_date
```

日期處理規則：

- 未設定 `start_date` 或 `due_date`：不啟用 expected progress，Health 只使用 overdue、blocked、Next Action、last updated 與 milestone 狀態判定，並在 UI 顯示「缺少日期，無法估算預期進度」。
- 尚未開始：若 today < start_date，expected_progress = 0；Project 不會因 progress 低於預期而被標成 Attention / High Risk，但仍會受 blocked、overdue、no next action 影響。
- 進行中：若 start_date <= today <= due_date，使用線性 expected_progress。
- 已超過截止日：若 today > due_date 且 progress < 100%，Health = Delayed；若 progress = 100%，Health 可依其他條件判定為 Healthy 或 Attention。
- total_project_days <= 0：視為日期設定錯誤，Health 顯示資料錯誤狀態，不執行 expected progress 計算。

## 11. Risk 規則

Risk 描述「可能造成失敗或延誤的風險程度」，重點是「問題嚴重度與處理急迫性」。Health 是整體狀態；Risk 是風險訊號。Project 可以是 Attention 但 Risk High，例如進度尚可但關鍵前置任務卡住。

Risk 同時支援三個資料欄位：

- `risk_level_manual`：使用者手動指定的風險等級，可為 Low / Medium / High / Critical / null。
- `risk_level_computed`：系統依規則計算的風險等級。
- `risk_reason`：風險原因。若有 manual 值，保存使用者輸入原因；若沒有 manual 值，保存 computed reason。

顯示規則：

- 有 `risk_level_manual` 時，以 manual 為主顯示。
- 沒有 `risk_level_manual` 時，使用 `risk_level_computed`。
- 即使有 manual 值，也保留 computed reason，讓使用者理解系統原本判斷。
- 若 manual 與 computed 差異很大，例如 manual = Low 但 computed = Critical，UI 應顯示提示，而不是直接覆蓋使用者設定。

### Critical

- 關鍵里程碑已逾期。
- critical / high priority task blocked 且影響多個 Team。
- Project due date 已過且仍未完成。
- 循環相依或資料錯誤導致 dependency 無法計算。

### High

- 有多個 blocked tasks。
- 逾期比例 >= 10%。
- 距截止日 <= 7 天且 progress 明顯低於預期。
- 沒有 owner 或沒有 next action 的高優先任務。

### Medium

- 有 1 個 overdue task。
- 有 1 個 blocked task。
- 本週到期任務集中在同一 owner，工作量 Overloaded。
- 超過 7 天未更新。

### Low

- 沒有 overdue。
- 沒有 blocked。
- 有 owner 與 next action。
- 進度接近預期。

## 12. Task Dependencies

Task dependency 欄位：

- `depends_on_task_ids`：目前任務依賴哪些前置任務。
- `blocked`：是否被阻塞。
- `blocked_reason`：阻塞原因，必填於 `blocked = true`。
- `blocking_task_ids`：目前任務正在阻塞哪些後續任務，可由 dependency 反推或快取。

前置任務完成後解除阻塞：

1. 任務狀態變為 Done。
2. 系統找出所有依賴此任務的後續任務。
3. 檢查後續任務的 `depends_on_task_ids` 是否全部完成。
4. 若全部完成，將後續任務的 `blocked` 設為 false，並清空或保留歷史 `blocked_reason`。
5. Activity Feed 記錄「dependency resolved」。

Dashboard 顯示阻塞：

- Project / Team card 顯示 `Blocked Count`。
- Blocked task 顯示 blocking task 名稱、owner、due date。
- 若 blocked task 影響 critical milestone，Project Risk 至少為 High。
- My Tasks 中 blocked task 不應被隱藏，應清楚顯示「等待誰完成什麼」。

避免循環相依：

- 新增 dependency 前，檢查是否會形成 A -> B -> A。
- 使用 DFS 或 graph traversal 檢查目標任務是否已間接依賴目前任務。
- 若形成循環，拒絕儲存並顯示錯誤：「這個相依關係會造成循環，請改用單向前置任務。」

## 13. Workload 簡化模型

第一階段資料層沿用數字 `weight`，UI 顯示 Small / Medium / Large：

- Small = `weight: 1`
- Medium = `weight: 2`
- Large = `weight: 3`

進度與工作量計算都使用 `weight`。UI 只把數字轉成使用者容易理解的尺寸文字。

顯示欄位：

- 未完成任務數
- 本週到期任務數
- 逾期任務數
- 工作量點數
- Low / Normal / Overloaded

第一階段門檻：

| 狀態 | 條件 |
| --- | --- |
| Low | open task points <= 3，且本週到期 <= 1，且 overdue = 0。 |
| Normal | open task points 4-8，或本週到期 2-4，且 overdue <= 1。 |
| Overloaded | open task points >= 9，或本週到期 >= 5，或 overdue >= 2。 |

若任務沒有 `weight`，預設 `weight = 2`，UI 顯示 Medium。Viewer 可看 Team 層級總點數；只有 PM / Team Lead / Admin 可看成員級工作量明細。

## 14. Milestone

Milestone 欄位：

- 名稱
- 日期
- 狀態：upcoming / active / completed / delayed
- Owner
- 關聯任務
- 是否為關鍵里程碑

Milestone 規則：

- 若日期已過且狀態不是 completed，狀態為 delayed。
- 若關聯任務全部完成，可建議標記 completed。
- 若關鍵里程碑 delayed，Project Health 至少為 High Risk，Risk 至少為 High。

## 15. Activity Feed

Activity Feed 至少包含：

- 任務建立
- 任務指派
- 狀態變更
- 截止日變更
- 留言 event type，Phase 1 只預留，不實作 comments UI
- mention event type，Phase 1 只預留，不實作 mentions UI
- 外部連結附件新增
- 成員加入
- 權限變更

每筆 activity 應包含：

- actor
- action
- entity type
- entity name
- before / after summary
- timestamp
- workspace_id
- project_id / team_id / task_id where applicable

第一階段可使用 mock activity，不需要完整 audit screen。

### Phase 1 外部連結附件 UI

Phase 1 提供外部連結附件的基本新增與顯示 UI，欄位至少包含：

- `url`
- `title`
- `type`
- `note`
- `created_by`
- `created_at`

Phase 1 限制：

- 不包含檔案上傳。
- 不包含內建儲存。
- 不包含轉檔。
- 不包含大型預覽處理。
- `url` 預設只接受 HTTPS；本機路徑、`file://`、`C:\Users\...`、`/Users/...` 不可作為多人協作附件。

## 16. Filters

Filters 至少包含：

- Workspace
- Project
- Team
- Owner
- Status
- Risk
- Health
- Due Date
- Overdue
- Blocked
- My Tasks

基本規則：

- Dashboard 預設只顯示 active / relevant items。
- My Tasks filter 只顯示目前 mock user 可見且與自己相關的任務。
- Blocked filter 顯示 `blocked = true` 或依賴未完成的任務。
- Overdue filter 顯示 due date < today 且 status != Done / Archived。

## 17. 營隊使用情境

定義：

- Camp = Project
- 報到組、教材組、美術組、器材組、行政組、交通組、攝影組 = Team
- 每一項具體工作 = Task
- 不將每個組別建立為獨立 Project

Phase 1 只提供 seed / mock camp project data，供展示、測試與驗收，不建立模板選擇系統。營隊模板與模板選擇流程留到 Phase 2。

完整範例：

Project：2026 暑期青少年營隊

Workspace：教會活動籌備 Workspace

Teams：

### 報到組

- 設計報到流程，Owner：Amy，Size：Medium，Due：2026-07-30，Next Action：確認報到動線。
- 建立報到名單，Owner：Ben，Size：Small，Due：2026-07-28，Next Action：匯入報名資料。
- 準備名牌與分組貼紙，Owner：Amy，Size：Small，Due：2026-08-02，Next Action：送印名牌。

### 教材組

- 完成第一天課程講義，Owner：Chris，Size：Large，Due：2026-07-31，Next Action：確認講員版本。
- 印製學員手冊，Owner：Dora，Size：Medium，Due：2026-08-04，Depends on：完成第一天課程講義。
- 準備小組討論題目，Owner：Chris，Size：Medium，Due：2026-08-03，Next Action：交給小組長 review。

### 器材組

- 確認音響設備清單，Owner：Evan，Size：Medium，Due：2026-07-29，Next Action：向場地方確認設備。
- 借用投影機，Owner：Evan，Size：Small，Due：2026-08-01，Blocked：true，Blocked Reason：等待場地回覆設備型號。
- 準備延長線與麥克風，Owner：Fiona，Size：Small，Due：2026-08-05，Next Action：清點庫存。

### 交通組

- 確認接駁車數量，Owner：Gary，Size：Large，Due：2026-07-30，Next Action：確認報名人數。
- 製作交通通知，Owner：Helen，Size：Medium，Due：2026-08-02，Depends on：確認接駁車數量。
- 建立司機聯絡表，Owner：Gary，Size：Small，Due：2026-08-01，Next Action：整理電話名單。

Milestone：

- 名稱：營隊前一週總檢查
- 日期：2026-08-05
- 狀態：upcoming
- Owner：Project Manager
- 關聯任務：印製學員手冊、借用投影機、製作交通通知、準備名牌與分組貼紙
- 關鍵里程碑：Yes

Task Dependency：

- `印製學員手冊` depends on `完成第一天課程講義`。
- `製作交通通知` depends on `確認接駁車數量`。

Blocked Task：

- `借用投影機` blocked，原因是等待場地回覆設備型號。

Dashboard 顯示：

- Project Health：Attention，因為存在 blocked task。
- Risk：Medium；若投影機阻塞超過 3 天或影響關鍵里程碑，升為 High。
- Next Action：器材組 Owner 追蹤場地設備型號；教材組完成講義後解鎖手冊印製。
- Team Progress：各 Team 顯示 completed / total 與 blocked count。

## 18. 驗收標準

| MVP 功能 | User Story | Acceptance Criteria | Data Required | Permission Rule | Empty State | Error State |
| --- | --- | --- | --- | --- | --- | --- |
| Workspace Dashboard | 身為 Workspace Admin，我想看到所有 Project 的狀態，以便知道哪裡需要介入。 | 顯示 Project cards、overall progress、high risk、overdue、blocked、recent activity。 | workspaces、projects、tasks、activity_logs。 | Admin / Owner 全部可看；Viewer 只讀；Member 只看授權範圍。 | 尚無 Project 時引導建立 Project。 | 資料載入失敗時顯示重試。 |
| Project Dashboard | 身為 PM，我想看到 Project 進度與 Team 狀態，以便安排下一步。 | 顯示 Health、Risk、Team progress、milestones、blocked tasks、next action。 | projects、teams、tasks、milestones。 | PM / Admin 可管理；Member 依 scope 讀取。 | 尚無 Team / Task 時引導建立。 | 缺少 due date 時顯示 progress 限制。 |
| Team Dashboard | 身為 Team Lead，我想看到並精簡管理 Team 任務，以便分派工作。 | 可查看任務、建立任務、指派成員、修改狀態、修改截止日；不包含 comments 與 mentions。 | teams、team_members、tasks、mock users、mock roles。 | Team Lead 可管理 Team；Member 可改自己有權限的任務；Viewer 只讀。 | 尚無 Task 時引導新增。 | 權限不足時顯示不可查看。 |
| My Tasks | 身為成員，我想看到指派給我的任務，以便知道今天該做什麼。 | 顯示 assigned、overdue、due soon、blocked、next action。 | tasks、mock current user。 | 只看自己可見任務；Viewer 只讀。 | 沒有任務時顯示空狀態。 | 未選 mock user 時要求選擇。 |
| 自動進度計算 | 身為 PM，我想自動看到進度，避免手動更新百分比。 | progress 由 completed / total 或 weight 計算。 | tasks.status、tasks.weight。 | 可見 scope 內計算。 | 沒有 task 時 progress = 0 並說明。 | total task 為 0 時避免除以 0。 |
| Health / Risk | 身為管理者，我想知道專案是否健康與風險程度。 | Health 使用線性 expected progress 與 overdue / blocked / next action / last updated；Risk 支援 `risk_level_manual`、`risk_level_computed`、`risk_reason`，manual 優先顯示。 | start_date、due_date、progress、blocked、next_action、updated_at、risk_level_manual、risk_level_computed、risk_reason。 | 根據可見任務計算；管理者可看完整；可編輯權限者可設定 manual risk。 | 資料不足時顯示 unknown 並列缺失欄位。 | 日期格式錯誤或 total_project_days <= 0 時顯示規則無法計算。 |
| Blocked Tasks / Dependencies | 身為 Team Lead，我想知道任務卡在哪裡。 | 顯示 blocked reason、blocking task、dependency resolved。 | task_dependencies、tasks.blocked。 | 依 Task visibility 顯示。 | 沒有 blocked task 時顯示正常。 | 循環相依時拒絕儲存。 |
| Filters | 身為使用者，我想篩選重要任務。 | 可依 Workspace、Project、Team、Owner、Status、Risk、Health、Due Date、Overdue、Blocked、My Tasks 篩選。 | tasks、projects、teams、users。 | 不顯示無權限資料。 | 無結果時顯示清除篩選。 | 篩選條件衝突時顯示無結果原因。 |
| Milestones | 身為 PM，我想追蹤關鍵日期。 | 顯示 milestone name、date、status、owner、related tasks、critical flag。 | milestones、tasks。 | Project 成員可看；PM 可改。 | 沒有 milestone 時引導新增。 | 關聯任務不存在時提示修正。 |
| Activity Feed | 身為團隊成員，我想知道最近變更。 | 顯示 task create、assign、status change、due date change、external link、member join、role change；comment / mention 只預留 event type。 | activity_logs、external link metadata。 | 依可見 scope 顯示。 | 沒有活動時顯示尚無更新。 | activity entity 遺失時顯示 fallback text。 |
| Workload | 身為 Team Lead，我想知道成員是否超載。 | 顯示 open tasks、due this week、overdue、weight points、Low / Normal / Overloaded。 | tasks.weight、due_date、status、assignee_id。 | Team Lead / PM 看成員明細；Viewer 看摘要。 | 無任務時 Low。 | 缺少 weight 時預設 Medium / 2。 |
| 外部連結附件 | 身為成員，我想在任務或 Project 補上外部檔案連結，以便其他成員找到資料。 | 可新增與顯示 `url`、`title`、`type`、`note`、`created_by`、`created_at`；拒絕本機路徑；不提供檔案上傳。 | external_links、mock users。 | 依 visibility 與所屬 Workspace / Project / Team / Task 權限顯示。 | 無連結時顯示尚無附件連結。 | URL 格式錯誤時阻止儲存並提示只接受 HTTPS。 |
| 單機多人模擬 | 身為開發者或測試者，我想用 mock users 驗證多人權限。 | 可切換 mock user / role，Dashboard 顯示跟著權限變化。 | mock users、roles、memberships、visibility。 | 模擬 Owner / PM / Team Lead / Member / Viewer。 | 無 mock user 時要求選擇。 | role 不合法時 fallback viewer。 |

## 19. 實作順序

### Phase 1A：資料模型與 mock users

- 目標：建立本機多人模擬資料模型。
- 主要交付物：mock users、mock roles、workspace/project/team/task seed data、seed / mock camp project data、visibility helpers、dependency model、`weight` mapping、risk manual / computed fields。
- 前置依賴：現有 V2 規格確認。
- 驗收條件：可切換 Owner / PM / Team Lead / Member / Viewer，且資料顯示不同。
- 不包含的項目：Supabase Auth、RLS、正式登入、資料庫。

### Phase 1B：Workspace / Project / Team Dashboard

- 目標：建立三層 Dashboard 摘要。
- 主要交付物：Workspace cards、Project cards、Team cards、Team Dashboard 精簡任務管理、progress summary、health / risk placeholders。
- 前置依賴：Phase 1A mock data。
- 驗收條件：每張卡片顯示必要欄位，並可進入下一層；Team Lead 可在 Team Dashboard 查看、建立、指派、更新狀態與修改截止日。
- 不包含的項目：自訂 dashboard builder、saved views、full Gantt、comments、mentions。

### Phase 1C：My Tasks / filters

- 目標：讓成員看到自己要做的任務，並支援基本篩選。
- 主要交付物：My Tasks Dashboard、filters、overdue、blocked、due soon、my tasks toggle。
- 前置依賴：Phase 1A user / role context，Phase 1B dashboard navigation。
- 驗收條件：切換 mock user 後 My Tasks 結果正確改變。
- 不包含的項目：saved views、notification center。

### Phase 1D：Health / Risk / Blocked

- 目標：實作 Health、Risk、Blocked 與 dependency 判定。
- 主要交付物：health calculator、linear expected progress calculator、risk calculator、manual risk override display、dependency validator、blocked display。
- 前置依賴：Phase 1A dependency data，Phase 1B dashboard cards。
- 驗收條件：逾期、blocked、no next action、低於預期進度可正確反映到 Dashboard；manual risk 優先顯示，computed reason 仍可查看。
- 不包含的項目：複雜排程、critical path engine、full Gantt。

### Phase 1E：Milestones / Activity / Workload

- 目標：補齊營隊與小型團隊協作需要的追蹤資訊。
- 主要交付物：milestone list、activity feed、workload summary、external link basic add/display UI、external link activity type。
- 前置依賴：Phase 1A data model、Phase 1D health/risk rules。
- 驗收條件：critical milestone delayed 會影響 Health / Risk；workload 可用 `weight` 顯示 Low / Normal / Overloaded；外部連結可新增與顯示，且拒絕本機路徑。
- 不包含的項目：完整 audit screen、comments thread、mentions、notification center、檔案上傳、內建儲存、轉檔、大型預覽處理。

### Phase 1F：Responsive UI / QA

- 目標：確認桌面與手機版可讀、可操作、資訊不過載。
- 主要交付物：responsive dashboard layout、mobile card priority、empty/error states QA、permission QA checklist。
- 前置依賴：Phase 1B-1E 完成。
- 驗收條件：手機版依優先順序顯示卡片欄位；各角色空白與錯誤狀態完整。
- 不包含的項目：Mobile App、PWA offline、native push notification。

## 待確認決策

目前上述七項決策已確認，沒有尚未解決的待確認決策。

