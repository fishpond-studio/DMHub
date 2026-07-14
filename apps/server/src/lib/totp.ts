import { TOTP, Secret } from 'otpauth';

export function generateTotpSecret(username: string, issuer: string = 'DMHub'): { secret: string; otpauthUri: string } {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer,
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    otpauthUri: totp.toString(),
  };
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}
