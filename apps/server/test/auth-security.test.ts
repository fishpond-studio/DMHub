import assert from 'node:assert/strict';
import test, { after, type TestContext } from 'node:test';

process.env.JWT_SECRET = 'test-jwt-secret-'.repeat(3);
process.env.ENCRYPTION_KEY = 'test-encryption-key-'.repeat(2);
process.env.DB_TYPE = 'postgresql';

const { signRefreshToken, verifyToken } = await import('../src/lib/jwt.ts');
const { createDbClient, closeDb } = await import('../src/db/index.ts');
const { refreshAuth } = await import('../src/services/auth.ts');
const { verify2FALogin, verifyPasskeyAuth } = await import('../src/services/twofa.ts');
const { RefreshTokenRejectedError } = await import('../src/lib/refresh-token.ts');

// Drizzle's client is lazy: every query below is stubbed before it can reach a database.
const db = createDbClient('postgres://test:test@127.0.0.1:1/dmhub_test');
after(closeDb);

const user = {
  id: 'user-1',
  username: 'member',
  email: 'member@example.test',
  role: 'member',
  status: 'active',
  twoFactorEnabled: true,
  twoFactorMethods: ['totp', 'passkey'],
};

function mockSelect(t: TestContext, records: Array<Record<string, unknown>>) {
  t.mock.method(db, 'select', (fields?: Record<string, unknown>) => {
    const record = records.shift();
    assert.ok(record, 'unexpected database query');
    const result = fields
      ? Object.fromEntries(Object.keys(fields).map((key) => [key, record[key]]))
      : record;
    return { from: () => ({ where: () => ({ limit: async () => [result] }) }) };
  });
  t.mock.method(db, 'insert', () => assert.fail('rejected authentication must not issue a session'));
  t.mock.method(db, 'transaction', () => assert.fail('rejected authentication must not rotate a session'));
}

test('refresh tokens for one user stay distinct within the same second', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  for (const remember of [false, true]) {
    const first = signRefreshToken('user-1', remember);
    const second = signRefreshToken('user-1', remember);
    assert.notEqual(first, second, 'separate sessions and immediate rotations need separate token hashes');
    assert.equal(verifyToken(first).userId, 'user-1');
    assert.equal(verifyToken(second).userId, 'user-1');
  }
});

test('a disabled account cannot refresh a previously issued session', async (t) => {
  mockSelect(t, [
    { id: 'token-1', userId: user.id, expiresAt: new Date(Date.now() + 60_000), rotatedAt: null },
    { ...user, status: 'disabled' },
  ]);

  await assert.rejects(refreshAuth(signRefreshToken(user.id)), (error: unknown) =>
    error instanceof RefreshTokenRejectedError && !error.reusable && error.message === '账号已被禁用',
  );
});

test('disabling an account also invalidates its pending 2FA login', async (t) => {
  mockSelect(t, [{ ...user, status: 'disabled' }]);
  await assert.rejects(verify2FALogin(user.id, 'totp', '123456'), /账号已被禁用/);
});

test('disabling an account also invalidates its pending passkey login', async (t) => {
  mockSelect(t, [{ ...user, status: 'disabled' }]);
  await assert.rejects(verifyPasskeyAuth(user.id, {}), /账号已被禁用/);
});

test('a pending login cannot switch to an email factor the user never enabled', async (t) => {
  mockSelect(t, [{ ...user }]);
  await assert.rejects(verify2FALogin(user.id, 'email', '123456'), /该验证方式未启用/);
});

test('a pending login cannot use backup codes after 2FA has been disabled', async (t) => {
  mockSelect(t, [{ ...user, twoFactorEnabled: false }]);
  await assert.rejects(verify2FALogin(user.id, 'backup', 'AAAAAA-BBBBBB'), /该验证方式未启用/);
});

test('a pending login cannot use a passkey factor that has been disabled', async (t) => {
  mockSelect(t, [{ ...user, twoFactorMethods: ['totp'] }]);
  await assert.rejects(verifyPasskeyAuth(user.id, {}), /该验证方式未启用/);
});

test('an enabled email factor still reaches code verification', async (t) => {
  mockSelect(t, [{ ...user, twoFactorMethods: ['email'] }]);
  await assert.rejects(verify2FALogin(user.id, 'email', '123456'), /验证码错误或已过期/);
});
