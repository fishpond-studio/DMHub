import tls from 'tls';
import net from 'net';

export interface SslCheckResult {
  hostname: string;
  port: number;
  success: boolean;
  valid: boolean;
  daysRemaining: number | null;
  expiresAt: string | null;
  validFrom: string | null;
  issuer: string | null;
  subject: string | null;
  fingerprint256: string | null;
  error?: string;
  checkedAt: string;
}

function parseCertDate(d: string | Date | undefined | null): Date | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * 通过 TLS 握手读取站点证书到期信息（不验证信任链，只取对端证书）。
 */
export async function checkSslCertificate(
  hostname: string,
  port = 443,
  timeoutMs = 10000,
  connectAddress?: string,
): Promise<SslCheckResult> {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const checkedAt = new Date().toISOString();
  const connectHost = connectAddress || host;

  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: connectHost,
        port,
        servername: net.isIP(host) ? undefined : host,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.end();

          if (!cert || !cert.valid_to) {
            resolve({
              hostname: host,
              port,
              success: false,
              valid: false,
              daysRemaining: null,
              expiresAt: null,
              validFrom: null,
              issuer: null,
              subject: null,
              fingerprint256: null,
              error: '未获取到证书',
              checkedAt,
            });
            return;
          }

          const expires = parseCertDate(cert.valid_to);
          const validFrom = parseCertDate(cert.valid_from);
          const now = Date.now();
          let daysRemaining: number | null = null;
          if (expires) {
            daysRemaining = Math.ceil((expires.getTime() - now) / (1000 * 60 * 60 * 24));
          }

          const issuer =
            typeof cert.issuer === 'object'
              ? (cert.issuer as Record<string, string>).O ||
                (cert.issuer as Record<string, string>).CN ||
                JSON.stringify(cert.issuer)
              : String(cert.issuer || '');
          const subject =
            typeof cert.subject === 'object'
              ? (cert.subject as Record<string, string>).CN ||
                JSON.stringify(cert.subject)
              : String(cert.subject || '');

          resolve({
            hostname: host,
            port,
            success: true,
            valid: daysRemaining != null ? daysRemaining >= 0 : false,
            daysRemaining,
            expiresAt: expires ? expires.toISOString() : null,
            validFrom: validFrom ? validFrom.toISOString() : null,
            issuer: issuer || null,
            subject: subject || null,
            fingerprint256: (cert as any).fingerprint256 || cert.fingerprint || null,
            checkedAt,
          });
        } catch (err: any) {
          try { socket.destroy(); } catch {}
          resolve({
            hostname: host,
            port,
            success: false,
            valid: false,
            daysRemaining: null,
            expiresAt: null,
            validFrom: null,
            issuer: null,
            subject: null,
            fingerprint256: null,
            error: err?.message || '解析证书失败',
            checkedAt,
          });
        }
      },
    );

    socket.on('error', (err) => {
      resolve({
        hostname: host,
        port,
        success: false,
        valid: false,
        daysRemaining: null,
        expiresAt: null,
        validFrom: null,
        issuer: null,
        subject: null,
        fingerprint256: null,
        error: err.message || 'TLS 连接失败',
        checkedAt,
      });
    });

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve({
        hostname: host,
        port,
        success: false,
        valid: false,
        daysRemaining: null,
        expiresAt: null,
        validFrom: null,
        issuer: null,
        subject: null,
        fingerprint256: null,
        error: '连接超时',
        checkedAt,
      });
    });
  });
}
