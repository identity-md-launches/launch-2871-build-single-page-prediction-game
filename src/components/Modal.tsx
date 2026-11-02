import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Art";
export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const keepFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ].filter((el) => el.getClientRects().length > 0);
      const first = items[0],
        last = items[items.length - 1];
      if (!first) {
        e.preventDefault();
        ref.current?.focus();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    ref.current?.addEventListener("keydown", keepFocus);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = ref.current;
    return () => {
      dialog?.removeEventListener("keydown", keepFocus);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
