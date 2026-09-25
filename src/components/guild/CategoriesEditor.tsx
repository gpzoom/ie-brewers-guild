import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { createCategory, deleteCategory, updateCategory } from "@/lib/categories/categories.server";
import type { CategoryRow } from "@/lib/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const headerLabelClass = "text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted";

const rowButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-canvas-border bg-canvas px-[13px] text-xs font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-50 md:h-10";

const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-canvas-border bg-canvas text-ink-muted transition-colors hover:bg-canvas-2 hover:text-ink disabled:opacity-40 md:h-10 md:w-10";

const accentButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60";

const lightButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-60";

const inputClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-3.5 font-sans text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

function InfoIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-px shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.4" stroke="#6B6156" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.9v.9" stroke="#6B6156" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Guild supply categories (artboard S, GuildCategories): name/slug/
 * sort_order CRUD over the categories table. Rename happens in place on the
 * row; order is changed with the row's up/down buttons (the list is
 * renumbered 0..n so ties can't stick); delete asks first.
 */
export function CategoriesEditor({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Kept set after closing so the dialog text doesn't blank out mid-animation.
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleCreate(name: string) {
    const nextSortOrder =
      categories.reduce((max, category) => Math.max(max, category.sort_order), -1) + 1;
    await createCategory({ data: { name, sortOrder: nextSortOrder } });
    await router.invalidate();
    toast.success(`Added "${name}"`);
  }

  async function handleRename(category: CategoryRow, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      setRenamingId(null);
      return;
    }
    setBusy(true);
    try {
      await updateCategory({
        data: { id: category.id, name: trimmed, sortOrder: category.sort_order },
      });
      await router.invalidate();
      setRenamingId(null);
      toast.success(`Renamed to "${trimmed}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename this category.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBusy(true);
    try {
      for (const [position, category] of reordered.entries()) {
        if (category.sort_order !== position) {
          await updateCategory({
            data: { id: category.id, name: category.name, sortOrder: position },
          });
        }
      }
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reorder this category.");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(category: CategoryRow) {
    await deleteCategory({ data: { id: category.id } });
    await router.invalidate();
    toast.success(`Deleted "${category.name}"`);
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex max-w-[640px] flex-col gap-1.5">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Supply categories
          </h1>
          <p className="text-pretty text-[13px] text-[#564E45]">
            What Allied Members can check to say what they supply. The Guild owns this list — members
            pick from it rather than typing their own, so the directory stays filterable.
          </p>
        </div>
        <button type="button" onClick={() => setAddOpen(true)} className={accentButtonClass}>
          Add a category
        </button>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-canvas-border bg-white">
        <div
          className="flex items-center gap-4 border-b border-[#E6E0D6] bg-[#FCFAF6] px-5 py-3"
          aria-hidden="true"
        >
          <div className={`min-w-0 flex-1 ${headerLabelClass}`}>Category</div>
        </div>

        <ul>
          {categories.map((category, index) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-[#F0EBE3] px-4 py-[13px] last:border-b-0 md:flex-nowrap md:px-5"
            >
              {renamingId === category.id ? (
                <RenameRow
                  category={category}
                  busy={busy}
                  onSave={(name) => handleRename(category, name)}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <>
                  <div className="min-w-0 flex-1 text-[15px] font-medium text-ink">
                    {category.name}
                  </div>
                  <div className="flex w-full justify-end gap-2 md:w-auto md:shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(index, -1)}
                      disabled={busy || index === 0}
                      aria-label={`Move ${category.name} up`}
                      className={iconButtonClass}
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={busy || index === categories.length - 1}
                      aria-label={`Move ${category.name} down`}
                      className={iconButtonClass}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(category.id)}
                      disabled={busy}
                      className={rowButtonClass}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(category);
                        setDeleteOpen(true);
                      }}
                      disabled={busy}
                      className={`${rowButtonClass} font-normal text-ink-muted`}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-ink-muted">
              No categories yet. Add the first one so Allied Members can say what they supply.
            </li>
          )}
        </ul>
      </div>

      <div className="flex items-start gap-3 rounded-[11px] bg-canvas-2 px-[18px] py-4">
        <InfoIcon />
        <p className="text-pretty text-[13px] leading-[1.55] text-[#3A332C]">
          <strong className="font-semibold">Rename rather than delete when you can.</strong>{" "}
          Deleting a category also takes it off every Allied Member who picked it, so their page
          quietly loses that information. Renaming keeps it on their profiles under the new name.
        </p>
      </div>

      <AddCategoryDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleCreate} />

      <DeleteCategoryDialog
        category={deleteTarget}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDelete={handleDelete}
      />
    </div>
  );
}

function RenameRow({
  category,
  busy,
  onSave,
  onCancel,
}: {
  category: CategoryRow;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name);
      }}
    >
      <label className="sr-only" htmlFor={`category-name-${category.id}`}>
        New name for {category.name}
      </label>
      <input
        ref={inputRef}
        id={`category-name-${category.id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        disabled={busy}
        className={`${inputClass} min-w-0 flex-1 basis-56`}
      />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={rowButtonClass}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-ink bg-ink px-[13px] text-xs font-semibold text-canvas transition-colors hover:bg-ink/85 disabled:opacity-50 md:h-10"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function AddCategoryDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setErrorMessage(null);
      setSubmitting(false);
    }
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onAdd(trimmed);
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not create this category.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[440px] sm:rounded-[14px]">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Add a category
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            It goes to the bottom of the list, and Allied Members can pick it straight away.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="new-category-name" className="text-[13px] font-medium text-ink">
              Name
            </label>
            <input
              id="new-category-name"
              autoFocus
              placeholder="e.g. Malt & grain"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className={`${inputClass} placeholder:text-ink-subtle`}
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-[13px] text-danger">
              {errorMessage}
            </p>
          )}
          <DialogFooter className="gap-2 pt-1 sm:gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className={lightButtonClass}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className={accentButtonClass}
            >
              {submitting ? "Adding…" : "Add category"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryDialog({
  category,
  open,
  onOpenChange,
  onDelete,
}: {
  category: CategoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (category: CategoryRow) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) setErrorMessage(null);
  }, [open]);

  async function confirm() {
    if (!category) return;
    setDeleting(true);
    setErrorMessage(null);
    try {
      await onDelete(category);
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not delete this category.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <AlertDialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[460px] sm:rounded-[14px]">
        <AlertDialogHeader className="gap-1.5 text-left">
          <AlertDialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Delete "{category?.name}"?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
            It comes off the picker and off every Allied Member who has already picked it. This
            can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage && (
          <p role="alert" className="text-[13px] text-danger">
            {errorMessage}
          </p>
        )}
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            disabled={deleting}
            className="mt-0 h-11 rounded-[9px] border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink hover:bg-canvas-2"
          >
            Cancel
          </AlertDialogCancel>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="inline-flex h-11 items-center justify-center rounded-[9px] bg-danger px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete category"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
