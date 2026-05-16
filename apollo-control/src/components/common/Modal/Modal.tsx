import { PropsWithChildren, useEffect } from "react";
import { AiOutlineClose } from "react-icons/ai";
import { IconButton } from "../IconButton/IconButton";
import "./Modal.css";

type ModalProps = PropsWithChildren<{
  onClose: () => void;
  showCloseButton?: boolean;
  variant?: "dialog" | "drawer";
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  windowClassName?: string;
  contentClassName?: string;
  title?: string;
}>;

/** Neumorphic modal — frosted dark backdrop + raised-lg dialog (or right-side drawer). */
export function Modal({
  children,
  onClose,
  showCloseButton = true,
  variant = "dialog",
  closeOnBackdropClick = true,
  closeOnEsc = true,
  className = "",
  windowClassName = "",
  contentClassName = "",
  title,
}: ModalProps) {
  useEffect(() => {
    if (!closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeOnEsc, onClose]);

  const backdropClick = closeOnBackdropClick ? onClose : undefined;
  const variantClass = variant === "drawer" ? "modal--drawer" : "modal--dialog";
  const windowVariantClass = variant === "drawer" ? "modal__window--drawer" : "modal__window--dialog";

  return (
    <div className={`modal ${variantClass} ${className}`} onClick={backdropClick}>
      <div className={`modal__window ${windowVariantClass} ${windowClassName}`} onClick={e => e.stopPropagation()}>
        {title && <div className="modal__title">{title}</div>}
        {showCloseButton && (
          <IconButton Icon={AiOutlineClose} onClick={onClose} size={14} className="modal__close" ariaLabel="Close" />
        )}
        <div className={`modal__content ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
