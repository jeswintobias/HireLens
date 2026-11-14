"use client";
import { useState } from "react";
import { Eye, FileText, Loader2, Presentation, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import { StatusPill } from "@/components/common/HiringUI";
import { formatDateTime } from "@/utils/Hiring/hiringUtils";

/**
 * The vendor's own submitted profiles for one opening. Vendors see only
 * their uploads and the workflow status — never the AI recommendation.
 * Only profiles not yet reviewed (SUBMITTED) can be soft-deleted.
 */
export default function VendorProfilesTable({ profiles, deletingIds, onDelete, onPreview }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);

  const preview = async (profile) => {
    setPreviewingId(profile.id);
    try {
      await onPreview(profile);
    } catch (message) {
      toast.error(typeof message === "string" ? message : "Could not open the file");
    } finally {
      setPreviewingId(null);
    }
  };

  const confirmDelete = async () => {
    const profile = pendingDelete;
    setPendingDelete(null);
    try {
      await onDelete(profile.id);
      toast.success(`${profile.fileName} deleted`);
    } catch (message) {
      toast.error(typeof message === "string" ? message : "Failed to delete profile");
    }
  };

  return (
    <section aria-labelledby="profiles-heading" className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
        <h2 id="profiles-heading" className="text-lg font-semibold text-foreground">
          Your submitted profiles
        </h2>
        <span className="text-sm text-secondary">{profiles.length} total</span>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No profiles yet"
          message="Profiles you submit for this opening will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <caption className="sr-only">Your submitted profiles</caption>
            <thead className="bg-tableHeader">
              <tr>
                {["File", "Submitted", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-4 py-3 text-xs font-medium uppercase tracking-wider text-secondary ${
                      h === "Actions" ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profiles.map((p) => {
                const Icon = p.fileType === "pdf" ? FileText : Presentation;
                const deleting = deletingIds.includes(p.id);
                const canDelete = p.status === "SUBMITTED";
                return (
                  <tr key={p.id} className={deleting ? "opacity-50" : ""}>
                    <td className="px-4 py-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
                        <span className="max-w-[18rem] truncate text-sm text-foreground" title={p.fileName}>
                          {p.fileName}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-secondary">
                      {formatDateTime(p.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => preview(p)}
                          disabled={previewingId === p.id}
                          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-foreground hover:bg-accent disabled:opacity-50"
                          aria-label={`${p.fileType === "pdf" ? "Preview" : "Download"} ${p.fileName}`}
                        >
                          {previewingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          <span className="hidden text-sm sm:inline">{p.fileType === "pdf" ? "Preview" : "Download"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(p)}
                          disabled={!canDelete || deleting}
                          title={canDelete ? "Delete profile" : "Reviewed profiles cannot be deleted"}
                          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          aria-label={`Delete ${p.fileName}`}
                        >
                          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          <span className="hidden text-sm sm:inline">Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this profile?"
        description={`"${pendingDelete?.fileName}" will be withdrawn from this opening and hidden from the hiring manager.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </section>
  );
}
