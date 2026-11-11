# Kế Hoạch Áp Dụng Toàn Diện New UI (Cinematic Darkroom) Vào Source Code Studio
**Phase D.4 & D.5: Code Sync, Component Restyling, i18n & Verification Plan**

---

## 1. Bản Đồ Ánh Xạ File & Component Giữa Thiết Kế Stitch vs. Source Code React

| Màn hình Stitch (Screen ID) | Route Studio | React Components & Features liên quan trong `studio/src/` |
|---|---|---|
| **Design Tokens** | Toàn bộ ứng dụng | `studio/src/index.css` (tokens `:root`, `[data-theme="light"]`, `@theme inline`) |
| **Top Navigation Bar** | Layout Shell | `studio/src/components/layout/Header.tsx`, `studio/src/components/app/LanguageSelect.tsx` |
| **`home-empty` & `home`** | `/` | `studio/src/routes/home.tsx`, `features/project/WaitingBanner.tsx`, `features/demos/DemoCards.tsx` |
| **`new-goal`** | `/new?step=goal` | `studio/src/routes/new/StepGoal.tsx`, `studio/src/content/goals.ts` |
| **`new-footage`** | `/new?step=footage` | `studio/src/routes/new/StepFootage.tsx`, `features/uploads/DropZone.tsx`, `features/uploads/InputList.tsx` |
| **`new-brief`** | `/new?step=brief` | `studio/src/routes/new/StepBrief.tsx` |
| **`new-look`** | `/new?step=look` | `studio/src/routes/new/StepLook.tsx`, `features/music/MusicPicker.tsx` |
| **`new-review`** | `/new?step=review` | `studio/src/routes/new/StepReview.tsx` |
| **`project-kickoff`** | `/p/:id` (chưa có checkpoint) | `studio/src/features/project/KickoffPanel.tsx`, `studio/src/routes/project.tsx` |
| **`project-running`** | `/p/:id` (đang chạy) | `studio/src/features/project/StepTimeline.tsx`, `studio/src/features/project/ActivityFeed.tsx` |
| **`project-review` & `project-sent`** | `/p/:id` (awaiting_human) | `studio/src/features/review/ReviewPanel.tsx`, `ProposalPicker.tsx`, `DecisionStatus.tsx` |
| **`project-done`** | `/p/:id` (done) | `studio/src/features/result/ResultPanel.tsx`, `features/cost/CostPanel.tsx` |
| **`library`** | `/library` | `studio/src/routes/library.tsx`, `features/library/ProjectCard.tsx` |
| **`setup`** | `/setup` | `studio/src/routes/setup.tsx`, `features/setup/UnlockCard.tsx`, `TierBadge.tsx` |
| **`settings`** | `/settings` | `studio/src/routes/settings.tsx`, `features/settings/SettingsForm.tsx` |

---

## 2. Quy Trình 5 Bước Thực Hiện Nhúng Code (Embed Implementation)

### Bước 1: Cập nhật Design System Tokens (`studio/src/index.css`)
- Thay thế toàn bộ CSS variables hiện tại bằng bộ token Cinematic Darkroom đã xuất trong `{{DATA:DOCUMENT:DOCUMENT_2}}`.
- Đảm bảo giữ nguyên các token keys: `--bg`, `--surface*`, `--border*`, `--text*`, `--accent`, `--amber*`, `--success*`, `--green*`, `--info*`, `--blue*`, `--warning*`, `--danger*`, `--red*`.
- Khai báo bổ sung các mapping trong directive `@theme inline` của Tailwind CSS v4 để tương thích tự động với các lớp `bg-surface-container`, `text-accent`, `border-border-soft`.

### Bước 2: Chuẩn Hóa UI Primitives (`studio/src/components/ui/`)
- **`Button.tsx`**:
  * `primary`: nền amber `#f0a83c`, chữ đen `#0e0e10`, font đậm, bo góc `rounded-lg` (8px), hover sáng nhẹ `#f5b754`, shadow mờ ấm.
  * `secondary`: nền `bg-surface-container-high`, viền `border-border`, chữ trắng `text-text`.
  * `danger` / `ghost`: cập nhật theo bảng màu cảnh báo.
- **`Card.tsx`**: Nền `bg-surface` (`#131315`), viền sắc nét 1px `border-border` (`#232329`), bo góc `rounded-xl`.
- **`Badge.tsx`**: Nhãn trạng thái (Ready xanh lá, Locked xám/đỏ, Beta, Zero-Key vàng hổ phách) có nền mờ `-dim` tương phản tinh tế.
- **`StepStatus.tsx`**: Trực quan hóa timeline 8 bước với chấm tròn sáng đèn, đường nối kết nối đồng bộ.

### Bước 3: Cập nhật App Header & Top Navigation
- Header chuẩn studio đạo diễn:
  * Logo `OpenMontage Studio` có badge version/tier nhỏ bên cạnh.
  * Thanh menu 5 tab chính: `Home` · `New Video` · `Library` · `Setup` · `Settings`.
  * Khối bên phải: Lối tắt `Classic board ↗`, bộ chọn ngôn ngữ `EN / VI`, toggle chế độ sáng/tối (Dark/Light).

### Bước 4: Tái cấu trúc giao diện các Route theo Stitch Screens
1. **Wizard (`/new`)**: 
   - Đưa thanh Step Stepper hiển thị rõ ràng số bước (`Mục tiêu` → `Footage & Tham khảo` → `Kịch bản` → `Phong cách` → `Kiểm tra`).
   - Đổi grid Goal cards với thông tin thời lượng, chi phí ước tính $0.00, và thẻ nét đứt "Make something like this".
2. **Project Page (`/p/:id`)**:
   - `KickoffPanel`: Giao diện hộp lệnh copy 1-chạm (Claude Code, Cursor, Terminal CLI) kèm trạng thái listening SSE.
   - `ReviewPanel`: Chuyển sang bố cục 2 cột (kịch bản screenplay mono + phân cảnh Storyboard + nút Duyệt amber).
   - `ResultPanel`: Trình phát video tỉ lệ điện ảnh, bộ Social Publish Kit (title/tags/caption) và nút tải gói Export Bundle.
3. **Setup Center (`/setup`)**:
   - Thẻ Tier Zero-Key nổi bật, danh sách "Works Now" và 3 thẻ Unlock API Key trực quan.
4. **Settings (`/settings`)**:
   - 3 card rõ ràng (Language, Spending Limits & Cost Control, Production Defaults).

### Bước 5: Kiểm tra Song ngữ (i18n Parity) & Bộ Kiểm Thử
- Đảm bảo tất cả các chuỗi nhãn hiển thị mới xuất hiện đầy đủ trong cả `studio/src/i18n/en.ts` và `studio/src/i18n/vi.ts`.
- Chạy kiểm tra:
  ```bash
  make studio-check     # Lint, Typecheck, Format, 97+ Vitest tests, Build
  make studio-build     # Build file tĩnh ra studio/dist
  ```
- Chạy kiểm tra E2E Playwright trên server Backlot (`http://127.0.0.1:4750/studio`) để xác nhận không lỗi vỡ giao diện trên cả Dark Mode & Light Mode.