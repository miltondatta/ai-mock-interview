// Job descriptions are usually pasted straight from a job board or a Word
// doc, which drags along bullet glyphs, smart quotes/dashes, non-breaking
// spaces, and inconsistent line endings. None of that is invalid as JSON
// (axios escapes it fine), but it can still trip up a downstream prompt
// template or markdown-sensitive parsing in the n8n workflow, so normalize
// it to plain ASCII text before it ever leaves this app.
export function sanitizeFreeText(input: string): string {
    return input
        .replace(/\r\n?/g, "\n")
        // Smart quotes -> straight quotes.
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„‟]/g, '"')
        // En/em dashes -> hyphen, ellipsis glyph -> three dots.
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        // Non-breaking/other unicode spaces -> plain space.
        .replace(/[  -​]/g, " ")
        // Bullet glyphs (*, -, •, ‣, ◦) at the start of a line -> a plain "- ".
        .replace(/^[ \t]*[*•‣◦][ \t]+/gm, "- ")
        // Collapse runs of 3+ blank lines down to one.
        .replace(/\n{3,}/g, "\n\n")
        // Trim trailing whitespace on each line, then overall.
        .replace(/[ \t]+$/gm, "")
        .trim();
}

export interface SanitizeCandidateTextOptions {
    // Collapse everything onto one line (job titles, names, etc.).
    singleLine?: boolean;
    // Truncate the cleaned text to this many characters.
    maxLength?: number;
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
    nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
    lt: "<", gt: ">", quot: '"', apos: "'",
    lsquo: "'", rsquo: "'", sbquo: "'", ldquo: '"', rdquo: '"', bdquo: '"',
    ndash: "-", mdash: "-", minus: "-", hellip: "...",
    bull: "-", middot: "-", trade: "TM", copy: "(c)", reg: "(R)",
    shy: "", zwj: "", zwnj: "",
};

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&#(\d{1,7});/g, (match, dec: string) => codePointToString(Number(dec)) ?? match)
        .replace(/&#x([0-9a-f]{1,6});/gi, (match, hex: string) => codePointToString(parseInt(hex, 16)) ?? match)
        .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_HTML_ENTITIES[name.toLowerCase()] ?? match)
        // Last, so "&amp;lt;" decodes to the literal text "&lt;" rather than "<".
        .replace(/&amp;/gi, "&");
}

function codePointToString(codePoint: number): string | undefined {
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return undefined;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return undefined;
    return String.fromCodePoint(codePoint);
}

