import { PDFParse } from 'pdf-parse';

export async function parsePDF(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText({ pageJoiner: '\n' });
    const text = result.text;

    // Clean up: normalize whitespace, remove null chars and binary artifacts
    return text
      .replace(/\0/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } finally {
    await parser.destroy();
  }
}
