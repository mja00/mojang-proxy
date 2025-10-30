import { vi } from 'vitest';

function createReadableFromString(text: string): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(data);
			controller.close();
		},
	});
}

function createWritable(): WritableStream<Uint8Array> {
	return new WritableStream<Uint8Array>();
}

export function installConnectMock(rawHttp: string) {
	const mock = vi.fn(async () => ({
		readable: createReadableFromString(rawHttp),
		writable: createWritable(),
	}));
	vi.doMock('cloudflare:sockets', () => ({
		connect: mock,
	}));
	return { connectMock: mock };
}

export function makeHttpResponse(statusLine: string, headers: Record<string, string>, body: string) {
	const lines: string[] = [statusLine];
	for (const [k, v] of Object.entries(headers)) {
		lines.push(`${k}: ${v}`);
	}
	lines.push('');
	lines.push(body);
	return lines.join('\r\n');
}

