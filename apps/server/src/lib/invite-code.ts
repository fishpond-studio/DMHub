import crypto from 'crypto';
import { INVITE_CODE_LENGTH_MIN, INVITE_CODE_LENGTH_MAX } from '@dmhub/shared';

const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateInviteCode(): string {
  const length = INVITE_CODE_LENGTH_MIN + crypto.randomInt(INVITE_CODE_LENGTH_MAX - INVITE_CODE_LENGTH_MIN + 1);
  // 拒绝采样：256 不是 56 的整数倍，直接取模会让前面的字符出现概率偏高；
  // 丢弃落在尾巴上的字节即可得到均匀分布
  const limit = 256 - (256 % SAFE_CHARS.length);
  let code = '';
  while (code.length < length) {
    for (const byte of crypto.randomBytes(length - code.length)) {
      if (byte >= limit) continue;
      code += SAFE_CHARS[byte % SAFE_CHARS.length];
      if (code.length === length) break;
    }
  }
  return code;
}
