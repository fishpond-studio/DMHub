import assert from 'node:assert/strict';
import test from 'node:test';

/** 构造一个只有载荷可解析的 JWT（签名部分不参与校验） */
function makeToken(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const { getTokenExpiry, isAccessTokenExpired, needsRefresh, isRefreshRejected, isRefreshReused, refreshWithRetry, SessionExpiredError } =
  await import('../../web/src/lib/token.ts');

const NOW = 1_700_000_000_000;

test('parses the expiry timestamp from a JWT payload', () => {
  const token = makeToken({ userId: 'u1', role: 'admin', exp: NOW / 1000 + 900 });
  assert.equal(getTokenExpiry(token), NOW + 900_000);
});

test('returns null for tokens that carry no parsable payload', () => {
  assert.equal(getTokenExpiry(null), null);
  assert.equal(getTokenExpiry('not-a-jwt'), null);
  assert.equal(getTokenExpiry('a.b.c'), null);
  assert.equal(getTokenExpiry(makeToken({ userId: 'u1' })), null);
});

test('treats a missing or expired access token as expired', () => {
  const expired = makeToken({ exp: NOW / 1000 - 1 });
  const valid = makeToken({ exp: NOW / 1000 + 900 });

  assert.equal(isAccessTokenExpired(null, NOW), true);
  assert.equal(isAccessTokenExpired(expired, NOW), true);
  assert.equal(isAccessTokenExpired(valid, NOW), false);
  // 载荷里没有 exp 时交由服务端判断，不在本地判死
  assert.equal(isAccessTokenExpired(makeToken({ userId: 'u1' }), NOW), false);
});

test('flags tokens that are about to expire so they can be refreshed ahead of time', () => {
  const almostExpired = makeToken({ exp: NOW / 1000 + 30 });
  const fresh = makeToken({ exp: NOW / 1000 + 900 });

  assert.equal(needsRefresh(null, NOW), true);
  assert.equal(needsRefresh(almostExpired, NOW), true);
  assert.equal(needsRefresh(fresh, NOW), false);
  // 后台标签页被节流时提前量可以放大
  assert.equal(needsRefresh(fresh, NOW, 15 * 60_000), true);
});

test('separates a definitive refresh rejection from a rotation race', () => {
  assert.equal(isRefreshRejected(401), true);
  assert.equal(isRefreshRejected(503), false);
  assert.equal(isRefreshRejected(undefined), false);

  // 多标签页轮换竞态：可重试，不算会话失效
  assert.equal(isRefreshReused(401, 'REFRESH_TOKEN_REUSED'), true);
  // 令牌确实无效：会话结束
  assert.equal(isRefreshReused(401, 'REFRESH_TOKEN_INVALID'), false);
  assert.equal(isRefreshReused(503, 'REFRESH_TOKEN_REUSED'), false);
});

/** 构造一个与 axios 形状一致的错误 */
function httpError(status: number, code?: string) {
  return { response: { status, data: { error: '刷新失败', code } } };
}

test('a rejected refresh token ends the session immediately', async () => {
  let calls = 0;
  await assert.rejects(
    refreshWithRetry(async () => {
      calls += 1;
      throw httpError(401, 'REFRESH_TOKEN_INVALID');
    }, [0, 0, 0]),
    (err: unknown) => err instanceof SessionExpiredError,
  );
  // 明确失效就不必再试
  assert.equal(calls, 1);
});

test('a refresh token consumed elsewhere recovers on retry', async () => {
  let calls = 0;
  const token = await refreshWithRetry(async () => {
    calls += 1;
    if (calls === 1) throw httpError(401, 'REFRESH_TOKEN_REUSED');
    return 'new-access-token';
  }, [0, 0, 0]);

  assert.equal(token, 'new-access-token');
  assert.equal(calls, 2);
});

test('a transient server failure keeps the session instead of logging out', async () => {
  let calls = 0;
  await assert.rejects(
    refreshWithRetry(async () => {
      calls += 1;
      throw httpError(503, 'REFRESH_UNAVAILABLE');
    }, [0, 0, 0]),
    (err: unknown) => !(err instanceof SessionExpiredError),
  );
  // 重试过但没有把会话判定为失效
  assert.equal(calls, 3);
});

test('a network failure keeps the session instead of logging out', async () => {
  await assert.rejects(
    refreshWithRetry(async () => {
      throw new Error('Network Error');
    }, [0, 0, 0]),
    (err: unknown) => !(err instanceof SessionExpiredError),
  );
});
