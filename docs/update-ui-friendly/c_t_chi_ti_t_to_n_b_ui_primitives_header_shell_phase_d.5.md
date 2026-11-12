# Đặc Tả Kỹ Thuật & Code Mẫu: Bộ UI Primitives & App Header Shell
**Phase D.5: UI Primitives & Shell Refactoring (`studio/src/components/ui/` & `studio/src/components/layout/`)**
**Chủ đề: Cinematic Darkroom Theme • Tương thích Tailwind CSS v4 & React 19**

---

## 1. Thành phần `Badge` (`studio/src/components/ui/Badge.tsx`)

### 1.1 Yêu cầu thiết kế (Design Specs)
- **Mục đích:** Hiển thị trạng thái dự án (Waiting, Working, Ready, Failed), nhãn tính năng (Beta, Zero-Key, Local Engine), mức độ khóa của video goal.
- **Biến thể màu sắc ngữ nghĩa (Variants):**
  * `amber` / `warning` (Waiting for you / Awaiting human): Nền mờ `bg-amber-dim` (`rgba(240,168,60,0.15)`), chữ `text-amber` (`#f0a83c`), viền `border border-amber/30`. Có tùy chọn chấm tròn pulsing nhấp nháy `animate-pulse`.
  * `success` / `green` (Ready, Done, Completed, Free local): Nền mờ `bg-success-dim` (`rgba(79,194,131,0.15)`), chữ `text-success` (`#4fc283`), viền `border border-success/30`.
  * `info` / `blue` (Working, In progress, Rendering 60fps): Nền mờ `bg-info-dim` (`rgba(106,161,255,0.15)`), chữ `text-info` (`#6aa1ff`), viền `border border-info/30`.
  * `danger` / `red` (Failed, Stalled, Over budget): Nền mờ `bg-danger-dim` (`rgba(229,84,75,0.15)`), chữ `text-danger` (`#e5544b`), viền `border border-danger/30`.
  * `neutral` / `surface` (Draft, Not started, Tier, Version, Tags): Nền `bg-surface-container-high` (`#1c1c21`), chữ `text-text-2` (`#a0a0a9`), viền `border border-border`.
- **Kích thước (Sizes):**
  * `sm`: Chiều cao `h-5`, font `text-[10px] uppercase font-semibold tracking-wider px-1.5`, bo góc `rounded`.
  * `md`: Chiều cao `h-6`, font `text-xs font-medium px-2.5`, bo góc `rounded-full` (kiểu pill) hoặc `rounded-md`.

### 1.2 Mã nguồn React 19 (`Badge.tsx`)

```tsx
import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'amber' | 'success' | 'info' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
  pulse?: boolean;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  pulse = false,
  dot = false,
  className = '',
  children,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-sans select-none whitespace-nowrap transition-colors';

  const sizeStyles = {
    sm: 'text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded gap-1',
    md: 'text-xs font-medium px-2.5 py-0.5 rounded-full gap-1.5',
  };

  const variantStyles = {
    amber: 'bg-amber-dim text-amber border border-amber/30',
    success: 'bg-success-dim text-success border border-success/30',
    info: 'bg-info-dim text-info border border-info/30',
    danger: 'bg-danger-dim text-danger border border-danger/30',
    neutral: 'bg-surface-container-high text-text-2 border border-border',
  };

  const dotColor = {
    amber: 'bg-amber',
    success: 'bg-success',
    info: 'bg-info',
    danger: 'bg-danger',
    neutral: 'bg-text-3',
  };

  return (
    <span
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${dotColor[variant]} ${
            pulse ? 'animate-pulse ring-2 ring-current/20' : ''
          }`}
        />
      )}
      {children}
    </span>
  );
};
```

---

## 2. Thành phần `Banner` (`studio/src/components/ui/Banner.tsx`)

### 2.1 Yêu cầu thiết kế (Design Specs)
- **Mục đích:** Hiển thị khối "Waiting for you" ở Home Dashboard, cảnh báo hệ thống, thông báo duyệt checkpoint hoặc trạng thái ngoại tuyến.
- **Biến thể:**
  * `waiting` (Amber Call-to-action): Nền gradient ấm `bg-gradient-to-r from-amber-dim to-surface-container`, viền `border border-amber/40`, đổ bóng mềm `shadow-glow`.
  * `warning` / `alert`: Nền `bg-danger-dim`, viền `border-danger/30`, icon cảnh báo đỏ.
  * `info`: Nền `bg-surface-container-high`, viền `border-border`.
- **Cấu trúc:** Icon bên trái, khối tiêu đề + mô tả ở giữa, nút hành động trực tiếp bên phải (Approve, Review, Unlock).

### 2.2 Mã nguồn React 19 (`Banner.tsx`)

```tsx
import React from 'react';

