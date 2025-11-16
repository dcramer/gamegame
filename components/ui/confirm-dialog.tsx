"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Button } from "./button";

interface ConfirmDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;
  /**
   * Callback when the dialog open state changes
   */
  onOpenChange: (open: boolean) => void;
  /**
   * Dialog title
   */
  title: string;
  /**
   * Dialog description/message
   */
  description: string;
  /**
   * Callback when the user confirms
   */
  onConfirm: () => void | Promise<void>;
  /**
   * Text for the confirm button
   * @default "Confirm"
   */
  confirmText?: string;
  /**
   * Text for the cancel button
   * @default "Cancel"
   */
  cancelText?: string;
  /**
   * Whether the action is destructive (shows red button)
   * @default false
   */
  destructive?: boolean;
  /**
   * Whether the confirm action is currently loading
   * @default false
   */
  isLoading?: boolean;
}

/**
 * Confirmation dialog for destructive or important actions.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 *
 * <Button onClick={() => setOpen(true)}>Delete</Button>
 * <ConfirmDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Delete game?"
 *   description="This action cannot be undone. This will permanently delete the game and all associated data."
 *   destructive
 *   onConfirm={async () => {
 *     await deleteGame();
 *     setOpen(false);
 *   }}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  isLoading = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
