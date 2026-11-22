import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { type DatabaseHandle, userProfiles, users } from '@appinity/database';
import { DATABASE } from '../infra/tokens.js';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async findActiveById(id: string) {
    const [row] = await this.database.db
      .select({ id: users.id, dataset: users.dataset })
      .from(users)
      .where(and(eq(users.id, id), eq(users.status, 'active')))
      .limit(1);
    return row ?? null;
  }

  async findActiveDemoByHandle(handle: string) {
    const [row] = await this.database.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.handle, handle), eq(users.dataset, 'demo'), eq(users.status, 'active')))
      .limit(1);
    return row ?? null;
  }

  async listActiveDemoUsers() {
    return this.database.db
      .select({
        id: users.id,
        handle: users.handle,
        note: users.demoNote,
        displayName: userProfiles.displayName,
        countryCode: userProfiles.countryCode,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.dataset, 'demo'), eq(users.status, 'active')))
      .orderBy(asc(users.handle));
  }
}