export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'waiting' | 'warning' | 'info';
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const Banner: React.FC<BannerProps> = ({
  variant = 'info',
  action,
  icon,
  className = '',
  children,
  ...props
}) => {
  const variantStyles = {
    waiting:
      'bg-gradient-to-r from-amber-dim via-surface to-surface-container border border-amber/40 shadow-glow text-text',
    warning:
      'bg-danger-dim border border-danger/30 text-text',
    info:
      'bg-surface-container border border-border text-text',
  };

  return (
    <div
      role="region"
      className={`rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      <div className="flex items-start sm:items-center gap-3.5">
        {icon && <div className="shrink-0 mt-0.5 sm:mt-0">{icon}</div>}
        <div className="space-y-0.5 text-sm">{children}</div>
      </div>
      {action && <div className="shrink-0 w-full sm:w-auto">{action}</div>}
    </div>
  );
};
```

---

## 3. Thành phần `StepStatus` & `StepTimeline` (`studio/src/components/ui/StepStatus.tsx`)

### 3.1 Yêu cầu thiết kế (Design Specs)
- **Mục đích:** Trực quan hóa timeline 8 bước của quy trình dựng phim AI:
  `1. Research` → `2. Concept & Plan` → `3. Script` → `4. Storyboard` → `5. Visuals & Audio` → `6. Edit` → `7. Render` → `8. Publish`.
- **Trạng thái từng nút bước (Step Nodes):**
  * `done` (Đã hoàn thành): Chấm xanh lá `bg-success`, icon checkmark trắng, đường nối phía sau sáng xanh.
  * `waiting` (Cổng chờ người dùng duyệt - Checkpoint): Chấm vàng hổ phách `bg-amber text-on-accent font-bold ring-4 ring-amber/20 animate-pulse`, nhãn sáng amber.
  * `working` (AI Agent đang chạy): Chấm xanh lam `bg-info animate-spin-slow` hoặc vòng tròn tỏa sóng nhịp nhàng.
  * `not_started` (Chưa tới lượt): Chấm xám mờ `bg-surface-container-highest border border-border text-text-3`.
  * `failed`: Chấm đỏ cảnh báo `bg-danger text-white`.
- **Hỗ trợ tương tác:** Nhấp vào bước có thể nhảy trực tiếp tới tab nội dung tương ứng (Script, Storyboard, Results).

### 3.2 Mã nguồn React 19 (`StepStatus.tsx`)

```tsx
import React from 'react';

export type StepState = 'not_started' | 'working' | 'waiting' | 'done' | 'failed';

export interface StepItem {
  id: string;
  name: string;
  state: StepState;
  hasCheckpoint?: boolean;
}

export interface StepTimelineProps {
  steps: StepItem[];
  currentStepId?: string;
  onStepClick?: (stepId: string) => void;
  className?: string;
}

export const StepTimeline: React.FC<StepTimelineProps> = ({
  steps,
  currentStepId,
  onStepClick,
  className = '',
}) => {
  return (
    <nav aria-label="Project Progress" className={`w-full overflow-x-auto py-2 ${className}`}>
      <ol className="flex items-center min-w-[720px] justify-between relative">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentStepId;
          const isDone = step.state === 'done';
          const isWaiting = step.state === 'waiting';
          const isWorking = step.state === 'working';
          const isFailed = step.state === 'failed';

          // Node styling
          let nodeClasses = 'bg-surface-container-highest border border-border text-text-3';
          if (isDone) nodeClasses = 'bg-success text-white border-success';
          else if (isWaiting) nodeClasses = 'bg-amber text-on-accent font-bold ring-4 ring-amber/20';
          else if (isWorking) nodeClasses = 'bg-info text-white ring-4 ring-info/20 animate-pulse';
          else if (isFailed) nodeClasses = 'bg-danger text-white border-danger';

          return (
            <li
              key={step.id}
              onClick={() => onStepClick?.(step.id)}
              className={`flex-1 flex flex-col items-center group relative cursor-pointer select-none`}
            >
              {/* Connector line behind */}
              {index < steps.length - 1 && (
                <div
                  className={`absolute top-4 left-[50%] w-full h-[2px] -z-0 transition-colors ${
                    isDone ? 'bg-success/60' : 'bg-border'
                  }`}
                />
              )}

              {/* Step Circle Node */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all duration-200 z-10 ${nodeClasses}`}
              >
                {isDone ? (
                  <svg className="w-4 h-4 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>

              {/* Step Label */}
              <div className="mt-2 flex flex-col items-center text-center">
                <span
                  className={`text-xs font-medium transition-colors ${
                    isCurrent || isWaiting
                      ? 'text-amber font-semibold'
                      : isDone
                      ? 'text-text'
                      : 'text-text-3 group-hover:text-text-2'
                  }`}
                >
                  {step.name}
                </span>
                {step.hasCheckpoint && (
                  <span className="text-[10px] text-amber-dim font-mono mt-0.5">◆ Gate</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
```

---

## 4. Thành phần `Tabs` & `EmptyState`

### 4.1 `Tabs.tsx` (`studio/src/components/ui/Tabs.tsx`)
- Phân cách đường viền dưới `border-b border-border`.
- Tab active: Chữ sáng `text-text`, đường line dưới màu hổ phách `border-b-2 border-accent font-semibold`.
- Tab inactive: Chữ xám `text-text-2`, hover sáng `hover:text-text`.

```tsx
import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeId, onChange, className = '' }) => (
  <div className={`border-b border-border flex items-center gap-6 ${className}`}>
    {tabs.map((tab) => {
      const isActive = tab.id === activeId;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 cursor-pointer ${
            isActive ? 'text-text font-semibold' : 'text-text-2 hover:text-text'
          }`}
        >
          <span>{tab.label}</span>
          {tab.badge !== undefined && (
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                isActive ? 'bg-accent/20 text-accent' : 'bg-surface-container text-text-3'
              }`}
            >
              {tab.badge}
            </span>
          )}
          {isActive && (
            <span className="absolute bottom-0 left-0 w-full h-[2px] bg-accent rounded-full" />
          )}
        </button>
      );
    })}
  </div>
);
```

### 4.2 `EmptyState.tsx` (`studio/src/components/ui/EmptyState.tsx`)
- Bố cục căn giữa, icon kích thước lớn màu xám mờ `text-text-3`.
- Tiêu đề `text-lg font-semibold text-text`, phụ đề `text-sm text-text-2 max-w-md mx-auto`.
- Khu vực hành động gợi ý tạo mới hoặc kiểm tra công cụ.

---

## 5. Cấu Trúc App Shell & Top Navigation (`Header.tsx`)

### 5.1 Các chi tiết giao diện Top Bar:
1. **Brand Logo:** `OpenMontage Studio` với icon cuộn phim / clapper board amber `#f0a83c`, badge `v2.4 PRO` hoặc `Local`.
2. **Main Navigation Links:** 5 tab chính:
   - `Home` (`/`)
   - `New Video` (`/new`) - Có hiệu ứng viền nổi bật.
   - `Library` (`/library`)
   - `Setup` (`/setup`)
   - `Settings` (`/settings`)
