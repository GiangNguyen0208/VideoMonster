# Chi Tiết Thiết Kế & Mã Nguồn Tái Cấu Trúc UI Primitives: Button & Card
**Phase D.5: UI Primitives Refactoring (`studio/src/components/ui/`)**
**Chủ đề: Cinematic Darkroom Theme • Tương thích Tailwind CSS v4 & React 19**

---

## 1. Thành phần `Button` (`studio/src/components/ui/Button.tsx`)

### 1.1 Yêu cầu thiết kế (Design Specs)
- **Primary (Chính - Màu Hổ Phách Amber):** 
  * Nền: `bg-accent` (`#f0a83c`), chữ tương phản cao `text-on-accent` (`#0e0e10`), font đậm `font-semibold`.
  * Hiệu ứng: đổ bóng ấm nhẹ `shadow-[0_2px_12px_rgba(240,168,60,0.25)]`, hover sáng ấm `hover:bg-accent-hover` (`#f5b754`), active co nhẹ `active:scale-[0.98]`.
- **Secondary (Phụ - Bề mặt phòng dựng):** 
  * Nền: `bg-surface-container-high` (`#1c1c21`), viền `border border-border` (`#232329`), chữ sáng `text-text`.
  * Hover: `hover:bg-surface-container-highest` (`#24242a`), `hover:border-border-active/40`.
- **Danger (Cảnh báo / Dừng dự án):** 
  * Nền mờ: `bg-danger-dim` (`rgba(229,84,75,0.12)`), viền `border border-danger/30`, chữ đỏ `text-danger` (`#e5544b`).
  * Hover: `hover:bg-danger hover:text-white`.
- **Ghost (Trong suốt tối giản):** 
  * Nền trong suốt, chữ `text-text-2`, hover đổi màu chữ `hover:text-text` và nền mờ `hover:bg-surface-container`.
- **Kích thước & Bo góc:**
  * `sm`: Chiều cao `h-8`, padding `px-3 text-xs`, bo góc `rounded-md` (6px).
  * `md`: Chiều cao `h-10`, padding `px-4 text-sm`, bo góc `rounded-lg` (8px) - Chuẩn mặc định.
  * `lg`: Chiều cao `h-12`, padding `px-6 text-base font-medium`, bo góc `rounded-xl` (12px).
- **Hỗ trợ Spinner & Trạng thái Loading:** Khi `loading=true`, tự động khóa click `disabled`, ẩn chữ hoặc thêm spinner xoay mượt mà đồng màu.

### 1.2 Mã nguồn TypeScript / React đề xuất (`Button.tsx`)

```tsx
import React, { forwardRef } from 'react';
import { Spinner } from './Spinner';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    // 1. Base Styles: Typography, Transitions, Focus Ring
    const baseStyles =
      'inline-flex items-center justify-center font-sans select-none cursor-pointer ' +
      'transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 ' +
      'focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
      'disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] disabled:active:scale-100';

    // 2. Variant Mappings
    const variantStyles = {
      primary:
        'bg-accent text-on-accent font-semibold shadow-sm hover:bg-accent-hover ' +
        'hover:shadow-[0_0_20px_rgba(240,168,60,0.25)] border border-accent/20 active:bg-accent-active',
      secondary:
        'bg-surface-container-high text-text border border-border ' +
        'hover:bg-surface-container-highest hover:border-text-3/40 active:bg-surface-container',
      danger:
        'bg-danger-dim text-danger border border-danger/30 font-medium ' +
        'hover:bg-danger hover:text-white hover:border-danger active:bg-danger/90',
      ghost:
        'bg-transparent text-text-2 hover:text-text hover:bg-surface-container ' +
        'active:bg-surface-container-high',
    };

    // 3. Size Mappings
    const sizeStyles = {
      sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
      md: 'h-10 px-4 text-sm gap-2 rounded-lg',
      lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading && <Spinner size="sm" className="mr-2 text-current animate-spin" />}
        {!loading && leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
        <span>{children}</span>
        {!loading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

---

## 2. Thành phần `Card` (`studio/src/components/ui/Card.tsx`)

### 2.1 Yêu cầu thiết kế (Design Specs)
- **Cấu trúc nền (Darkroom Surface):** 
  * Nền: `bg-surface` (`#131315`), độ sâu tương phản sâu sắc với màu nền ứng dụng `bg-bg` (`#0a0a0c`).
  * Đường viền sắc nét: 1px viền `border border-border` (`#232329`), khi hover hoặc kích hoạt có thể chuyển viền sáng tinh tế `hover:border-border-active/50`.
  * Bo góc: `rounded-xl` (12px) hoặc `rounded-2xl` (16px) cho các container lớn.
  * Đổ bóng mờ: `shadow-md` nhẹ chống lóa mắt.
