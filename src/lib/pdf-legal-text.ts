/** Texto informado pelo admin, já sem as tags do editor. */
const legalTextOf = (quote: any): string =>
  htmlToPlainText(String(quote?.template?.legal_text ?? quote?.legal_text ?? ''));

type InlineRun = { text: string; bold: boolean; italic: boolean; underline: boolean };
type TextBlock = { runs: InlineRun[]; size: number; gap: number; align: 'left' | 'center' | 'right'; indent: number; bullet?: string };

export const decodeEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');

export const htmlToPlainText = (html: string): string =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  ).replace(/\n{3,}/g, '\n\n').trim();

/**
 * Converte o HTML do editor em blocos com runs inline. O jsPDF não tem
 * renderizador de HTML confiável, então o desenho é feito manualmente.
 */
export const htmlToBlocks = (html: string, baseSize: number): TextBlock[] => {
  const source = String(html || '');
  if (!source.trim()) return [];

  const normalized = source
    .replace(/<h1[^>]*>/gi, '\n@@H|h1|@@')
    .replace(/<h2[^>]*>/gi, '\n@@H|h2|@@')
    .replace(/<h[1-3][^>]*>/gi, '\n@@H|h3|@@')
    .replace(/<\/[h][1-3]>/gi, '\n@@END@@')
    .replace(/<li[^>]*>/gi, '\n@@LI@@')
    .replace(/<\/li>/gi, '\n@@ENDLI@@')
    .replace(/<p[^>]*>/gi, '\n@@P@@')
    .replace(/<\/p>/gi, '\n@@END@@')
    .replace(/<br\s*\/?>/gi, '\n@@BR@@')
    .replace(/<(strong|b)[^>]*>/gi, '**')
    .replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)[^>]*>/gi, '__')
    .replace(/<\/(em|i)>/gi, '__')
    .replace(/<u[^>]*>/gi, '~~')
    .replace(/<\/u>/gi, '~~')
    .replace(/<[^>]*>/g, '');

  const blocks: TextBlock[] = [];
  let runs: InlineRun[] = [];
  let size = baseSize;
  let gap = 2;
  let indent = 0;
  let bullet: string | undefined;
  let listCounter = 0;

  const flush = () => {
    const text = runs.map((r) => r.text).join('');
    if (text.trim()) blocks.push({ runs: runs.slice(), size, gap, align: 'left', indent, bullet });
    runs = [];
  };
  const reset = () => {
    size = baseSize;
    gap = 2;
    indent = 0;
    bullet = undefined;
  };
  const push = (text: string, bold: boolean, italic: boolean, underline: boolean) => {
    if (text) runs.push({ text, bold, italic, underline });
  };
  const inline = (text: string) => {
    const parts = text.split(/(\*\*|__|~~)/);
    let bold = false;
    let italic = false;
    let underline = false;
    for (const part of parts) {
      if (part === '**') { bold = !bold; continue; }
      if (part === '__') { italic = !italic; continue; }
      if (part === '~~') { underline = !underline; continue; }
      push(decodeEntities(part), bold, italic, underline);
    }
  };

  for (const raw of normalized.split('\n')) {
    let segment = raw;
    if (segment.startsWith('@@H|')) {
      flush(); reset();
      const end = segment.indexOf('|', 4);
      const tag = segment.slice(4, end);
      size = tag === 'h1' ? baseSize + 3 : tag === 'h2' ? baseSize + 2 : baseSize + 1;
      gap = 1;
      segment = segment.slice(end + 3);
    } else if (segment.startsWith('@@LI@@')) {
      flush(); reset();
      listCounter += 1;
      indent = 1;
      bullet = `${listCounter}.`;
      segment = segment.slice('@@LI@@'.length);
    } else if (segment === '@@END@@' || segment === '@@ENDLI@@') {
      flush(); reset();
      if (segment === '@@ENDLI@@') listCounter = 0;
      continue;
    } else if (segment === '@@P@@') {
      continue;
    }

    if (!segment) continue;
    if (segment.includes('@@BR@@')) {
      segment.split('@@BR@@').forEach((part, index) => {
        if (index > 0) push('\n', false, false, false);
        inline(part);
      });
    } else {
      inline(segment);
    }
  }
  flush();
  return blocks;
};

/** Desenha os blocos do editor, com quebra de página automática. */
export const drawLegalBlocks = (
  doc: any,
  blocks: TextBlock[],
  x: number,
  y: number,
  width: number,
  pageHeight: number,
  color: [number, number, number]
): number => {
  let cursor = y;
  const scale = base => base / 8;
  const lineGap = 1.25;

  for (const block of blocks) {
    const indentWidth = block.indent * 5;
    const usable = width - indentWidth;
    const factor = scale(block.size);

    // Quebra o texto em linhas preservando a formatação de cada trecho.
    const lines: InlineRun[][] = [[]];
    let current = '';
    const flushCurrent = () => {
      if (current) {
        lines[lines.length - 1].push({ text: current, bold: false, italic: false, underline: false });
        current = '';
      }
    };
    for (const run of block.runs) {
      doc.setFont('helvetica', run.bold ? 'bold' : run.italic ? 'italic' : 'normal');
      doc.setFontSize(block.size);
      const chunks = run.text.split(/(\n)/);
      for (const chunk of chunks) {
        if (chunk === '\n') { flushCurrent(); lines.push([]); continue; }
        const words = chunk.split(' ');
        for (let i = 0; i < words.length; i += 1) {
          const word = words[i];
          const candidate = current ? `${current} ${word}` : word;
          if (current && doc.getTextWidth(candidate) * factor > usable) {
            flushCurrent();
            lines.push([]);
            current = word;
          } else {
            current = candidate;
          }
        }
        // Preserva o espaço entre palavras exatamente como veio do texto.
        if (i < words.length - 1) current += ' ';
      }
    }
    flushCurrent();

    for (const line of lines) {
      const lineHeight = block.size * lineGap * 0.45;
      if (cursor + lineHeight > pageHeight - 18) { doc.addPage(); cursor = 20; }
      let lineX = x + indentWidth;
      for (const run of line) {
        if (!run.text) continue;
        doc.setFont('helvetica', run.bold ? 'bold' : run.italic ? 'italic' : 'normal');
        doc.setFontSize(block.size);
        doc.setTextColor(...color);
        doc.text(run.text, lineX, cursor);
        if (run.underline) {
          const w = doc.getTextWidth(run.text) * factor;
          doc.setDrawColor(...color);
          doc.line(lineX, cursor + 0.8, lineX + w, cursor + 0.8);
        }
        lineX += doc.getTextWidth(run.text) * factor;
      }
      cursor += lineHeight;
    }
    cursor += block.gap;
  }
  return cursor;
};