// Text pasted from a web page's source, an email client or a rich-text editor
// can arrive as HTML. Keep its structure (paragraphs, list items, line breaks)
// as plain-text line breaks and drop the markup.
function htmlToText(text: string): string {
    if (!HTML_TAG.test(text)) return text;
    return text
        .replace(/<(script|style|head|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<\/?(p|div|section|article|header|footer|ul|ol|li|tr|table|h[1-6]|blockquote|pre)\b[^>]*>/gi, "\n")
        .replace(/<\/t[dh]\s*>/gi, " ")
        .replace(/<[^>]+>/g, "");
}

// Line-start glyphs that act as list bullets: ASCII * + -, typographic
// bullets/arrows/check marks, and Word's Symbol-font bullets, which paste as
// private-use characters (e.g. U+F0B7).
// ASCII markers need a following space so "*args" or "+1 555" aren't touched.
const BULLET_AT_LINE_START = new RegExp(
    "^[ \\t]*(?:[*+-][ \\t]+|[\\u2022\\u2023\\u2043\\u2219\\u00B7\\u25AA\\u25AB\\u25A0\\u25A1\\u25CF\\u25CB\\u25C6\\u25C7\\u25BA\\u25B8\\u25B9\\u2192\\u2794\\u27A2\\u27A4\\u2713\\u2714\\u2717\\u2718\\u2705\\u274C\\uE000-\\uF8FF][ \\t]*)",
    "gmu"
);

// Built with new RegExp: lookbehind and \p{} need an ES2018 target, which
// TypeScript enforces for regex literals (tsconfig targets ES2017); Node
// supports both at runtime. The surrogate check runs on UTF-16 code units, so
// it deliberately has no "u" flag.
const LONE_SURROGATE = new RegExp("[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]", "g");
const EMOJI = new RegExp("(?![\\u00A9\\u00AE])\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}\\uFE0E\\uFE0F]", "gu");

// Only treat the text as HTML when it contains real HTML tags, so plain-text
// placeholders like "<Company Name>" or "List<T>" are left alone.
const HTML_TAG = /<\/?(p|br|div|span|li|ul|ol|h[1-6]|strong|b|i|em|u|a|font|table|tbody|thead|tr|td|th|section|article|header|footer|blockquote|pre|code)\b[^>]*>/i;

// Generic cleaner for any free text a candidate sends (job descriptions, job
// titles, notes), whatever it was copied from: web pages or raw HTML, Word/PDF,
// Markdown, email, chat apps. It keeps the meaning and the line structure but
// normalizes everything else to plain, prompt-safe text:
//   - Unicode compatibility forms (full-width letters, ligatures) -> standard text
//   - HTML markup and entities -> plain text with line breaks
//   - every line-ending style -> "\n"; tabs and exotic spaces -> " "
//   - invisible/control characters, lone surrogates and emoji removed
//   - smart quotes, dashes, ellipses -> ASCII; any bullet style -> "- "
//   - Markdown headings, bold markers and links -> plain text
//   - repeated spaces and blank lines collapsed, lines trimmed
// Letters in any script (accents, Bengali, CJK, ...) are preserved.
export function sanitizeCandidateText(input: unknown, options: SanitizeCandidateTextOptions = {}): string {
    if (typeof input !== "string" || !input) return "";

    let text = input.normalize("NFKC");
    text = htmlToText(text);
    text = decodeHtmlEntities(text);

    text = text
        // CRLF, CR, NEL, Unicode line/paragraph separators, form feed, vertical tab.
        .replace(/\r\n?|[\u0085\u2028\u2029\f\v]/g, "\n")
        // Zero-width characters, word joiner, BOM, soft hyphen, bidi controls.
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD]/g, "")
        // Remaining C0/C1 control characters (newline and tab are kept for now).
        .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, "")
        // Lone surrogate halves from a broken copy can make the JSON invalid.
        .replace(LONE_SURROGATE, "")
        // Tabs and exotic spaces -> plain space.
        .replace(/[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
        // Smart quotes and primes -> straight quotes.
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
        // Hyphen/dash variants and the minus sign -> "-".
        .replace(/[\u2010-\u2015\u2212\uFE58\uFE63]/g, "-")
        .replace(/\u2026/g, "...")
        // Any bullet style at the start of a line -> "- ".
        .replace(BULLET_AT_LINE_START, "- ")
        // Emoji (and their skin-tone / variation-selector parts) elsewhere -> removed.
        // Copyright/registered signs are Extended_Pictographic too, so keep them.
        .replace(EMOJI, "")
        // Leftover private-use glyphs (icon fonts) that weren't bullets.
        .replace(/[\uE000-\uF8FF]/g, "")
        // Markdown: headings, bold markers, links -> plain text.
        .replace(/^[ ]*#{1,6}[ ]+/gm, "")
        .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, "$1")
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
        // Collapse runs of spaces, then trim every line.
        .replace(/ {2,}/g, " ")
        .replace(/^ +| +$/gm, "")
        // Collapse runs of 3+ newlines down to one blank line.
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    if (options.singleLine) {
        text = text.replace(/\s*\n+\s*/g, " ").replace(/^- /, "");
    }
    if (options.maxLength !== undefined && text.length > options.maxLength) {
        text = text.slice(0, options.maxLength).trimEnd();
    }
    return text;
}
