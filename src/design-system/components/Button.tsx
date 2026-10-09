import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: "md" | "sm";
}

/** Pill button from the SIS design system. Styles live in components.css. */
export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={["ds-btn", `ds-btn--${variant}`, `ds-btn--${size}`, className].filter(Boolean).join(" ")} {...rest} />;
}
