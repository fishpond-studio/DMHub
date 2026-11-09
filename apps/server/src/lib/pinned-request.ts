import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { pipeline, Readable, type Transform } from 'node:stream';
import * as zlib from 'node:zlib';

function decoderFor(encoding: string): (() => Transform) | undefined {
  switch (encoding) {
    case 'identity': return undefined;
    case 'gzip': return zlib.createGunzip;
    case 'deflate': return zlib.createInflate;
    case 'br': return zlib.createBrotliDecompress;
    case 'zstd':
      // Node 20 does not expose zstd; keep importing this module safe there.
      if (typeof zlib.createZstdDecompress === 'function') return zlib.createZstdDecompress;
  }
  throw new Error(`不支持的 Content-Encoding: ${encoding}`);
}

/** Keep the original Host header and TLS server name while pinning DNS. */
export async function requestPinnedAddress(url: URL, address: string, init?: RequestInit): Promise<Response> {
  const request = new Request(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) });
  request.signal.throwIfAborted();
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  headers.host = url.host;
  const family = net.isIP(address);

  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const outgoing = transport.request(url, {
      method: request.method,
      headers,
      signal: request.signal,
      // A socket from an earlier DNS answer must not bypass this validation.
      agent: false,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
    }, (incoming) => {
      try {
        const responseHeaders = new Headers();
        for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
          responseHeaders.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
        }
        const status = incoming.statusCode!;
        const hasBody = request.method !== 'HEAD' && ![204, 205, 304].includes(status);
        let stream: Readable = incoming;
        if (hasBody) {
          const encoding = responseHeaders.get('content-encoding');
          // Content codings are applied in header order and decoded in reverse.
          const factories = encoding ? encoding.split(',').map((value) => decoderFor(value.trim().toLowerCase())).reverse() : [];
          const decoders = factories.flatMap((factory) => factory ? [factory()] : []);
          if (decoders.length > 0) {
            stream = decoders[decoders.length - 1];
            // Propagate decompression failures and consumer cancellation through
            // every stage, including the original socket.
            pipeline([incoming, ...decoders], () => {});
            responseHeaders.delete('content-encoding');
            responseHeaders.delete('content-length');
          }
        } else {
          incoming.resume();
        }
        const response = new Response(hasBody ? Readable.toWeb(stream) as ReadableStream<Uint8Array> : null, {
          status,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        });
        Object.defineProperty(response, 'url', { value: url.href });
        resolve(response);
      } catch (error) {
        incoming.destroy();
        outgoing.destroy();
        reject(error);
      }
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}
