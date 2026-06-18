import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './UI';
import { parseExcelFile, type ParsedRow } from '@/utils/excel';
import { toast } from 'sonner';
import type { ImportResult, ExportColumn } from '@/types/excel';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: ExportColumn[];
  requiredColumns: string[];
  onImport: (data: Record<string, any>[]) => Promise<ImportResult>;
  onSuccess?: () => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  title,
  columns,
  requiredColumns,
  onImport,
  onSuccess,
}: ImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      toast.error('仅支持 .xlsx 和 .xls 格式文件');
      return;
    }

    setSelectedFile(file);
    try {
      const rows = await parseExcelFile(file, requiredColumns);
      setParsedRows(rows);
      setStep('preview');
    } catch {
      toast.error('文件解析失败，请检查文件格式');
    }
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error('没有有效数据可导入');
      return;
    }

    setImporting(true);
    try {
      const importResult = await onImport(validRows.map((r) => r.data));
      setResult(importResult);
      setStep('result');
      if (importResult.success > 0) {
        onSuccess?.();
      }
    } catch {
      toast.error('导入失败，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setParsedRows([]);
    setResult(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  };

  const errorCount = parsedRows.filter((r) => r.errors.length > 0).length;
  const validCount = parsedRows.length - errorCount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" aria-describedby="import-dialog-desc">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <span id="import-dialog-desc" className="sr-only">批量导入数据</span>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="mt-4">
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            >
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-1">点击选择或拖拽 Excel 文件到此处</p>
              <p className="text-xs text-gray-400">支持 .xlsx、.xls 格式</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">
                  <FileSpreadsheet className="w-4 h-4 inline mr-1" />
                  {selectedFile?.name}
                </span>
                <span className="text-green-600">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                  有效 {validCount} 条
                </span>
                {errorCount > 0 && (
                  <span className="text-red-500">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    错误 {errorCount} 条
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setParsedRows([]); setSelectedFile(null); }}>
                重新选择
              </Button>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium w-12">行</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium w-16">状态</th>
                    {columns.map((col) => (
                      <th key={col.key} className="px-3 py-2 text-left text-gray-500 font-medium">{col.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={row.errors.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}
                    >
                      <td className="px-3 py-2 text-gray-500">{row.rowIndex}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <span className="text-red-500" title={row.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}>
                            <AlertCircle className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="text-green-500"><CheckCircle2 className="w-4 h-4" /></span>
                        )}
                      </td>
                      {columns.map((col) => (
                        <td key={col.key} className="px-3 py-2 text-gray-700 max-w-[150px] truncate">
                          {String(row.data[col.header] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {errorCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700 font-medium mb-2">错误详情：</p>
                <ul className="text-xs text-red-600 space-y-1 max-h-[100px] overflow-y-auto">
                  {parsedRows
                    .filter((r) => r.errors.length > 0)
                    .flatMap((r) => r.errors.map((e: { row: number; field: string; message: string }, i: number) => (
                      <li key={`${r.rowIndex}-${i}`}>第 {e.row} 行：{e.field} - {e.message}</li>
                    )))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>取消</Button>
              <Button onClick={handleConfirmImport} disabled={importing || validCount === 0}>
                {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                确认导入 ({validCount} 条)
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 'result' && result && (
          <div className="mt-4 space-y-4">
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-medium text-gray-800">导入完成</p>
              <p className="text-sm text-gray-600 mt-2">
                成功 <span className="text-green-600 font-medium">{result.success}</span> 条，
                失败 <span className="text-red-500 font-medium">{result.failed}</span> 条
              </p>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700 font-medium mb-2">失败详情：</p>
                <ul className="text-xs text-red-600 space-y-1 max-h-[150px] overflow-y-auto">
                  {result.errors.map((e: { row: number; field: string; message: string }, i: number) => (
                    <li key={i}>第 {e.row} 行：{e.field} - {e.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose}>关闭</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
