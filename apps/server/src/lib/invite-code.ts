import crypto from 'crypto';
import { INVITE_CODE_LENGTH_MIN, INVITE_CODE_LENGTH_MAX } from '@dmhub/shared';

const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateInviteCode(): string {
  const length = INVITE_CODE_LENGTH_MIN + crypto.randomInt(INVITE_CODE_LENGTH_MAX - INVITE_CODE_LENGTH_MIN + 1);
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += SAFE_CHARS[bytes[i] % SAFE_CHARS.length];
  }
  return code;
}
