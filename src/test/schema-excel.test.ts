import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { loginSchema, registerSchema } from '@/schemas/auth';
import { parseExcelFile } from '@/utils/excel';

describe('auth schemas', () => {
  it('accepts valid login input and rejects short passwords', () => {
    expect(loginSchema.safeParse({ username: 'admin', password: '11111111' }).success).toBe(true);
    expect(loginSchema.safeParse({ username: 'admin', password: '123' }).success).toBe(false);
  });

  it('requires matching register passwords and a valid mobile number', () => {
    expect(registerSchema.safeParse({
      username: 'manager',
      name: '门店经理',
      phone: '13900139000',
      password: '123456',
      confirmPassword: '123456',
    }).success).toBe(true);

    expect(registerSchema.safeParse({
      username: 'manager',
      name: '门店经理',
      phone: '10000',
      password: '123456',
      confirmPassword: '654321',
    }).success).toBe(false);
  });
});

describe('Excel parsing', () => {
  it('marks missing expected columns as row validation errors', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['产品名称', '品牌'],
      ['玻尿酸精华液', ''],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = new File([buffer], 'products.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const rows = await parseExcelFile(file, ['产品名称', '品牌']);

    expect(rows).toHaveLength(1);
    expect(rows[0].rowIndex).toBe(2);
    expect(rows[0].errors).toEqual([
      { row: 2, field: '品牌', message: '品牌 不能为空' },
    ]);
  });
});
