import type { Response } from 'express';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const ok = <T>(res: Response, data: T, meta?: PageMeta) =>
  res.status(200).json({ success: true, data, ...(meta ? { meta } : {}) });

export const created = <T>(res: Response, data: T) => res.status(201).json({ success: true, data });

export const noContent = (res: Response) => res.status(204).send();

export const pageMeta = (page: number, pageSize: number, total: number): PageMeta => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});
