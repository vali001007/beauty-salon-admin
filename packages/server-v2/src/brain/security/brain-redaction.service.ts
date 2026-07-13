import { Injectable } from '@nestjs/common';

const SENSITIVE_FIELDS = new Set(['phone', 'mobile', 'idCard', 'costPrice', 'supplierPrice']);

@Injectable()
export class BrainRedactionService {
  redactRecord<T extends Record<string, unknown>>(record: T, permissions: string[]): T {
    if (permissions.includes('*') || permissions.includes('core:brain:sensitive:view')) {
      return record;
    }

    const copy = { ...record };
    for (const field of Object.keys(copy)) {
      if (SENSITIVE_FIELDS.has(field)) {
        copy[field as keyof T] = '***' as T[keyof T];
      }
    }
    return copy;
  }
}
