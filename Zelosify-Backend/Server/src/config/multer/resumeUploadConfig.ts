import multer from "multer";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  MAX_FILES_PER_REQUEST,
  MAX_RESUME_SIZE_BYTES,
  MAX_TOTAL_UPLOAD_BYTES,
  getResumeExtension,
} from "../../helpers/hiring/resumeFileTypes.js";

/**
 * Multer setup for candidate resume uploads (PDF / PPTX only).
 * Files are held in memory and streamed to S3 by the upload service.
 * The generic `uploadConfig` is left untouched for other modules.
 */
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_SIZE_BYTES, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    if (getResumeExtension(file.originalname)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

const TOTAL_LIMIT_MESSAGE = `Total upload size must be at most ${MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024)} MB`;
/** Room for multipart boundaries and the uploadTokens field. */
const MULTIPART_OVERHEAD_BYTES = 256 * 1024;

/**
 * Accepts up to MAX_FILES_PER_REQUEST files in the `files` field, at most
 * MAX_TOTAL_UPLOAD_BYTES combined, and turns multer errors into 400
 * responses instead of the global 500 handler.
 */
export const resumeFilesUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Reject oversized submissions before buffering anything in memory.
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_TOTAL_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    res.status(413).json({ message: TOTAL_LIMIT_MESSAGE });
    return;
  }

  resumeUpload.array("files", MAX_FILES_PER_REQUEST)(req, res, (err) => {
    if (!err) {
      // Exact check on the parsed files (Content-Length can be absent).
      const total = ((req.files as Express.Multer.File[] | undefined) ?? []).reduce((sum, f) => sum + f.size, 0);
      if (total > MAX_TOTAL_UPLOAD_BYTES) {
        res.status(413).json({ message: TOTAL_LIMIT_MESSAGE });
        return;
      }
      return next();
    }
    if (err instanceof multer.MulterError) {
      const messages: Record<string, string> = {
        LIMIT_FILE_SIZE: `Each file must be at most ${MAX_RESUME_SIZE_BYTES / (1024 * 1024)} MB`,
        LIMIT_FILE_COUNT: `At most ${MAX_FILES_PER_REQUEST} files per request`,
        LIMIT_UNEXPECTED_FILE: "Only PDF and PPTX files are allowed in the 'files' field",
      };
      res.status(400).json({ message: messages[err.code] ?? err.message });
      return;
    }
    next(err);
  });
};
