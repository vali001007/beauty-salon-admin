export interface ImportResult {
  success: number;
  failed: number;
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
}
