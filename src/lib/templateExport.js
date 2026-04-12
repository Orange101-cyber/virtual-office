import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel,
  WidthType, BorderStyle, AlignmentType, ShadingType,
} from 'docx';

const BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
};

function cell(text, opts = {}) {
  const { bold = false, shading = null, width = 50, color = '000000', size = 20 } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: shading ? { type: ShadingType.CLEAR, color: 'auto', fill: shading } : undefined,
    borders: BORDER,
    children: Array.isArray(text)
      ? text.map(t => typeof t === 'string'
          ? new Paragraph({ children: [new TextRun({ text: t, bold, color, size })] })
          : t)
      : [new Paragraph({ children: [new TextRun({ text: text || '', bold, color, size })] })],
  });
}

function labelCell(text) {
  return cell(text, { bold: true, shading: 'F3F3F3', width: 30, size: 20 });
}

function valueCell(text, opts = {}) {
  return cell(text, { width: 70, size: 20, ...opts });
}

function makeRow(label, value) {
  return new TableRow({ children: [labelCell(label), valueCell(value)] });
}

function generateSlug(title, keyword) {
  const base = keyword || title || '';
  return base.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseBodyParagraphs(content) {
  if (!content) return [new Paragraph('')];
  const lines = content.split('\n');
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return new Paragraph('');

    // Detect H1 (first non-empty line or starts with # )
    if (trimmed.startsWith('# ')) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: trimmed.replace(/^# /, ''), bold: true, size: 32 })],
      });
    }
    if (trimmed.startsWith('## ')) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: trimmed.replace(/^## /, ''), bold: true, size: 28 })],
      });
    }
    if (trimmed.startsWith('### ')) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: trimmed.replace(/^### /, ''), bold: true, size: 24 })],
      });
    }
    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      return new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: trimmed.replace(/^[-*•]\s/, ''), size: 22 })],
      });
    }
    // CTA buttons in brackets
    if (trimmed.startsWith('[CTA') || trimmed.match(/\[CTA Button/i)) {
      return new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, color: 'DC2626', size: 22 })],
      });
    }
    // Regular paragraph
    return new Paragraph({
      children: [new TextRun({ text: trimmed, size: 22 })],
    });
  });
}

