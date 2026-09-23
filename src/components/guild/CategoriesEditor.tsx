import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { createCategory, deleteCategory, updateCategory } from "@/lib/categories/categories.server";
import type { CategoryRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** name/slug/sort_order CRUD over the existing categories table (task brief). */
export function CategoriesEditor({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      await createCategory({ data: { name: newName.trim(), sortOrder: categories.length } });
      setNewName("");
      await router.invalidate();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not create this category.");
    }
  }

  async function handleRename(category: CategoryRow, name: string) {
    if (!name.trim() || name === category.name) return;
    try {
      await updateCategory({ data: { id: category.id, name: name.trim(), sortOrder: category.sort_order } });
      await router.invalidate();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not rename this category.");
    }
  }

  async function handleReorder(category: CategoryRow, sortOrder: number) {
    try {
      await updateCategory({ data: { id: category.id, name: category.name, sortOrder } });
      await router.invalidate();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not reorder this category.");
    }
  }

  async function handleDelete(category: CategoryRow) {
    if (!window.confirm(`Delete "${category.name}"? This can't be undone.`)) return;
    try {
      await deleteCategory({ data: { id: category.id } });
      await router.invalidate();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete this category.");
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <ul className="space-y-2">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`category-name-${category.id}`}>
              Category name
            </label>
            <Input
              id={`category-name-${category.id}`}
              defaultValue={category.name}
              className="h-11"
              onBlur={(e) => handleRename(category, e.target.value)}
            />
            <label className="sr-only" htmlFor={`category-sort-${category.id}`}>
              Sort order for {category.name}
            </label>
            <Input
              id={`category-sort-${category.id}`}
              type="number"
              defaultValue={category.sort_order}
              className="h-11 w-20"
              onBlur={(e) => handleReorder(category, Number(e.target.value))}
            />
            <button
              type="button"
              onClick={() => handleDelete(category)}
              aria-label={`Delete ${category.name}`}
              className="min-h-11 min-w-11 rounded-md border border-danger/50 text-danger hover:bg-danger/10"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate} className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="new-category-name">New category</Label>
          <Input
            id="new-category-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mt-1 h-11"
          />
        </div>
        <Button type="submit" className="h-11">
          Add
        </Button>
      </form>
    </div>
  );
}
