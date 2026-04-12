import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel,
  WidthType, BorderStyle, AlignmentType, ShadingType, PageOrientation,
} from 'docx';

// ── Page / table geometry ──
// US Letter page width = 12240 twips, margins 1440 each side → usable 9360 twips.
const PAGE_WIDTH = 12240;
const PAGE_MARGIN = 1440;
const USABLE_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2; // 9360 twips

// 2-column data table: label 30% / value 70%
const LABEL_W = Math.round(USABLE_WIDTH * 0.30); // 2808
const VALUE_W = USABLE_WIDTH - LABEL_W;           // 6552
const DATA_COLS = [LABEL_W, VALUE_W];

// 4-column checklist table: 50 / 20 / 15 / 15
const CHK_C1 = Math.round(USABLE_WIDTH * 0.50); // 4680
const CHK_C2 = Math.round(USABLE_WIDTH * 0.20); // 1872
const CHK_C3 = Math.round(USABLE_WIDTH * 0.15); // 1404
const CHK_C4 = USABLE_WIDTH - CHK_C1 - CHK_C2 - CHK_C3;
const CHECK_COLS = [CHK_C1, CHK_C2, CHK_C3, CHK_C4];

const BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
};

function runsFromText(text, { bold = false, color = '000000', size = 20, italics = false } = {}) {
  return [new TextRun({ text: text || '', bold, color, size, italics })];
}

function para(text, opts = {}) {
  return new Paragraph({ children: runsFromText(text, opts) });
}

// NOTE: We intentionally do NOT set cell widths. The `columnWidths` on the
// Table level produces a <w:tblGrid> which Word, LibreOffice, and Google Docs
// all respect for column sizing. Setting <w:tcW> on individual cells
// sometimes confuses Google Docs and produces the collapsed 1-char column bug.
function cell(children, { shading = null, align } = {}) {
  const paragraphs = Array.isArray(children)
    ? children.map(c => (typeof c === 'string' ? para(c) : c))
    : [typeof children === 'string' ? para(children) : children];
  return new TableCell({
    shading: shading ? { type: ShadingType.CLEAR, color: 'auto', fill: shading } : undefined,
    borders: BORDER,
    children: paragraphs,
    ...(align ? { verticalAlign: align } : {}),
  });
}

function labelCell(text) {
  return cell(
    [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] })],
    { shading: 'F3F3F3' }
  );
}

function valueCell(children) {
  const arr = Array.isArray(children) ? children : [children];
  const paragraphs = arr.map(c =>
    typeof c === 'string'
      ? new Paragraph({ children: [new TextRun({ text: c, size: 20 })] })
      : c
  );
  return cell(paragraphs);
}

function makeRow(label, value) {
  return new TableRow({ children: [labelCell(label), valueCell(value || '')] });
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
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      return new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: trimmed.replace(/^[-*•]\s/, ''), size: 22 })],
      });
    }
    if (trimmed.startsWith('[CTA') || trimmed.match(/\[CTA Button/i)) {
      return new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, color: 'DC2626', size: 22 })],
      });
    }
    return new Paragraph({
      children: [new TextRun({ text: trimmed, size: 22 })],
    });
  });
}

// ── Checklist table (4 columns) ──
// No cell widths — we rely on columnWidths on the Table for <w:tblGrid>.
function chkCell(children, { shading = null, bold = false, color = '000000', size = 20 } = {}) {
  const arr = Array.isArray(children) ? children : [children];
  const paragraphs = arr.map(c =>
    typeof c === 'string'
      ? new Paragraph({ children: [new TextRun({ text: c, bold, color, size })] })
      : c
  );
  return new TableCell({
    shading: shading ? { type: ShadingType.CLEAR, color: 'auto', fill: shading } : undefined,
    borders: BORDER,
    children: paragraphs,
  });
}

