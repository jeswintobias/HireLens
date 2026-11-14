"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Loader2, Presentation, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import {
  MAX_FILES_PER_UPLOAD,
  MAX_RESUME_SIZE_BYTES,
  RESUME_ACCEPT,
  formatFileSize,
  validateResumeFiles,
} from "@/utils/Hiring/hiringUtils";

/**
 * Drag-and-drop uploader for candidate resumes (PDF / PPTX, multiple files).
 * Files are staged locally first, then submitted together; the backend
 * stores them in S3 and records all profiles in one transaction.
 */
export default function ProfileUploader({ disabled, disabledReason, isSubmitting, onSubmit }) {
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState([]);

  const onDrop = useCallback(
    (accepted, rejected) => {
      const incoming = [...accepted, ...rejected.map((r) => r.file)];
      const result = validateResumeFiles(incoming, files);
      setFiles((prev) => [...prev, ...result.accepted]);
      setErrors(result.errors);
    },
    [files]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: RESUME_ACCEPT,
    maxSize: MAX_RESUME_SIZE_BYTES,
    multiple: true,
    noClick: true,
    disabled: disabled || isSubmitting,
  });

  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const submit = async () => {
    if (!files.length) return;
    try {
      const created = await onSubmit(files);
      toast.success(`${created.length} profile${created.length === 1 ? "" : "s"} submitted`);
      setFiles([]);
      setErrors([]);
    } catch (message) {
      toast.error(typeof message === "string" ? message : "Failed to submit profiles");
    }
  };

  return (
    <section aria-labelledby="upload-heading" className="rounded-lg border border-border p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="upload-heading" className="text-lg font-semibold text-foreground">
          Submit candidate profiles
        </h2>
        <span className="text-xs text-secondary">
          PDF or PPTX · up to {MAX_FILES_PER_UPLOAD} files · 10 MB each
        </span>
      </div>

      {disabled ? (
        <p className="rounded-md bg-accent px-4 py-6 text-center text-sm text-secondary">
          {disabledReason || "This opening is not accepting profiles."}
        </p>
      ) : (
        <>
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                : "border-border hover:bg-accent"
            }`}
          >
            <input {...getInputProps()} aria-label="Choose resume files" />
            <UploadCloud className="h-10 w-10 text-secondary" aria-hidden="true" />
            <p className="text-sm text-foreground">
              {isDragActive ? "Drop the files here…" : "Drag & drop resumes here"}
            </p>
            <button
              type="button"
              onClick={open}
              disabled={isSubmitting}
              className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-50"
            >
              Browse files
            </button>
          </div>

          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-rose-600 dark:text-rose-400" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <div className="mt-4">
              <ul className="divide-y divide-border rounded-md border border-border" aria-label="Files to submit">
                {files.map((f) => {
                  const Icon = f.name.toLowerCase().endsWith(".pdf") ? FileText : Presentation;
                  return (
                    <li key={f.name} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
                        <span className="truncate text-sm text-foreground">{f.name}</span>
                        <span className="shrink-0 text-xs text-secondary">{formatFileSize(f.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(f.name)}
                        disabled={isSubmitting}
                        className="rounded p-1 text-secondary hover:bg-accent hover:text-foreground disabled:opacity-50"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setErrors([]);
                  }}
                  disabled={isSubmitting}
                  className="h-9 rounded-md border border-border px-4 text-sm text-foreground hover:bg-accent disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isSubmitting}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-4 text-sm text-background hover:opacity-90 disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {isSubmitting ? "Submitting…" : `Submit ${files.length} profile${files.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
