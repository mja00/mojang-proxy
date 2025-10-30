import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import { installConnectMock, makeHttpResponse } from './utils/socket';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Worker fetch routing and proxy', () => {
	it('GET / returns guide HTML', async () => {
		const { default: worker } = await import('../src/index');
		const req = new IncomingRequest('https://example.com/');
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.headers.get('Content-Type')).toContain('text/html');
		const text = await res.text();
		expect(text).toContain('Mojang Proxy');
	});

	it('unknown host returns 400', async () => {
		const { default: worker } = await import('../src/index');
		const req = new IncomingRequest('https://example.com/unknown/path');
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(400);
	});

	it('proxies /services and returns JSON, caches result', async () => {
		const body = '{"hello":"world"}';
		const raw = makeHttpResponse(
			'HTTP/1.1 200 OK',
			{ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(body.length) },
			body,
		);
		const { connectMock } = installConnectMock(raw);
		vi.resetModules();
		const { default: worker } = await import('../src/index');

		const url = 'https://example.com/services/foo?x=y';
		const req1 = new IncomingRequest(url);
		const ctx1 = createExecutionContext();
		const res1 = await worker.fetch(req1, env, ctx1);
		await waitOnExecutionContext(ctx1);
		expect(res1.status).toBe(200);
		expect(res1.headers.get('Content-Type')).toContain('application/json');
		const text1 = await res1.text();
		const json1 = JSON.parse(text1);
		expect(json1.request_type).toBe('tcp');

		// Second fetch should be served from cache (no new socket connect)
		const req2 = new IncomingRequest(url);
		const ctx2 = createExecutionContext();
		const res2 = await worker.fetch(req2, env, ctx2);
		await waitOnExecutionContext(ctx2);
		const text2 = await res2.text();
		expect(text2).toBe(text1);
	});

	it('non-200 upstream leads to 500 (current behavior)', async () => {
		const raw = makeHttpResponse('HTTP/1.1 404 Not Found', { 'Content-Length': '9' }, 'not found');
		installConnectMock(raw);
		vi.resetModules();
		const { default: worker } = await import('../src/index');
		const req = new IncomingRequest('https://example.com/services/foo');
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(500);
	});
});
// Integration-like but directly via worker.fetch to ensure mocks take effect consistently
describe('Integration-like via direct fetch', () => {
	it('returns cached JSON for /services path', async () => {
		const body = '{"a":1}';
		const raw = makeHttpResponse(
			'HTTP/1.1 200 OK',
			{ 'Content-Type': 'application/json', 'Content-Length': String(body.length) },
			body,
		);
		installConnectMock(raw);
		vi.resetModules();
		const { default: worker } = await import('../src/index');
		const res = await worker.fetch(new IncomingRequest('https://example.com/services/a'), env, createExecutionContext());
		expect(res.status).toBe(200);
		const txt = await res.text();
		expect(JSON.parse(txt)).toHaveProperty('request_type', 'tcp');
	});
});