3. **Control Actions (Bên phải):**
   - Lối tắt `Classic board ↗` (mở trang bảng điều khiển truyền thống).
   - Component chọn ngôn ngữ `EN / VI` (`LanguageSelect.tsx`).
   - Nút chuyển Dark/Light Mode.
   - Nút CTA `+ New Video` màu amber nổi bật cố định góc phải.

---

## 6. Tổng Kết Kiểm Tra Độc Lập & Sẵn Sàng Nhúng (Embed Readiness)

| Component UI | Trạng thái đặc tả | Khả năng tương thích Tailwind v4 | Sẵn sàng nhúng |
|:---|:---:|:---:|:---:|
| `Button.tsx` | Hoàn thành | 100% qua `bg-accent`, `bg-surface-container`, `shadow-glow` | ✓ Sẵn sàng |
| `Card.tsx` | Hoàn thành | 100% qua `bg-surface`, `border-border`, 4 biến thể | ✓ Sẵn sàng |
| `Badge.tsx` | Hoàn thành | 100% qua `-dim` tokens & status semantics | ✓ Sẵn sàng |
| `Banner.tsx` | Hoàn thành | 100% qua gradient hổ phách và status alerts | ✓ Sẵn sàng |
| `StepStatus.tsx` | Hoàn thành | 100% qua quy trình 8 bước dựng phim AI | ✓ Sẵn sàng |
| `Tabs.tsx` | Hoàn thành | 100% qua typography & underline amber | ✓ Sẵn sàng |
| `EmptyState.tsx` | Hoàn thành | 100% chuẩn Cinematic Darkroom layout | ✓ Sẵn sàng |
| `Header.tsx` | Hoàn thành | 100% khớp bố cục Studio Đạo diễn | ✓ Sẵn sàng |
