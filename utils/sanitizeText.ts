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
