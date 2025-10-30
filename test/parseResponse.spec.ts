import { describe, it, expect } from 'vitest';
import worker, { parseResponse } from '../src/index';

describe('parseResponse', () => {
	it('parses valid HTTP/1.1 200 with headers and body', () => {
		const body = '{"ok":true}';
		const raw = [
			'HTTP/1.1 200 OK',
			'Content-Type: application/json; charset=utf-8',
			`Content-Length: ${body.length}`,
			'',
			body,
		].join('\r\n');
		const parsed = parseResponse(raw);
		expect(parsed.statusCode).toBe(200);
		expect(parsed.statusMessage).toBe('OK');
		expect(parsed.headers['content-type']).toContain('application/json');
		expect(parsed.headers['content-length']).toBe(String(body.length));
		expect(parsed.bodyData).toBe(body);
	});

	it('throws on missing CRLFCRLF', () => {
		expect(() => parseResponse('HTTP/1.1 200 OK\r\nContent-Length: 0')).toThrow();
	});

	it('throws on invalid status line', () => {
		const raw = ['NOT_HTTP', '', ''].join('\r\n');
		expect(() => parseResponse(raw)).toThrow();
	});

	it('throws on header without colon space', () => {
		const raw = ['HTTP/1.1 200 OK', 'BadHeader', '', ''].join('\r\n');
		expect(() => parseResponse(raw)).toThrow();
	});

	it('throws on missing Content-Length', () => {
		const raw = ['HTTP/1.1 200 OK', 'Content-Type: x', '', 'abc'].join('\r\n');
		expect(() => parseResponse(raw)).toThrow();
	});

	it('throws on mismatched Content-Length', () => {
		const raw = ['HTTP/1.1 200 OK', 'Content-Length: 5', '', 'abc'].join('\r\n');
		expect(() => parseResponse(raw)).toThrow();
	});
});

