import assert from 'node:assert/strict';
import test from 'node:test';

// jwt.ts 会加载 config，单元测试不需要真实密钥
process.env.JWT_SECRET ??= 'test-jwt-secret-'.repeat(3);
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-'.repeat(2);

const { signRefreshToken, refreshExpiryForRotation, refreshTokenExpiresAt } = await import('../src/lib/jwt.ts');
const jwt = (await import('jsonwebtoken')).default;

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

function payloadOf(token: string) {
  return jwt.decode(token) as { iat: number; exp: number; remember?: boolean };
}

test('a non-remembered session lasts 24 hours and carries no remember claim', () => {
  const payload = payloadOf(signRefreshToken('u1'));

  assert.equal(payload.exp - payload.iat, 24 * HOUR);
  assert.equal(payload.remember, undefined);
});

test('a remembered session lasts 7 days and keeps the remember claim', () => {
  const payload = payloadOf(signRefreshToken('u1', true));

  assert.equal(payload.exp - payload.iat, 7 * DAY);
  assert.equal(payload.remember, true);
});

test('rotation keeps the absolute deadline of a non-remembered session', () => {
  const original = payloadOf(signRefreshToken('u1'));
  const rotatedAt = original.iat + 6 * HOUR;

  assert.equal(refreshExpiryForRotation(original, false, rotatedAt), original.exp - rotatedAt);
});

test('rotation re-signs a remembered session for the full sliding window', () => {
  const original = payloadOf(signRefreshToken('u1', true));

  // undefined 表示使用 signRefreshToken 默认的 7 天，而不是沿用旧令牌的截止点
  assert.equal(refreshExpiryForRotation(original, true, original.iat + 6 * HOUR), undefined);
});

test('a token signed with an explicit lifetime reports that lifetime', () => {
  const payload = payloadOf(signRefreshToken('u1', false, 1234));

  assert.equal(payload.exp - payload.iat, 1234);
});

test('legacy tokens without exp fall back to the default lifetime', () => {
  assert.equal(refreshExpiryForRotation({ userId: 'u1' }, false, 1000), undefined);
});

test('the database expiry mirrors the token exp', () => {
  const token = signRefreshToken('u1');
  const payload = payloadOf(token);

  assert.equal(refreshTokenExpiresAt(token)?.getTime(), payload.exp * 1000);
  assert.equal(refreshTokenExpiresAt('not-a-jwt'), null);
});
