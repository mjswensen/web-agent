import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const externalLink = /^(?:https?:|mailto:)/i;

const markdown = new MarkdownIt({
	html: false,
	linkify: false,
	typographer: false
});

const defaultLinkOpen = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
	const token = tokens[index];
	const href = token.attrGet('href');
	if (href && externalLink.test(href)) {
		token.attrSet('target', '_blank');
		token.attrSet('rel', 'noopener noreferrer');
	}
	return defaultLinkOpen
		? defaultLinkOpen(tokens, index, options, environment, renderer)
		: renderer.renderToken(tokens, index, options);
};

const sanitizerOptions: sanitizeHtml.IOptions = {
	allowedTags: [
		'a',
		'blockquote',
		'br',
		'code',
		'del',
		'em',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'hr',
		'li',
		'ol',
		'p',
		'pre',
		's',
		'strong',
		'table',
		'tbody',
		'td',
		'th',
		'thead',
		'tr',
		'ul'
	],
	allowedAttributes: {
		a: ['href', 'rel', 'target']
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	allowProtocolRelative: false
};

/** Renders the supported Markdown subset as sanitized HTML safe for Svelte {@html}. */
export function renderMarkdown(source: string): string {
	return sanitizeHtml(markdown.render(source), sanitizerOptions);
}