function buildChecklistTable() {
  const rows = [
    // Header row
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: 'Internal CYL Checklist', bold: true, size: 22 })] })],
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
          width: { size: 20, type: WidthType.PERCENTAGE },
          borders: BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: 'Approved by (Admin)', bold: true, size: 18 })] })],
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
          width: { size: 15, type: WidthType.PERCENTAGE },
          borders: BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: '', bold: true, size: 18 })] })],
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
          width: { size: 15, type: WidthType.PERCENTAGE },
          borders: BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: 'Date', bold: true, size: 18 })] })],
        }),
      ],
    }),
  ];

  // Checklist items
  const items = [
    'Trello Card (Web Development)',
    "Client Bucketlist: Client's Bucket lists",
    'SEO Checklist: SEO List of Priorities',
  ];
  items.forEach(label => {
    rows.push(new TableRow({
      children: [
        cell(label, { width: 50, size: 20 }),
        cell('Make a selection', { width: 20, size: 18, color: '888888' }),
        cell('', { width: 15 }),
        cell('', { width: 15 }),
      ],
    }));
  });

  // Final confirmation header
  rows.push(new TableRow({
    children: [
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
        width: { size: 50, type: WidthType.PERCENTAGE },
        borders: BORDER,
        children: [new Paragraph({ children: [new TextRun({ text: 'Final confirmation', bold: true, size: 22 })] })],
      }),
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
        width: { size: 20, type: WidthType.PERCENTAGE },
        borders: BORDER,
        children: [new Paragraph({ children: [new TextRun({ text: 'Approved by (Admin)', bold: true, size: 18 })] })],
      }),
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
        width: { size: 15, type: WidthType.PERCENTAGE },
        borders: BORDER,
        children: [new Paragraph('')],
      }),
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
        width: { size: 15, type: WidthType.PERCENTAGE },
        borders: BORDER,
        children: [new Paragraph({ children: [new TextRun({ text: 'Date', bold: true, size: 18 })] })],
      }),
    ],
  }));

  // Final items
  const finalItems = [
    'FOR LLP: Has the link been added to the menu?',
    'I confirm that all items above are complete and I have published the page.',
  ];
  finalItems.forEach(label => {
    rows.push(new TableRow({
      children: [
        cell(label, { width: 50, size: 20 }),
        cell('Make a selection', { width: 20, size: 18, color: '888888' }),
        cell('', { width: 15 }),
        cell('', { width: 15 }),
      ],
    }));
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

export async function exportToTemplate({ fields, clientName = 'Client', brief = null }) {
  const title = fields.article_title || '[Title]';
  const fk = fields.focus_keyphrase || '[focus keyphrase]';
  const metaDesc = fields.meta_description || '[Meta description]';
  const url = fields.url || '';
  const secondaryKeywords = (fields.secondary_keywords || '').split(',').map(k => k.trim()).filter(Boolean);
  const seoTitle = fields.seo_title || title;
  const slug = url || `https://example.com/${generateSlug(title, fk)}/`;

  // Build SEO data table (top of doc)
  const dataTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      makeRow('Is this an existing blog/LLP?', 'No'),
      makeRow('What type of content is this?', 'BLOG - NEW'),
      makeRow('SEO Title', seoTitle),
      new TableRow({
        children: [
          labelCell('Keywords list'),
          valueCell([
            new Paragraph({ children: [new TextRun({ text: 'The general rule of thumb is to use three to four keywords per post. That should be one head or main keyword, and a few long tail keywords (or at least variations of the main keyword).', size: 18, color: '666666' })] }),
            new Paragraph({ children: [new TextRun({ text: '' })] }),
            new Paragraph({ children: [new TextRun({ text: 'Note: A good keyword density is between 1-2%. If your keyword density is too high, Google may penalise your blog post for keyword stuffing.', size: 18, color: '666666' })] }),
            new Paragraph({ children: [new TextRun({ text: '' })] }),
            new Paragraph({ children: [new TextRun({ text: 'Check here: https://www.seoreviewtools.com/keyword-density-checker/?text-input', size: 18, color: '0066CC' })] }),
            new Paragraph({ children: [new TextRun({ text: '' })] }),
            ...secondaryKeywords.map(kw => new Paragraph({ children: [new TextRun({ text: kw, size: 20 })] })),
          ]),
        ],
      }),
      makeRow('Main Keywords / Focus keyphrase', `FK: ${fk}`),
      makeRow('Target Audience', brief?.audience_brief || ''),
      new TableRow({
        children: [
          labelCell('Meta description'),
          valueCell([
            new Paragraph({ children: [new TextRun({ text: 'If page is existing add current description', italics: true, size: 18, color: '888888' })] }),
            new Paragraph({ children: [new TextRun({ text: metaDesc, size: 20 })] }),
          ]),
        ],
      }),
      makeRow('Slug URL', `NEW Slug: ${slug}`),
      makeRow('Does this need a redirect of the old link to a new link?', 'No'),
      new TableRow({
        children: [
          labelCell('CTA Links for buttons on page'),
          valueCell(
            (brief?.cta_links || ['https://example.com/contact/']).map(link =>
              new Paragraph({ children: [new TextRun({ text: `[CTA Button: ${brief?.cta_recommendation || 'Contact Us'} | LINK: ${link}]`, bold: true, color: 'DC2626', size: 20 })] })
            )
          ),
        ],
      }),
      new TableRow({
        children: [
          labelCell('Social Post Text'),
          valueCell([
            new Paragraph({ children: [new TextRun({ text: 'FACEBOOK', bold: true, size: 20 })] }),
            new Paragraph({ children: [new TextRun({ text: brief?.social_posts?.facebook || '[Facebook post copy to be written]', size: 20 })] }),
            new Paragraph({ children: [new TextRun({ text: '' })] }),
            new Paragraph({ children: [new TextRun({ text: 'INSTAGRAM', bold: true, size: 20 })] }),
            new Paragraph({ children: [new TextRun({ text: brief?.social_posts?.instagram || '[Instagram post copy to be written]', size: 20 })] }),
          ]),
        ],
      }),
      makeRow('Airtable Link', ''),
    ],
  });

  // Build the document
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 22 } },
      },
    },
    sections: [
      {
        children: [
          // Main header
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({
              text: `${clientName} - Blog - NEW: ${title}`,
              bold: true,
              size: 32,
            })],
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),

          // Top data table
          dataTable,

          // Spacer
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),

          // Body heading
          new Paragraph({
            children: [new TextRun({ text: 'Body:', bold: true, size: 24 })],
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),

          // Title of article
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: title, bold: true, size: 32 })],
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),

          // Table of contents placeholder
          new Paragraph({
            children: [new TextRun({ text: 'Table of Contents', bold: true, size: 22 })],
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),

          // Article body paragraphs
          ...parseBodyParagraphs(fields.article_content || ''),

          // Spacer before checklist
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),

          // CYL Checklist
          buildChecklistTable(),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

export async function downloadTemplateFile(fields, clientName = 'Client', fileName = null) {
  const blob = await exportToTemplate({ fields, clientName });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || `${clientName} - ${(fields.article_title || 'Article').replace(/[^a-zA-Z0-9 -]/g, '').substring(0, 60)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
