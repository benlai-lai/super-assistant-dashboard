# Dashboard Codex 工作入口

本檔只保存每次工作都必須知道的規則。專案現況讀 `PROJECT_STATUS.md`；詳細規格只在任務需要時讀。

## 唯一正式基準

- 正式 Repository：`C:\Users\taich\Documents\GitHub\super-assistant-dashboard`
- `C:\Users\taich\Downloads\super_assistant_dashboard_v1_package` 是舊下載套件，不是修改、commit 或發布目標。
- 開始任何工作前，先確認 repo root、branch、HEAD、upstream 與 `git status --short --branch`。
- 若路徑、分支、版本或工作樹出現無法解釋的差異，停止並標記 `UNKNOWN`。

## 預設閱讀順序

1. 讀本檔。
2. 讀 `PROJECT_STATUS.md`。
3. 只讀本次任務直接相關的規格與程式。

任務分流：

- V1 產品／介面：`PRODUCT_SPEC.md`、`CODEX_TASK.md`、`index.html`、`styles.css`、`app.js`
- V2 產品範圍：`V2_PRODUCT_SPEC.md`
- V2 資料／權限／安全：`V2_TECHNICAL_DESIGN.md`
- Sprint／階段規劃：`V2_IMPLEMENTATION_ROADMAP.md`
- 實作追查：沿用 Actions → Store → Selectors → Pages，不預設掃描完整歷史

除非任務需要，不讀完整 Git 歷史、舊下載套件、所有規格、所有程式或過往 Codex 記錄。

## 工作規則

- 無法由目前程式、文件或驗證證實的內容一律標記 `UNKNOWN`，不得自行補完。
- Read-Only、修改、commit、push、PR、merge、migration、deploy、Production 驗證是分開的授權階段。
- 保留既有未提交變更；只修改明確授權的檔案。
- 未經同意不新增框架、套件、後端、資料庫或規格外功能。
- 短期維持 HTML／CSS／Vanilla JavaScript；是否改框架為 `UNKNOWN`。
- V1 `localStorage` 不得覆蓋或刪除；遷移必須先 preview／dry run。
- 未經明確授權，不串接 Supabase、不部署、不動 Production。

## 預設回覆順序

除非使用者明確要求不同格式，Dashboard 專案回覆固定先給老闆看得懂的白話結果，再給技術證據。

第一層：白話結果，只回答：

1. 現在成功還是失敗？
2. 這次做了什麼？
3. 有沒有卡住？
4. 下一步需不需要人類決定？

如果需要人類決定，最多提供 2～3 個白話選項，並標示 Codex 的建議。

第二層：技術證據，放在白話結果之後；只有任務需要時才列出 commit SHA、branch、changed files、test evidence、hash、Git ancestry、browser validation 或其他工程證據。

不要把技術證據放在主要結論之前。

## Token 使用原則

- 每次只讀最小必要入口規則與目前專案狀態。
- 不因例行任務重讀全部歷史 acceptance report。
- 詳細 evidence 只有任務需要時才讀。
- 已確認的結論不要重新分析；只在相關狀態可能變動時重新驗證。

## 有界自主執行

- 在已確認的 Dashboard 目標與範圍內，依 `PLAN → IMPLEMENT → CHECK → FIX → RETEST → COMPLETE` 持續完成工作，不因一般技術選擇或可修正錯誤停下詢問。
- 本地、可逆、低風險且不改變既有產品決策的檔案安排、測試順序、除錯、必要小型重構與設定調整，由 Codex 自主決定並採最小變更。
- 涉及產品目的、重大功能或 UX 決策、範圍擴張、其他 Repository、敏感或正式資料、付費服務、Production、不可逆刪除、重大架構遷移、安全／授權／隱私風險時停止並取得人類決策。
- Commit、push、PR、merge、deploy、publish、release 仍是分開授權；未明確授權不得執行。
- 同一技術根因最多做兩次最小修正；仍無法排除時回報 `TECHNICAL_BLOCKER`、證據、已嘗試修正、影響與單一建議行動，不擴大範圍。

## 記憶維護

- 只有重要決策已確認、功能已完成且驗證，或基準版本正式改變時，才更新 `PROJECT_STATUS.md`。
- `PROJECT_STATUS.md` 保持短；細節放回既有規格，不新增重複的狀態、決策或歷史 Markdown。
- 更新狀態時同時記錄日期、驗證基準與仍為 `UNKNOWN` 的項目。
