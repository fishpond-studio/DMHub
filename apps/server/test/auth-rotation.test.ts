import assert from 'node:assert/strict';
import test from 'node:test';

// refresh-rotation 会间接加载 config，单元测试不需要真实密钥
process.env.JWT_SECRET ??= 'test-jwt-secret-'.repeat(3);
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-'.repeat(2);

const { REFRESH_TOKEN_ROTATION_GRACE_MS, classifyStoredRefreshToken, RefreshTokenRejectedError, describeRefreshFailure } =
  await import('../src/lib/refresh-token.ts');
const { claimSucceeded } = await import('../src/lib/refresh-rotation.ts');
const { REFRESH_ERROR_CODES } = await import('@dmhub/shared');

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function stored(overrides: { expiresAt?: number; rotatedAt?: number | null } = {}) {
  return {
    expiresAt: new Date(overrides.expiresAt ?? NOW + HOUR),
    rotatedAt: overrides.rotatedAt === undefined ? null : new Date(overrides.rotatedAt),
  };
}

test('an unregistered token is invalid, not a rotation race', () => {
  // 登出、吊销、从未登记都会走到这里：不能当成多标签页竞态让客户端一直重试
  assert.deepEqual(classifyStoredRefreshToken(null, NOW), { action: 'invalid', reason: 'missing' });
});

test('an active token can be rotated', () => {
  assert.deepEqual(classifyStoredRefreshToken(stored(), NOW), { action: 'rotate' });
});

test('a token consumed within the grace window is a concurrent rotation', () => {
  const state = classifyStoredRefreshToken(
    stored({ rotatedAt: NOW - REFRESH_TOKEN_ROTATION_GRACE_MS + 1 }),
    NOW,
  );

  assert.deepEqual(state, { action: 'reused' });
});

test('a token replayed after the grace window is invalid and the family is revoked', () => {
  const state = classifyStoredRefreshToken(
    stored({ rotatedAt: NOW - REFRESH_TOKEN_ROTATION_GRACE_MS - 1 }),
    NOW,
  );

  assert.deepEqual(state, { action: 'invalid', reason: 'replayed' });
});

test('an expired active token is invalid', () => {
  assert.deepEqual(classifyStoredRefreshToken(stored({ expiresAt: NOW - 1 }), NOW), {
    action: 'invalid',
    reason: 'expired',
  });
});

test('missing and replayed tokens end the session and drop the cookie', () => {
  const failure = describeRefreshFailure(new RefreshTokenRejectedError(false, '刷新令牌无效或已过期'));
  assert.equal(failure.code, REFRESH_ERROR_CODES.INVALID);
  assert.equal(failure.clearCookie, true);
});

test('a recent rotation keeps the cookie so the client can retry', () => {
  const failure = describeRefreshFailure(new RefreshTokenRejectedError(true, '刷新令牌已被使用'));
  assert.equal(failure.code, REFRESH_ERROR_CODES.REUSED);
  assert.equal(failure.clearCookie, false);
});

test('both dialects report the same claim outcome', () => {
  // MySQL/MariaDB: [ResultSetHeader, FieldPacket[]]
  assert.equal(claimSucceeded(true, [{ affectedRows: 1 }]), true);
  assert.equal(claimSucceeded(true, [{ affectedRows: 0 }]), false);
  assert.equal(claimSucceeded(true, undefined), false);

  // PostgreSQL: .returning() 返回受影响行数组
  assert.equal(claimSucceeded(false, [{ id: 'token-1' }]), true);
  assert.equal(claimSucceeded(false, []), false);
});
