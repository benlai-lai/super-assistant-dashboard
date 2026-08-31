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

## 記憶維護

- 只有重要決策已確認、功能已完成且驗證，或基準版本正式改變時，才更新 `PROJECT_STATUS.md`。
- `PROJECT_STATUS.md` 保持短；細節放回既有規格，不新增重複的狀態、決策或歷史 Markdown。
- 更新狀態時同時記錄日期、驗證基準與仍為 `UNKNOWN` 的項目。