- **Biến thể (Variants):**
  * `default`: Bề mặt tiêu chuẩn `bg-surface border-border`.
  * `interactive` (Thẻ có thể click như Goal Card, Demo Card, Project Card): Có hiệu ứng hover nâng bề mặt `hover:bg-surface-bright`, viền sáng `hover:border-accent/40`, con trỏ pointer.
  * `active` / `selected` (Đang được chọn): Viền hổ phách nổi bật `border-accent ring-1 ring-accent/30 bg-surface-container-low`.
  * `dashed` (Khu vực upload footage / Make something like this): Viền nét đứt `border-dashed border-border-soft hover:border-accent/50 bg-surface-container-lowest/50`.
- **Phân tách tiểu mục (Card Sub-components):**
  * `CardHeader`: Chứa tiêu đề mục, icon nhãn và khu vực hành động phụ bên phải.
  * `CardContent`: Vùng nội dung chính với padding chuẩn mực (`p-5` hoặc `p-6`).
  * `CardFooter`: Chân thẻ phân tách bởi đường kẻ tinh tế `border-t border-border-soft bg-surface-container-lowest/40`.

### 2.2 Mã nguồn TypeScript / React đề xuất (`Card.tsx`)

```tsx
import React, { forwardRef } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'active' | 'dashed';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    // 1. Base Styles
    const baseStyles = 'relative rounded-xl transition-all duration-150 overflow-hidden';

    // 2. Variant Mappings
    const variantStyles = {
      default: 'bg-surface border border-border shadow-sm',
      interactive:
        'bg-surface border border-border shadow-sm cursor-pointer ' +
        'hover:bg-surface-bright hover:border-accent/40 hover:shadow-md active:scale-[0.995]',
      active:
        'bg-surface-container-low border-2 border-accent ring-1 ring-accent/30 shadow-glow',
      dashed:
        'bg-surface-container-lowest/60 border-2 border-dashed border-border ' +
        'hover:border-accent/60 hover:bg-surface-container-low/40 cursor-pointer',
    };

    // 3. Padding Mappings
    const paddingStyles = {
      none: '',
      sm: 'p-3 sm:p-4',
      md: 'p-5 sm:p-6',
      lg: 'p-6 sm:p-8',
    };

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// --------------------------------------------------------------------------
// Sub-components for structured composition
// --------------------------------------------------------------------------

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div className={`flex items-center justify-between gap-4 mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <h3 className={`text-base sm:text-lg font-semibold text-text tracking-tight ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <p className={`text-xs sm:text-sm text-text-2 mt-1 leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div className={`space-y-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div
    className={`mt-5 pt-4 border-t border-border-soft flex items-center justify-between text-xs sm:text-sm text-text-3 ${className}`}
    {...props}
  >
    {children}
  </div>
);
```

---

## 3. Đánh Giá Tương Thích & Lợi Ích Cải Tiến

1. **Chuẩn hóa Design Tokens:** Cả hai component tận dụng triệt để bộ biến CSS vừa xuất khẩu (`bg-accent`, `bg-surface`, `border-border`, `text-on-accent`, `shadow-glow`). Khi người dùng đổi qua Light Mode, giao diện tự động thích ứng mượt mà qua các biến `--surface*`, `--text*`.
2. **Loại bỏ sự khô cứng của bản cũ:**
   - `Button`: Bổ sung hiệu ứng bấm `active:scale-[0.98]`, ánh sáng ấm hổ phách amber `shadow-glow`, trạng thái loading có spinner tích hợp sẵn.
   - `Card`: Hỗ trợ 4 biến thể rõ ràng (`interactive` cho Goal/Project, `dashed` cho Upload Footage, `active` cho Review Gate highlight), chia sẵn Header/Content/Footer giúp code giao diện ở các Route gọn gàng và đồng bộ.
3. **Độ an toàn mã nguồn:** Giữ nguyên các thuộc tính DOM chuẩn (`HTMLButtonElement`, `HTMLDivElement`) và sử dụng `forwardRef`, đảm bảo không làm gãy các test Vitest hiện có trong `studio/src/components/ui/`.
