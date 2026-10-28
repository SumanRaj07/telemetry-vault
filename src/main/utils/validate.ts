// Zod schemas validating every IPC payload (and CLI input) before it touches
// the database or the filesystem. Invalid input is rejected with a plain
// message; it never reaches SQL or a shell.
import { z } from 'zod';

export const dateRangeSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
}).refine((v) => v.endMs > v.startMs, { message: 'endMs must be after startMs' });

export const idSchema = z.object({ id: z.number().int().positive() });

export const sessionUpdateSchema = z.object({
  id: z.number().int().positive(),
  projectId: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export const manualSessionSchema = z.object({
  appId: z.number().int().positive(),
  projectId: z.number().int().positive().nullable().optional(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  notes: z.string().max(2000).optional(),
}).refine((v) => v.endMs > v.startMs, { message: 'endMs must be after startMs' });

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const projectUpdateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const goalCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['coding_daily', 'coding_weekly', 'focus_daily', 'project_weekly']),
  targetMin: z.number().int().min(1).max(10080),
  projectId: z.number().int().positive().nullable().optional(),
});

export const focusStartSchema = z.object({
  plannedMin: z.number().int().min(1).max(480),
  projectId: z.number().int().positive().nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const settingsPatchSchema = z.object({
  trackingEnabled: z.boolean().optional(),
  idleThresholdSec: z.number().int().min(30).max(3600).optional(),
  pollIntervalMs: z.number().int().min(1000).max(60000).optional(),
  collectWindowTitles: z.boolean().optional(),
  collectExecutablePaths: z.boolean().optional(),
  scheduleEnabled: z.boolean().optional(),
  scheduleStartHour: z.number().int().min(0).max(23).optional(),
  scheduleEndHour: z.number().int().min(0).max(23).optional(),
  scheduleDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  lockBehavior: z.enum(['pause', 'stop_session', 'ignore']).optional(),
  gitEnabled: z.boolean().optional(),
  gitScanIntervalMin: z.number().int().min(5).max(1440).optional(),
  gitFoldersJson: z.string().max(5000).optional(),
  browserIntegrationEnabled: z.boolean().optional(),
  localApiEnabled: z.boolean().optional(),
  localAiEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietStartHour: z.number().int().min(0).max(23).optional(),
  quietEndHour: z.number().int().min(0).max(23).optional(),
  breakReminderMin: z.number().int().min(0).max(480).optional(),
  retentionDays: z.number().int().min(0).max(3650).optional(),
  startOnLogin: z.boolean().optional(),
  startMinimized: z.boolean().optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  firstDayOfWeek: z.number().int().min(0).max(6).optional(),
}).strict();

export const repoPathSchema = z.object({
  path: z.string().min(1).max(1000),
  projectId: z.number().int().positive().nullable().optional(),
});

export const searchSchema = z.object({
  search: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  appId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  repoId: z.number().int().positive().optional(),
  kind: z.string().max(50).optional(),
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});
