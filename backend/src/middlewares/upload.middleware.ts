import multer from 'multer';
import { ApiError } from '../utils/ApiError';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest('Only JPEG, PNG or WebP images are allowed'));
  },
});
