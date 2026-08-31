# Dashboard Project Status

- 更新日期：2026-08-31
- 唯一正式 Repository：`C:\Users\taich\Documents\GitHub\super-assistant-dashboard`
- 已驗證功能基準（記憶整理前）：`main` / `5508e6d7068e03b165159d8d05e14a68bae8e0ed` / `origin/main`
判定原則：無法由目前程式、文件或驗證確認者，一律標記 `UNKNOWN`。

## 目前方向

- 核心目標：降低使用者管理想法、任務、行程與專案狀態的認知負擔。
- V1 是可操作的個人工作 Dashboard，必須保留既有資料與使用方式。
- V2 文件將方向擴展為 Workspace 協作平台；正式產品核准狀態仍為 `UNKNOWN`。
- 目前仍是本機 Prototype，沒有可證實的 Production 後端或正式多人環境。

## 已完成並可由程式確認

- V1：總覽、日曆、任務、專案、Inbox、快速新增、任務狀態／完成／封存及 V1 `localStorage` 保存。
- V2：Workspace、Project、Team、Task Detail、My Tasks 五種頁面與 Hash Router。
- V2 任務操作：建立、改負責人、改截止日、改狀態、完成／重開及刪除；刪除會同步清理相關 activity、attachment、dependency 與 selected task。
- V2 Dashboard：進度、逾期、即將到期、阻塞、風險、健康度與工作量摘要。
- 資料邊界：Memory／LocalStorage repository、V2 獨立 storage key、fallback、state validation 與 fixed clock 測試邊界。
- V1 migration preview：只預覽可遷移 Task，不會正式匯入或刪除 V1 資料。
- V2 storage schema 已升到 version 2：新增 `orders` 陣列與 Task `orderId` 相容欄位；目前只有資料格式，沒有訂單履約操作畫面或流程。
- 2026-08-31 驗證：`state-foundation tests passed`、`repository-boundary tests passed`。

## 尚未完成或只有部分基礎

- 角色目前是 mock 資料；沒有登入、切換身分、真實權限或 visibility enforcement。
- Activity、外部連結與任務依賴主要為顯示；缺少完整新增／編輯流程。
- 沒有完整 Workspace／Project／Team／成員／邀請管理。
- 沒有正式 V1 export、完整 mapping、duplicate detection 或 import dry run。
- 沒有 Supabase Auth、PostgreSQL、RLS、雲端同步或多人資料隔離實作。
- Repository contract 目前為同步模式，不能宣稱可直接替換成非同步 Supabase repository。
- 沒有自動化 DOM、390px 響應式、鍵盤操作與 accessibility regression suite。
- 訂單履約目前只有 schema migration，沒有產品規格、UI 或完整生命週期。

## 已確認的重要決策

- 短期維持 HTML／CSS／Vanilla JavaScript，不立即重寫框架。
- Workspace 是未來多租戶隔離基礎；跨租戶資料必須依 `workspace_id` 隔離。
- 前端按鈕限制不能取代後端 RLS。
- V1 `localStorage` 必須保留；遷移先 preview／dry run，不自動覆蓋或刪除原資料。
- 第一階段附件只保存外部 HTTPS 連結 metadata，不以本機路徑共享。
- 營隊是一個 Project，各工作組是 Team，具體工作是 Task。

## 已確認落差／阻塞

- 文件定義 7 種任務狀態；程式目前只有 4 種。
- 文件建議任務權重 1／2／5；程式目前接受 1–3。
- 下一個 Sprint、產品優先級、負責人、期限與完成定義尚未確認。
- V2 正式產品核准、部署目標、正式網址、瀏覽器支援矩陣：`UNKNOWN`。
- Supabase 專案、環境、預算、資料治理負責人：`UNKNOWN`。
- V1 真實資料格式、資料量與 migration 樣本：`UNKNOWN`。
- 最新桌機與 390px 手機人工驗收結果：`UNKNOWN`。

## 下一個決策點

在開發新功能前，由產品負責人先確認下一階段的唯一目標與驗收邊界。未確認前，不直接建立資料庫、不導入 React、不覆蓋 V1 資料、不擴大訂單功能，也不部署 Production。

## 詳細資料按需閱讀

- V1：`PRODUCT_SPEC.md`、`CODEX_TASK.md`
- V2 產品：`V2_PRODUCT_SPEC.md`
- V2 技術／安全：`V2_TECHNICAL_DESIGN.md`
- 階段規劃：`V2_IMPLEMENTATION_ROADMAP.md`
