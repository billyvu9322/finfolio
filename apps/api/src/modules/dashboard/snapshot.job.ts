import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { dashboardService } from './dashboard.service.js';

export async function snapshotAllUsers(): Promise<number> {
  const ids = await db.select({ id: users.id }).from(users);
  for (const { id } of ids) await dashboardService.createSnapshot(id);
  return ids.length;
}
