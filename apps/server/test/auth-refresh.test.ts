import assert from 'node:assert/strict';
import test from 'node:test';

const { REFRESH_ERROR_CODES } = await import('@dmhub/shared');
const { RefreshTokenRejectedError, describeRefreshFailure } = await import(
  '../src/lib/refresh-token.ts'
);

test('an invalid refresh token ends the session and drops the cookie', () => {
  const failure = describeRefreshFailure(new RefreshTokenRejectedError(false, '刷新令牌已过期'));

  assert.equal(failure.status, 401);
  assert.equal(failure.code, REFRESH_ERROR_CODES.INVALID);
  assert.equal(failure.clearCookie, true);
});

test('a refresh token consumed by another request stays recoverable', () => {
  const failure = describeRefreshFailure(new RefreshTokenRejectedError(true, '刷新令牌已被使用'));

  assert.equal(failure.status, 401);
  assert.equal(failure.code, REFRESH_ERROR_CODES.REUSED);
  // 对方稍后会写回新 cookie，这里不能把会话拆掉
  assert.equal(failure.clearCookie, false);
});

test('a server side failure keeps the session alive', () => {
  const failure = describeRefreshFailure(new Error('数据库连接中断'));

  assert.equal(failure.status, 503);
  assert.equal(failure.code, REFRESH_ERROR_CODES.UNAVAILABLE);
  // 临时故障不清 cookie，否则一次抖动就会把用户踢出登录态
  assert.equal(failure.clearCookie, false);
});
