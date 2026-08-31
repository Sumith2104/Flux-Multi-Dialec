import { describe, it, expect } from 'vitest';
import {
  quotePgIdentifier,
  quoteMysqlIdentifier,
  quotePgProjectSchema,
  validateRlsCommand,
  validateRlsExpression,
  assertReadOnlySelectQuery,
} from '@/lib/sql-safety';

describe('quotePgIdentifier', () => {
  it('quotes valid identifiers', () => {
    expect(quotePgIdentifier('users')).toBe('"users"');
    expect(quotePgIdentifier('my_table')).toBe('"my_table"');
    expect(quotePgIdentifier('Table1')).toBe('"Table1"');
  });

  it('rejects identifiers containing double quotes', () => {
    expect(() => quotePgIdentifier('my"table')).toThrow('Invalid identifier');
  });

  it('rejects empty strings', () => {
    expect(() => quotePgIdentifier('')).toThrow('Invalid identifier');
  });

  it('rejects non-string types', () => {
    expect(() => quotePgIdentifier(123 as any)).toThrow('Invalid identifier');
  });

  it('rejects SQL injection attempts', () => {
    expect(() => quotePgIdentifier('users; DROP TABLE users')).toThrow('Invalid identifier');
    expect(() => quotePgIdentifier("'; DROP TABLE users; --")).toThrow('Invalid identifier');
    expect(() => quotePgIdentifier('users`')).toThrow('Invalid identifier');
    expect(() => quotePgIdentifier('users OR 1=1')).toThrow('Invalid identifier');
  });

  it('rejects identifiers starting with numbers', () => {
    expect(() => quotePgIdentifier('1users')).toThrow('Invalid identifier');
  });

  it('accepts identifiers with underscores and numbers after first char', () => {
    expect(quotePgIdentifier('_private')).toBe('"_private"');
    expect(quotePgIdentifier('user_123')).toBe('"user_123"');
  });
});

describe('quoteMysqlIdentifier', () => {
  it('quotes valid identifiers with backticks', () => {
    expect(quoteMysqlIdentifier('users')).toBe('`users`');
  });

  it('rejects identifiers containing backticks', () => {
    expect(() => quoteMysqlIdentifier('my`table')).toThrow('Invalid identifier');
  });

  it('rejects invalid identifiers', () => {
    expect(() => quoteMysqlIdentifier('')).toThrow('Invalid identifier');
    expect(() => quoteMysqlIdentifier('users; DROP TABLE')).toThrow('Invalid identifier');
  });
});

describe('quotePgProjectSchema', () => {
  it('quotes project IDs correctly', () => {
    expect(quotePgProjectSchema('abc123')).toBe('"project_abc123"');
    expect(quotePgProjectSchema('my-project_01')).toBe('"project_my-project_01"');
  });

  it('rejects invalid project IDs', () => {
    expect(() => quotePgProjectSchema('')).toThrow('Invalid projectId');
    expect(() => quotePgProjectSchema('bad id!@#')).toThrow('Invalid projectId');
  });
});

describe('validateRlsCommand', () => {
  it('normalizes to uppercase', () => {
    expect(validateRlsCommand('select')).toBe('SELECT');
    expect(validateRlsCommand('ALL')).toBe('ALL');
  });

  it('accepts all valid commands', () => {
    ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'].forEach(cmd => {
      expect(validateRlsCommand(cmd)).toBe(cmd);
    });
  });

  it('rejects invalid commands', () => {
    expect(() => validateRlsCommand('DROP')).toThrow('Invalid RLS command');
    expect(() => validateRlsCommand('TRUNCATE')).toThrow('Invalid RLS command');
    expect(() => validateRlsCommand('GRANT')).toThrow('Invalid RLS command');
  });

  it('handles empty/null gracefully', () => {
    expect(validateRlsCommand(undefined as any)).toBe('ALL');
    expect(validateRlsCommand(null as any)).toBe('ALL');
  });
});

describe('validateRlsExpression', () => {
  it('accepts simple boolean expressions', () => {
    expect(validateRlsExpression("auth.uid() = user_id")).toBe("auth.uid() = user_id");
    expect(validateRlsExpression("role = 'admin'")).toBe("role = 'admin'");
    expect(validateRlsExpression("status IN ('active','pending')")).toBe("status IN ('active','pending')");
  });

  it('rejects expressions with semicolons', () => {
    expect(() => validateRlsExpression("uid = user_id; DROP TABLE users")).toThrow();
  });

  it('rejects expressions with null bytes', () => {
    expect(() => validateRlsExpression("uid = \x00")).toThrow();
  });

  it('rejects SQL comment tokens', () => {
    expect(() => validateRlsExpression("uid = user_id -- bypass")).toThrow();
    expect(() => validateRlsExpression("uid /* bypass */ = user_id")).toThrow();
    expect(() => validateRlsExpression("uid $$ dangerous $$ = user_id")).toThrow();
  });

  it('rejects empty or whitespace-only expressions', () => {
    expect(() => validateRlsExpression('')).toThrow();
    expect(() => validateRlsExpression('   ')).toThrow();
  });

  it('rejects non-string types', () => {
    expect(() => validateRlsExpression(123 as any)).toThrow();
  });

  it('rejects overly long expressions (>2000 chars)', () => {
    const longExpr = 'a'.repeat(2001);
    expect(() => validateRlsExpression(longExpr)).toThrow();
  });
});

describe('assertReadOnlySelectQuery', () => {
  it('accepts simple SELECT queries (PostgreSQL dialect)', () => {
    expect(() => assertReadOnlySelectQuery('SELECT * FROM users')).not.toThrow();
    expect(() => assertReadOnlySelectQuery('SELECT id, name FROM users WHERE active = true LIMIT 10')).not.toThrow();
  });

  it('accepts SELECT queries (MySQL dialect)', () => {
    expect(() => assertReadOnlySelectQuery('SELECT * FROM users', 'mysql')).not.toThrow();
  });

  it('accepts CTE queries (WITH ... SELECT)', () => {
    expect(() => assertReadOnlySelectQuery('WITH cte AS (SELECT 1) SELECT * FROM cte')).not.toThrow();
  });

  it('rejects INSERT statements', () => {
    expect(() => assertReadOnlySelectQuery('INSERT INTO users VALUES (1)')).toThrow();
  });

  it('rejects UPDATE statements', () => {
    expect(() => assertReadOnlySelectQuery('UPDATE users SET name = "test"')).toThrow();
  });

  it('rejects DELETE statements', () => {
    expect(() => assertReadOnlySelectQuery('DELETE FROM users WHERE id = 1')).toThrow();
  });

  it('rejects multi-statement queries', () => {
    expect(() => assertReadOnlySelectQuery('SELECT * FROM users; DROP TABLE users')).toThrow();
  });

  it('rejects non-SELECT single statements', () => {
    expect(() => assertReadOnlySelectQuery('CREATE TABLE x (id int)')).toThrow();
    expect(() => assertReadOnlySelectQuery('DROP TABLE users')).toThrow();
  });

  it('rejects empty strings', () => {
    expect(() => assertReadOnlySelectQuery('')).toThrow();
  });

  it('rejects non-string input', () => {
    expect(() => assertReadOnlySelectQuery(123 as any)).toThrow();
  });
});
