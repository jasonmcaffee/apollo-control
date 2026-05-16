import { IconType } from "react-icons";
import "./IconButton.css";

interface IconButtonProps {
  Icon: IconType;
  onClick?: () => void;
  size?: number;
  variant?: "circle" | "square";
  className?: string;
  title?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Neumorphic icon button. Small raised pill (or rounded square) with a react-icon glyph. */
export function IconButton({ Icon, onClick, size = 18, variant = "circle", className = "", title, disabled = false, ariaLabel }: IconButtonProps) {
  const classes = ["icon-btn", variant === "square" ? "icon-btn--square" : "icon-btn--circle", className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
    >
      <Icon size={size} className="icon-btn__icon" />
    </button>
  );
}
