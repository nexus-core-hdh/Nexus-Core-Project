import { Injectable, Optional } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { Alignment, Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ReportResult } from './report-builder.service';
import type { ReportSection } from './work-order-order-form.report';
import { UploadService } from '../upload/upload.service';

// pdfmake's server-side printer has no ES module export.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake');

export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ExportedFile {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** When the report was generated, in the server's local time (data dates above stay UTC calendar days). */
const formatGenerated = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatNumber = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** One cell as display text — shared by CSV and PDF so both read the same. */
function displayValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return '';
  if (type === 'date') return formatDate(String(value));
  if (type === 'boolean') return value ? 'Yes' : 'No';
  // A stored picture (e.g. Style Picture): drawn in PDF / Excel, no text form (CSV leaves it empty).
  if (type === 'image') return '';
  if (type === 'number' && typeof value === 'number') return formatNumber(value);
  return String(value);
}

// PDFKit's built-in standard fonts — no font files needed on the server.
const printer = new PdfPrinter({
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
});

type SectionColumn = ReportSection['columns'][number];
/** A section cell's type / decimals / alignment — a 'fields' (header) row carries its own. */
const cellSpec = (section: ReportSection, row: Record<string, unknown>, col: SectionColumn) => {
  const isField = (section.layout === 'fields' || section.layout === 'inline') && col.key === 'value';
  const type = isField ? String(row.type ?? 'string') : col.type;
  const decimals = (isField ? row.decimals : col.decimals) as number | null | undefined;
  // Header field values read left like the rest of the header; table numbers default to the right.
  const align = ((isField ? row.align : col.align) as Alignment | null | undefined) ?? (type === 'number' && !isField ? 'right' : 'left');
  return { type, decimals, align };
};
/** A section cell as display text, with the column's configured decimals. */
const sectionValue = (section: ReportSection, row: Record<string, unknown>, col: SectionColumn) => {
  const { type, decimals } = cellSpec(section, row, col);
  const v = row[col.key];
  if (type === 'number' && typeof v === 'number' && decimals != null) {
    return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return displayValue(v, type);
};
/** PDF width per configured character, and the printable width of a landscape A4 page. */
const PDF_PT_PER_CHAR = 5.2;
const PDF_CONTENT_WIDTH = 786;
/** ReportDocumentInfo.compactTables: width per character at the 6pt table print, and the cell padding. */
const COMPACT_PT_PER_CHAR = 4.2;
const COMPACT_PAD = 2;

@Injectable()
export class ReportExportService {
  constructor(@Optional() private readonly uploads?: UploadService) {}

  async export(result: ReportResult, format: ReportExportFormat, companyName: string): Promise<ExportedFile> {
    const base = `${result.report.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'report'}-${localDay(result.generatedAt)}`;
    if (result.sections) return this.exportDocument(result, format, companyName, base);
    if (format === 'csv') return { buffer: this.csv(result), contentType: 'text/csv; charset=utf-8', fileName: `${base}.csv` };
    if (format === 'xlsx') {
      return {
        buffer: await this.xlsx(result, companyName),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: `${base}.xlsx`,
      };
    }
    return { buffer: await this.pdf(result, companyName), contentType: 'application/pdf', fileName: `${base}.pdf` };
  }

  // ── Document reports (several sections, e.g. the Work Order Order Form) ─────────────────────

  private async exportDocument(result: ReportResult, format: ReportExportFormat, companyName: string, base: string): Promise<ExportedFile> {
    const sections = result.sections ?? [];
    if (format === 'csv') {
      const escape = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
      const lines: string[] = [escape(result.report.name), escape(result.appliedFilters.join('; '))];
      for (const s of sections) {
        lines.push('', escape(s.title));
        if (s.note) lines.push(escape(s.note));
        lines.push(s.columns.map((c) => escape(c.label)).join(','));
        for (const row of [...s.rows, ...s.footerRows]) lines.push(s.columns.map((c) => escape(sectionValue(s, row, c))).join(','));
        if (!s.rows.length) lines.push(escape(s.emptyText));
      }
      return { buffer: Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8'), contentType: 'text/csv; charset=utf-8', fileName: `${base}.csv` };
    }
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'NexusCore';
      const ws = wb.addWorksheet(result.report.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Report');
      ws.addRow([result.report.name]).font = { bold: true, size: 14 };
      ws.addRow([`${companyName} · ${result.appliedFilters.join('; ')} · Generated ${formatGenerated(result.generatedAt)}`]).font = { size: 9, color: { argb: 'FF6B7280' } };
      // Picture columns (e.g. Style Picture): each stored picture added to the workbook once, then
      // drawn inside its cell.
      const pictures = await this.pictureCache(sections);
      const imageIds = new Map<string, number>();
      const imageId = (url: string) => {
        const data = pictures.get(url);
        if (!data) return null;
        if (!imageIds.has(url)) imageIds.set(url, wb.addImage({ base64: data, extension: /^data:image\/png/i.test(data) ? 'png' : 'jpeg' }));
        return imageIds.get(url)!;
      };
      for (const s of sections) {
        ws.addRow([]);
        ws.addRow([s.title]).font = { bold: true, size: 12, color: { argb: 'FFB91C1C' } };
        if (s.note) ws.addRow([s.note]).font = { italic: true, size: 9 };
        const header = ws.addRow(s.columns.map((c) => c.label));
        header.font = { bold: true };
        // Numbers stay numbers; the column's decimals become the cell format, its alignment the cell's.
        const addRow = (row: Record<string, unknown>, bold: boolean) => {
          const line = ws.addRow(s.columns.map((c) => {
            const { type } = cellSpec(s, row, c);
            return type === 'number' && typeof row[c.key] === 'number' ? row[c.key] as number : sectionValue(s, row, c);
          }));
          if (bold) line.font = { bold: true };
          s.columns.forEach((c, i) => {
            const { decimals, align } = cellSpec(s, row, c);
            const cell = line.getCell(i + 1);
            cell.alignment = { horizontal: align as 'left' | 'center' | 'right' };
            if (decimals != null && typeof cell.value === 'number') cell.numFmt = decimals ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
            const id = c.type === 'image' && typeof row[c.key] === 'string' ? imageId(row[c.key] as string) : null;
            if (id != null) {
              line.height = 48;
              ws.addImage(id, { tl: { col: i + 0.1, row: line.number - 1 + 0.1 }, ext: { width: 56, height: 56 } });
            }
          });
        };
        for (const row of s.rows) addRow(row, false);
        for (const row of s.footerRows) addRow(row, true);
        if (!s.rows.length) ws.addRow([s.emptyText]).font = { italic: true, color: { argb: 'FF6B7280' } };
      }
      ws.columns.forEach((c) => { c.width = 18; });
      return {
        buffer: Buffer.from(await wb.xlsx.writeBuffer()),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: `${base}.xlsx`,
      };
    }
    return { buffer: await this.documentPdf(result, companyName), contentType: 'application/pdf', fileName: `${base}.pdf` };
  }

  /** A stored picture ("upload/<id>") as a data URL pdfmake can draw (PNG / JPEG only), else null. */
  private async pictureDataUrl(url: string | null | undefined): Promise<string | null> {
    const id = /^\/?upload\/([0-9a-f-]{36})$/i.exec(String(url ?? ''))?.[1];
    if (!id || !this.uploads) return null;
    try {
      const { mimeType, buffer } = await this.uploads.content(id);
      return /^image\/(png|jpe?g)$/i.test(String(mimeType)) ? `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}` : null;
    } catch {
      return null;
    }
  }

  /** Every picture an 'image' table column shows, by stored URL, loaded once (missing / unsupported → absent). */
  private async pictureCache(sections: ReportSection[]): Promise<Map<string, string>> {
    const urls = new Set<string>();
    for (const s of sections) {
      if (s.layout !== 'table') continue;
      for (const c of s.columns) if (c.type === 'image') for (const r of s.rows) if (typeof r[c.key] === 'string' && r[c.key]) urls.add(r[c.key] as string);
    }
    const out = new Map<string, string>();
    for (const url of urls) {
      const data = await this.pictureDataUrl(url);
      if (data) out.set(url, data);
    }
    return out;
  }

  private async documentPdf(result: ReportResult, companyName: string): Promise<Buffer> {
    const pictures = await this.pictureCache(result.sections ?? []);
    const grid = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#6B7280', vLineColor: () => '#6B7280' };
    const info = result.document ?? { showTitle: true, companyAddress: null, showSectionTitles: true };
    const content: Content[] = [
      {
        columns: [
          {
            stack: [
              { text: companyName, fontSize: 14, bold: true },
              ...(info.companyAddress ? [{ text: info.companyAddress, fontSize: 8.5, bold: true, margin: [0, 2, 0, 0] } as Content] : []),
            ],
          },
          // The document title (e.g. "Order Form") — left out when the document asks (Inward Gate Pass).
          info.showTitle ? { text: result.report.name, fontSize: 16, bold: true, alignment: 'center' } : { text: '' },
          { text: formatGenerated(result.generatedAt), fontSize: 8, alignment: 'right', margin: [0, 6, 0, 0] },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 786, y2: 2, lineWidth: 1.5 }], margin: [0, 2, 0, 6] },
    ];
    // An 'inline' header line (e.g. a Work Order's) is printed in the same block as the section after
    // it (its table), so a header never ends a page apart from its table.
    let carried: Content[] = [];
    for (const s of result.sections ?? []) {
      if (s.layout === 'inline') {
        carried.push({
          margin: [0, 8, 0, 2], fontSize: 9, bold: true,
          text: s.rows.flatMap((r, i) => [
            { text: `${String(r.label)}: ` },
            { text: `${sectionValue(s, r, s.columns[1])}${i < s.rows.length - 1 ? '      ' : ''}` },
          ]),
        } as Content);
        continue;
      }
      // Each section is one stack, kept on one page when short, so a title never ends a page alone.
      const page: Content[] = [...carried];
      carried = [];
      content.push({ stack: page, unbreakable: s.layout === 'fields' || s.rows.length + s.footerRows.length <= 15 } as Content);
      if (info.showSectionTitles !== false && s.layout !== 'signatures' && s.title) page.push({ text: s.title, fontSize: 10, bold: true, color: '#B91C1C', margin: [0, 8, 0, 2] });
      else page.push({ text: '', margin: [0, page.length ? 2 : 6, 0, 0] });
      if (s.note) page.push({ text: s.note, fontSize: 7.5, italics: true, color: '#92400E', margin: [0, 0, 0, 2] });
      if (s.layout === 'signatures') {
        // Blank signing lines side by side, each with its caption (Gate Clerk, Carrier, Checked By).
        page.push({
          margin: [0, 34, 0, 0],
          columns: s.rows.map((r) => ({
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 170, y2: 0, lineWidth: 0.7 }], alignment: 'center' },
              { text: String(r.label), alignment: 'center', margin: [0, 3, 0, 0] },
            ],
          })),
        } as Content);
        continue;
      }
      if (s.layout === 'fields' && !s.picture) {
        // A header without a picture: its fields in two label / value pairs per row, across the page.
        const valueCol = s.columns[1];
        const cells = s.rows.map((r) => [
          { text: String(r.label), bold: true },
          { text: sectionValue(s, r, valueCol), alignment: cellSpec(s, r, valueCol).align },
        ]);
        const body: TableCell[][] = [];
        for (let i = 0; i < cells.length; i += 2) body.push([...cells[i], ...(cells[i + 1] ?? [{ text: '' }, { text: '' }])]);
        if (body.length) page.push({ table: { widths: [95, '*', 95, '*'], body }, layout: grid });
        continue;
      }
      if (s.layout === 'fields') {
        const fields = {
          width: 330,
          table: {
            widths: [120, s.columns[1]?.width ? s.columns[1].width * PDF_PT_PER_CHAR : '*'],
            body: s.rows.map((r) => [{ text: String(r.label), bold: true, color: '#1D4ED8' }, { text: sectionValue(s, r, s.columns[1]), alignment: cellSpec(s, r, s.columns[1]).align }]),
          },
          layout: grid,
        } as Content;
        const picture = await this.pictureDataUrl(s.imageUrl);
        const side: Content[] = [];
        if (picture) side.push({ image: picture, fit: [300, 190], alignment: 'center' });
        else if (s.imageUrl) side.push({ text: 'The style picture could not be embedded.', color: '#6B7280', alignment: 'center' });
        for (const b of s.badges ?? []) side.push({ text: b, fontSize: 18, bold: true, color: b === 'APPROVED' ? '#CC0000' : '#555555', alignment: 'center', margin: [0, 6, 0, 0] });
        page.push({ columns: [fields, { width: '*', stack: side }], columnGap: 14 });
        continue;
      }
      if (!s.rows.length) {
        page.push({ text: s.emptyText, color: '#6B7280', italics: true });
        continue;
      }
      // Configured widths (characters → points); the rest size automatically, the first such one
      // takes the remaining space. Fixed widths wider than the page are scaled down to fit — in a
      // compact document counting each cell's padding too, so even a 20-column table fits the page.
      const ptPerChar = info.compactTables ? COMPACT_PT_PER_CHAR : PDF_PT_PER_CHAR;
      const fixed = s.columns.reduce((t, c) => t + (c.width ? c.width * ptPerChar : 0), 0);
      const padding = info.compactTables ? s.columns.length * (COMPACT_PAD * 2 + 1) : 0;
      const room = info.compactTables ? PDF_CONTENT_WIDTH - padding : PDF_CONTENT_WIDTH * 0.92;
      const scale = fixed > room ? room / fixed : 1;
      const firstAuto = s.columns.findIndex((c) => !c.width);
      const widths = s.columns.map((c, i) => (c.width ? c.width * ptPerChar * scale : i === firstAuto ? '*' : 'auto'));
      const headAlign = (c: SectionColumn): Alignment => (c.align ?? (c.type === 'number' ? 'right' : 'left'));
      const body: TableCell[][] = [
        s.columns.map((c) => ({ text: c.label, bold: true, fillColor: '#E5E7EB', alignment: headAlign(c) })),
        ...s.rows.map((row) => s.columns.map((c): TableCell => {
          const picture = c.type === 'image' ? pictures.get(String(row[c.key] ?? '')) : undefined;
          if (picture) return { image: picture, fit: [c.width ? Math.max(c.width * ptPerChar * scale - 4, 16) : 50, 40], alignment: 'center' };
          return { text: sectionValue(s, row, c), alignment: cellSpec(s, row, c).align };
        })),
        ...s.footerRows.map((row) => s.columns.map((c) => ({ text: sectionValue(s, row, c), bold: true, fillColor: '#F3F4F6', alignment: cellSpec(s, row, c).align }))),
      ];
      page.push({
        table: { headerRows: 1, dontBreakRows: true, widths, body },
        layout: info.compactTables ? { ...grid, paddingLeft: () => COMPACT_PAD, paddingRight: () => COMPACT_PAD, paddingTop: () => 1, paddingBottom: () => 1 } : grid,
        ...(info.compactTables ? { fontSize: 6 } : {}),
      } as Content);
    }
    if (carried.length) content.push({ stack: carried } as Content);
    if (result.notice) content.push({ text: result.notice, color: '#6B7280', margin: [0, 12, 0, 0] });

    const doc: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [28, 28, 28, 36],
      defaultStyle: { font: 'Helvetica', fontSize: 7.5 },
      info: { title: `${result.report.name} — ${result.appliedFilters.join('; ')}`, creator: 'NexusCore' },
      content,
      footer: (current, total) => ({
        columns: [
          // Without a printed title (Inward Gate Pass) the footer names only the record.
          { text: info.showTitle ? `${result.report.name} · ${result.appliedFilters.join('; ')}` : result.appliedFilters.join('; '), fontSize: 7, color: '#9CA3AF' },
          { text: `Page ${current} of ${total}`, alignment: 'right', fontSize: 7, color: '#9CA3AF' },
        ],
        margin: [28, 10, 28, 0],
      }),
    };
    return new Promise((resolve, reject) => {
      const pdf = printer.createPdfKitDocument(doc);
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.end();
    });
  }

  private hasTotals(result: ReportResult) {
    return result.columns.some((c) => c.total);
  }

  private csv(result: ReportResult): Buffer {
    const escape = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [result.columns.map((c) => escape(c.label)).join(',')];
    for (const row of result.rows) {
      // Numbers stay unformatted (no thousands separators) so spreadsheets read them as numbers.
      lines.push(result.columns.map((c) => escape(c.type === 'number' && typeof row[c.key] === 'number' ? String(row[c.key]) : displayValue(row[c.key], c.type))).join(','));
    }
    if (this.hasTotals(result)) {
      lines.push(result.columns.map((c, i) => (c.total ? String(result.totals[c.key] ?? 0) : i === 0 ? 'Total' : '')).join(','));
    }
    // Leading BOM so Excel opens UTF-8 text correctly.
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
  }

  private async xlsx(result: ReportResult, companyName: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'NexusCore';
    wb.created = new Date(result.generatedAt);
    const ws = wb.addWorksheet(result.report.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Report');
    const colCount = result.columns.length;

    ws.addRow([result.report.name]).font = { bold: true, size: 14 };
    ws.addRow([`${companyName} · ${result.report.source} · Generated ${formatGenerated(result.generatedAt)}`]).font = { size: 9, color: { argb: 'FF6B7280' } };
    if (result.appliedFilters.length) ws.addRow([`Filters: ${result.appliedFilters.join('; ')}`]).font = { size: 9, color: { argb: 'FF6B7280' } };
    ws.addRow([]);

    const header = ws.addRow(result.columns.map((c) => c.label));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      cell.alignment = { vertical: 'middle' };
    });
    const headerRow = header.number;

    for (const row of result.rows) {
      ws.addRow(result.columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined) return null;
        if (c.type === 'date') return new Date(String(v));
        if (c.type === 'boolean') return v ? 'Yes' : 'No';
        return v as ExcelJS.CellValue;
      }));
    }
    if (this.hasTotals(result)) {
      const totalRow = ws.addRow(result.columns.map((c, i) => (c.total ? result.totals[c.key] ?? 0 : i === 0 ? 'Total' : null)));
      totalRow.font = { bold: true };
      totalRow.eachCell((cell) => { cell.border = { top: { style: 'thin' } }; });
    }

    result.columns.forEach((c, i) => {
      const column = ws.getColumn(i + 1);
      if (c.type === 'number') column.numFmt = '#,##0.##';
      if (c.type === 'date') column.numFmt = 'dd mmm yyyy';
      const longest = Math.max(c.label.length, ...result.rows.slice(0, 500).map((r) => displayValue(r[c.key], c.type).length));
      column.width = Math.min(Math.max(longest + 2, 10), 50);
    });
    ws.views = [{ state: 'frozen', ySplit: headerRow }];
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: colCount } };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private pdf(result: ReportResult, companyName: string): Promise<Buffer> {
    const landscape = result.columns.length > 6;
    const align = (type: string): Alignment => (type === 'number' ? 'right' : 'left');
    const body: TableCell[][] = [
      result.columns.map((c) => ({ text: c.label, bold: true, color: '#FFFFFF', fillColor: '#1F2937', alignment: align(c.type) })),
      ...result.rows.map((row) => result.columns.map((c) => ({ text: displayValue(row[c.key], c.type), alignment: align(c.type) }))),
    ];
    if (this.hasTotals(result)) {
      body.push(result.columns.map((c, i) => ({
        text: c.total ? formatNumber(result.totals[c.key] ?? 0) : i === 0 ? 'Total' : '',
        bold: true,
        alignment: align(c.type),
      })));
    }

    const content: Content[] = [
      { text: result.report.name, fontSize: 15, bold: true },
      { text: `${companyName} · ${result.report.source} · Generated ${formatGenerated(result.generatedAt)}`, fontSize: 8, color: '#6B7280', margin: [0, 2, 0, 0] },
    ];
    if (result.report.description) content.push({ text: result.report.description, fontSize: 8, margin: [0, 4, 0, 0] });
    if (result.appliedFilters.length) content.push({ text: `Filters: ${result.appliedFilters.join('; ')}`, fontSize: 8, color: '#6B7280', margin: [0, 2, 0, 0] });
    if (result.truncated) content.push({ text: `Showing the first ${result.rowCount.toLocaleString('en-US')} rows.`, fontSize: 8, color: '#B45309', margin: [0, 2, 0, 0] });
    content.push(
      result.rows.length
        ? {
            margin: [0, 10, 0, 0],
            table: { headerRows: 1, widths: result.columns.map(() => '*'), body },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0,
              hLineColor: () => '#D1D5DB',
              fillColor: (rowIndex: number) => (rowIndex > 0 && rowIndex % 2 === 0 ? '#F9FAFB' : null),
            },
          }
        : { text: 'No records match this report.', margin: [0, 12, 0, 0], color: '#6B7280' },
    );

    const doc: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: landscape ? 'landscape' : 'portrait',
      pageMargins: [28, 28, 28, 36],
      defaultStyle: { font: 'Helvetica', fontSize: result.columns.length > 10 ? 6.5 : 8 },
      info: { title: result.report.name, creator: 'NexusCore' },
      content,
      footer: (current, total) => ({
        columns: [
          { text: result.report.name, fontSize: 7, color: '#9CA3AF' },
          { text: `Page ${current} of ${total}`, alignment: 'right', fontSize: 7, color: '#9CA3AF' },
        ],
        margin: [28, 10, 28, 0],
      }),
    };

    return new Promise((resolve, reject) => {
      const pdf = printer.createPdfKitDocument(doc);
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.end();
    });
  }
}
