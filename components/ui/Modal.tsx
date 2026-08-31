"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, className, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={cn(
        "backdrop:bg-dark-950/50 rounded-xl border border-slate-200 dark:border-dark-200 p-0 shadow-xl",
        "dark:border-dark-700 dark:bg-dark-800",
        className
      )}
    >
      {open && (
        <div className="p-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 dark:text-dark-400 hover:text-slate-600 dark:hover:text-dark-600"
          >
            ✕
          </button>
          {children}
        </div>
      )}
    </dialog>
  );
}
