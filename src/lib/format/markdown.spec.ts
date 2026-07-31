import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';

describe('renderMarkdown', () => {
	it('renders the supported CommonMark subset', () => {
		const html = renderMarkdown(`# Heading

**bold** and _emphasis_ with ~~deleted~~ text.

> Quote

- one
- two

| Left | Right |
| --- | --- |
| A | B |

[docs](https://example.com/docs) and \`code\`.

\`\`\`ts
const answer = 42;
\`\`\``);

		expect(html).toContain('<h1>Heading</h1>');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>emphasis</em>');
		expect(html).toContain('<s>deleted</s>');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<ul>');
		expect(html).toContain('<table>');
		expect(html).toContain('<code>code</code>');
		expect(html).toContain('<pre><code>const answer = 42;\n</code></pre>');
		expect(html).toContain(
			'<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">docs</a>'
		);
	});

	it('renders raw HTML, scripts, event handlers, and code as literal text', () => {
		const html = renderMarkdown(
			'<b>not bold</b>\n\n<img src=x onerror="alert(1)">\n\n`<script>alert(1)</script>`'
		);

		expect(html).toContain('&lt;b&gt;not bold&lt;/b&gt;');
		expect(html).toContain('&lt;img src=x onerror="alert(1)"&gt;');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<img');
		expect(html).not.toContain('<b>not bold</b>');
	});

	it('removes unsafe and encoded protocol-bypass URLs', () => {
		const html = renderMarkdown(
			'[javascript](javascript:alert(1)) [encoded](java&#x73;cript:alert(1)) [data](data:text/html;base64,WA==) [safe](/docs) [hash](#section) [mail](mailto:test@example.com)'
		);

		expect(html).not.toMatch(/href="(?:javascript|data):/i);
		expect(html).not.toContain('href="java&#x73;cript:');
		expect(html).toContain('<a href="/docs">safe</a>');
		expect(html).toContain('<a href="#section">hash</a>');
		expect(html).toContain(
			'<a href="mailto:test@example.com" target="_blank" rel="noopener noreferrer">mail</a>'
		);
	});

	it('safely renders malformed streamed Markdown without retaining stale output', () => {
		const incomplete = renderMarkdown('Before\n\n```ts\nconst incomplete = true;');
		const complete = renderMarkdown('After');

		expect(incomplete).toContain('<pre><code>');
		expect(incomplete).toContain('const incomplete = true;');
		expect(complete).toBe('<p>After</p>\n');
	});
});
