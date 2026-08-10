"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({
  children,
  footer,
  icon,
  onClose,
  subtitle,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  icon: React.ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
  wide?: boolean;
}) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section aria-label={title} aria-modal="true" className={`modal ${wide ? "modal--wide" : ""}`} role="dialog">
        <div className="modal__header">
          <span className="modal__icon">{icon}</span>
          <div className="modal__title">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button aria-label="Close dialog" className="modal__close" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </section>
    </div>
  );
}
