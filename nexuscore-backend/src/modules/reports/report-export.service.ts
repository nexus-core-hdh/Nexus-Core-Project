import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { Alignment, Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ReportResult } from './report-builder.service';

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
  if (type === 'number' && typeof value === 'number') return formatNumber(value);
  return String(value);
}

// PDFKit's built-in standard fonts — no font files needed on the server.
const printer = new PdfPrinter({
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
});

@Injectable()
export class ReportExportService {
  async export(result: ReportResult, format: ReportExportFormat, companyName: string): Promise<ExportedFile> {
    const base = `${result.report.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'report'}-${localDay(result.generatedAt)}`;
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
