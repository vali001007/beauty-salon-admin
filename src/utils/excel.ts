import * as XLSX from 'xlsx';
import type { ExportColumn, ImportError } from '@/types/excel';

export interface ParsedRow {
  rowIndex: number;
  data: Record<string, any>;
  errors: ImportError[];
}

/**
 * 导出数据为 Excel 文件
 */
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn[],
  filename: string
): void {
  const headers = columns.map((c) => c.header);
  const rows = data.map((item) => columns.map((c) => item[c.key] ?? ''));

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // 设置列宽
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? 15 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/**
 * 解析 Excel 文件，返回每行数据及校验错误
 */
export async function parseExcelFile(
  file: File,
  expectedColumns?: string[]
): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];

  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

  return jsonData.map((row, index) => {
    const errors: ImportError[] = [];

    if (expectedColumns) {
      for (const col of expectedColumns) {
        const value = row[col];
        if (value === undefined || value === null || String(value).trim() === '') {
          errors.push({ row: index + 2, field: col, message: `${col} 不能为空` });
        }
      }
    }

    return { rowIndex: index + 2, data: row, errors };
  });
}

/**
 * 下载导入模板
 */
export function downloadTemplate(
  columns: ExportColumn[],
  templateName: string,
  sampleData?: Record<string, any>[]
): void {
  const headers = columns.map((c) => c.header);
  const rows: any[][] = [];

  if (sampleData && sampleData.length > 0) {
    for (const item of sampleData) {
      rows.push(columns.map((c) => item[c.key] ?? ''));
    }
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? 15 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '导入模板');
  XLSX.writeFile(wb, templateName.endsWith('.xlsx') ? templateName : `${templateName}.xlsx`);
}
