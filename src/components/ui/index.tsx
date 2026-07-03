import * as React from 'react'
import { cn } from '@/lib/utils'

/* ---------- Card ---------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-4', className)} {...props} />
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5 flex items-center justify-between', className)} {...props} />
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold text-fg', className)} {...props} />
}

/* ---------- Button ---------- */
type Variant = 'primary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'icon'
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}
const variantCls: Record<Variant, string> = {
  primary: 'bg-primary-400 text-white hover:bg-primary-600',
  outline: 'border border-border hover:bg-surface-2',
  ghost: 'hover:bg-surface-2',
  danger: 'bg-red-500 text-white hover:bg-red-600',
}
const sizeCls: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  icon: 'h-9 w-9',
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn('btn', variantCls[variant], sizeCls[size], className)}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

/* ---------- Input ---------- */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn('input', className)} {...props} />,
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn('input min-h-[90px] resize-y', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn('input', className)} {...props} />,
)
Select.displayName = 'Select'

/* ---------- Badge ---------- */
export function Badge({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-surface-2 text-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-14 text-center">
      {icon && <div className="mb-3 text-primary-400">{icon}</div>}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
