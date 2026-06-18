import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}

export function IconButton({ label, active, danger, children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      className={`icon-button ${active ? "is-active" : ""} ${danger ? "is-danger" : ""}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
