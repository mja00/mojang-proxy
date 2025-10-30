import { connect } from "cloudflare:sockets";
import { html } from "./guide";
type RequestData = {
	host?: string;
	path: string;
	query?: Record<string, string>;
	method?: string;
}

const HOSTS: Record<string, string> = {
	services: 'https://api.minecraftservices.com/',
	session: 'https://sessionserver.mojang.com/'
}

function parseResponse(data: string) {
	// Split into (head, body)
	const splitIndex = data.indexOf('\r\n\r\n');
	if (splitIndex === -1) {
		throw new Error('Data does not contain CRLFCRLF');
	}
	const headData = data.slice(0, splitIndex);
	const rawBodyData = data.slice(splitIndex + 4);
	// @ts-expect-error not typed
	const headText = headData.toString('ascii');
	const headLines = headText.split('\r\n');

	// First line
	const firstLine = headLines[0];
	const match = firstLine.match(/^HTTP\/1\.[01] (\d{3}) (.*)$/);
	if (!match) {
		throw new Error('Invalid status line');
	}
	const statusCode = Number.parseInt(match[1], 10);
	const statusMessage = match[2];

	// Headers
	const headers: Record<string, string> = {};
	for (const line of headLines.slice(1)) {
		// TODO: support alternate whitespace after first ":"?
		const i = line.indexOf(': ');
		if (i === -1) {
			throw new Error('Header line does not contain ": "');
		}
		const key = line.slice(0, Math.max(0, i)).toLowerCase();
		const val = line.slice(i + 2);
		headers[key] = val;
	}

	let bodyData;

	const contentLengthText = headers['content-length'];
	if (contentLengthText) {
		if (!/^[1-9]\d*$/.test(contentLengthText)) {
			throw new Error('Content-Length does not match /^[1-9][0-9]*$/');
		}
		const contentLength = Number.parseInt(contentLengthText, 10);
		if (contentLength !== rawBodyData.length) {
			throw new Error('Content-Length does not match the length of the body data we have');
		}
		bodyData = rawBodyData;
	} else {
		throw new Error('Unable to determine Content-Length');
	}

	return { statusCode, statusMessage, headers, bodyData };
}

async function tcpRequest(request: RequestData) {
	// Essentially we're going to be proxying these requests to Mojang's APIs
	const url = new URL((request.host ?? 'https://api.minecraftservices.com/') + request.path);
	if (request.query) {
		url.search = new URLSearchParams(request.query).toString();
	}

	try {
		const socket = await connect({
			hostname: url.hostname,
			port: 443
		}, {
			secureTransport: 'on',
			allowHalfOpen: false,
		});

		const writer = socket.writable.getWriter();
		const encoder = new TextEncoder();
		const rawHTTPReq = [
			`GET ${url.pathname}${url.search} HTTP/1.1`,
			`Host: ${url.hostname}`,
			`Accept: application/json`,
			'Connection: close',
		].join('\r\n');
		const encoded = encoder.encode(`${rawHTTPReq}\r\n\r\n\r\n`);
		await writer.write(encoded);

		const reader = socket.readable.getReader();
		const decoder = new TextDecoder();

		// loop and append
		let result = '';
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			result += decoder.decode(value);
		}
		const parsed = parseResponse(result);
		if (parsed.statusCode === 429) {
			// Man how did we get rate limited on raw TCP?
			throw new Error('Rate limited');
		}
		let body = null;
		try {
			body = JSON.parse(parsed.bodyData);
		} catch {
			// Whatevs
		}
		if (parsed.statusCode === 404) {
			throw new Error('Not found');
		}
		if (parsed.statusCode === 204 && !body) {
			// Bad request
			throw new Error('Bad request');
		}
		if (parsed.statusCode !== 200) {
			// Log the body
			console.log(parsed.bodyData);
			throw new Error('Unknown error');
		}
		const contentType = parsed.headers['content-type'];
		if (!contentType || !contentType.includes('json')) {
			throw new Error('Invalid content type');
		}
		body.request_type = 'tcp';
		return {
			body,
			headers: parsed.headers,
		}
	} catch (err) {
		console.error(err);
		return null;
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		// Add basic caching. Realistically we only want to cache for an hour or so
		const cache = caches.default;
		const cached = await cache.match(request);
		if (cached) {
			return cached;
		}

		// First off see what the first path is, this'll determine which host we're proxying to
		const url = new URL(request.url);
		const pathParts = url.pathname.split('/').slice(1);
		const host = pathParts[0];

		if (pathParts.length === 0) {
			// Return a bad request
			return new Response('Bad Request', { status: 400 });
		}
		// If all the parts are blank strings, return a guide on how to use this
		if (pathParts.every(part => part === '')) {
			// Send our guide html
			return new Response(html, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
				},
			});
		}

		if (!HOSTS[host]) {
			return new Response('Bad Request', { status: 400 });
		}

		const hostUrl = HOSTS[host];

		// Build our request data
		const requestData: RequestData = {
			host: hostUrl,
			path: pathParts.slice(1).join('/'),
			query: Object.fromEntries(url.searchParams.entries()),
			method: request.method,
		}

		// Create our TCP request
		const tcpResponse = await tcpRequest(requestData);
		if (!tcpResponse) {
			return new Response('Internal Server Error', { status: 500 });
		}
		// For now just return data we grab
		const response = new Response(JSON.stringify(tcpResponse.body), {
			headers: tcpResponse.headers,
		});
		await cache.put(request, response.clone());
		return response;
	},
} satisfies ExportedHandler<Env>;
