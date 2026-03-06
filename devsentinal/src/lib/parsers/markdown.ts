import { marked } from 'marked';

export async function parseMarkdown(text: string): Promise<string> {
  // Convert markdown to HTML, then strip all HTML tags to get plain text
  const html = await marked(text);

  const plainText = html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return plainText;
}
