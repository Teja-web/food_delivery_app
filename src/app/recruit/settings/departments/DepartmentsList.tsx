"use client";

import { useState, useTransition } from "react";
import { Building2, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { addDepartment, editDepartment, removeDepartment } from "@/actions/departments";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Department {
  id: string;
  name: string;
  description: string | null;
  leadName: string | null;
}

export function DepartmentsClient({
  initialDepartments,
}: {
  initialDepartments: Department[];
}) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setDescription("");
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }

  function startEdit(dept: Department) {
    setEditingId(dept.id);
    setName(dept.name);
    setDescription(dept.description ?? "");
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);

    startTransition(async () => {
      try {
        if (editingId) {
          const updated = await editDepartment(editingId, {
            name: name.trim(),
            description: description.trim() || undefined,
          });
          setDepartments((prev) =>
            prev.map((d) => (d.id === editingId ? { ...d, ...updated } : d)),
          );
        } else {
          const created = await addDepartment({
            name: name.trim(),
            description: description.trim() || undefined,
          });
          setDepartments((prev) => [...prev, created as any]);
        }
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await removeDepartment(id);
        setDepartments((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Departments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Teams and departments available when creating roles.
          </p>
        </div>
        {!showForm && (
          <Button
            variant="default"
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add department
          </Button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-border p-4 space-y-3">
          <div>
            <Label className="text-xs font-semibold text-foreground">Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering"
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-foreground">Description</Label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="submit"
              variant="default"
              disabled={isPending || !name.trim()}
              className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {editingId ? "Update" : "Add"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={resetForm}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Department list */}
      <div className="mt-6 space-y-1">
        {departments.length === 0 && !showForm && (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No departments yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add departments to organize your roles
            </p>
          </div>
        )}
        {departments.map((dept) => (
          <div
            key={dept.id}
            className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{dept.name}</p>
                {dept.description && (
                  <p className="text-[11px] text-muted-foreground">{dept.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={`/recruit/reports/department/${dept.id}`}
                target="_blank"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="View department report"
              >
                <FileText className="h-3.5 w-3.5" />
              </Link>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => startEdit(dept)}
                disabled={isPending}
                className="rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleDelete(dept.id)}
                disabled={isPending}
                className="rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
