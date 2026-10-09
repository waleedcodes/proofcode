import { describe, expect, it } from 'vitest';
import { getUser } from '../src/lib/auth';

describe('Auth Service', () => {
  it('should retrieve user', async () => {
    const user = await getUser('1');
    expect(user).toBeDefined();
  });
});