function buildChecklistTable() {
  const headerShade = 'F3F3F3';
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        chkCell('Internal CYL Checklist', { shading: headerShade, bold: true, size: 22 }),
        chkCell('Approved by (Admin)', { shading: headerShade, bold: true, size: 18 }),
        chkCell('', { shading: headerShade }),
        chkCell('Date', { shading: headerShade, bold: true, size: 18 }),
      ],
    }),
  ];

  const items = [
    'Trello Card (Web Development)',
    "Client Bucketlist: Client's Bucket lists",
    'SEO Checklist: SEO List of Priorities',
  ];
  items.forEach(label => {
    rows.push(new TableRow({
      children: [
        chkCell(label, { size: 20 }),
        chkCell('Make a selection', { size: 18, color: '888888' }),
        chkCell(''),
        chkCell(''),
      ],
    }));
  });

  rows.push(new TableRow({
    children: [
      chkCell('Final confirmation', { shading: headerShade, bold: true, size: 22 }),
      chkCell('Approved by (Admin)', { shading: headerShade, bold: true, size: 18 }),
      chkCell('', { shading: headerShade }),
      chkCell('Date', { shading: headerShade, bold: true, size: 18 }),
    ],
  }));

  const finalItems = [
    'FOR LLP: Has the link been added to the menu?',
    'I confirm that all items above are complete and I have published the page.',
  ];
  finalItems.forEach(label => {
    rows.push(new TableRow({
      children: [
        chkCell(label, { size: 20 }),
        chkCell('Make a selection', { size: 18, color: '888888' }),
        chkCell(''),
        chkCell(''),
      ],
    }));
  });

  return new Table({
    width: { size: USABLE_WIDTH, type: WidthType.DXA },
    columnWidths: CHECK_COLS,
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

  // ── Top SEO data table ──
  const dataTable = new Table({
    width: { size: USABLE_WIDTH, type: WidthType.DXA },
    columnWidths: DATA_COLS,
    rows: [
      makeRow('Is this an existing blog/LLP?', 'No'),
      makeRow('What type of content is this?', 'BLOG - NEW'),
      makeRow('SEO Title', seoTitle),
      new TableRow({
        children: [
          labelCell('Keywords list'),
          valueCell([
            new Paragraph({ children: [new TextRun({ text: 'The general rule of thumb is to use three to four keywords per post. That should be one head or main keyword, and a few long tail keywords (or at least variations of the main keyword).', size: 18, color: '666666' })] }),
            new Paragraph(''),
            new Paragraph({ children: [new TextRun({ text: 'Note: A good keyword density is between 1-2%. If your keyword density is too high, Google may penalise your blog post for keyword stuffing.', size: 18, color: '666666' })] }),
            new Paragraph(''),
            new Paragraph({ children: [new TextRun({ text: 'Check here: https://www.seoreviewtools.com/keyword-density-checker/?text-input', size: 18, color: '0066CC' })] }),
            new Paragraph(''),
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
            new Paragraph(''),
            new Paragraph({ children: [new TextRun({ text: 'INSTAGRAM', bold: true, size: 20 })] }),
            new Paragraph({ children: [new TextRun({ text: brief?.social_posts?.instagram || '[Instagram post copy to be written]', size: 20 })] }),
          ]),
        ],
      }),
      makeRow('Airtable Link', ''),
    ],
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_WIDTH,
              height: 15840, // 11" in twips
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
            },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({
              text: `${clientName} - Blog - NEW: ${title}`,
              bold: true,
              size: 32,
              color: '1F4E79',
            })],
          }),
          new Paragraph(''),

          dataTable,

          new Paragraph(''),
          new Paragraph(''),
          new Paragraph(''),

          new Paragraph({ children: [new TextRun({ text: 'Body:', bold: true, size: 24 })] }),
          new Paragraph(''),

          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: title, bold: true, size: 32 })],
          }),
          new Paragraph(''),

          new Paragraph({ children: [new TextRun({ text: 'Table of Contents', bold: true, size: 22 })] }),
          new Paragraph(''),

          ...parseBodyParagraphs(fields.article_content || ''),

          new Paragraph(''),
          new Paragraph(''),

          buildChecklistTable(),

          // Terminating paragraph — required after a table so sectPr is valid
          new Paragraph(''),
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
