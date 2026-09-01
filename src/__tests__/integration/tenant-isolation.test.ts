import { describe, it, expect } from 'vitest';
import { 
  quotePgProjectSchema, 
  quoteMysqlProjectSchema,
  assertReadOnlySelectQuery,
  validateRlsCommand,
  validateRlsExpression
} from '@/lib/sql-safety';

describe('Tenant Isolation & Schema Boundary Enforcement', () => {
  it('enforces strict tenant schema isolation naming', () => {
    const tenantA = 'proj_alpha_123';
    const tenantB = 'proj_beta_456';

    const schemaA = quotePgProjectSchema(tenantA);
    const schemaB = quotePgProjectSchema(tenantB);

    expect(schemaA).toBe('"project_proj_alpha_123"');
    expect(schemaB).toBe('"project_proj_beta_456"');
    expect(schemaA).not.toBe(schemaB);
  });

  it('rejects cross-tenant schema escape injection vectors', () => {
    const maliciousTenants = [
      'proj_1"; DROP SCHEMA public CASCADE; --',
      'proj_2" OR 1=1 --',
      '../etc/passwd',
      'proj_3\x00_inject',
      'proj 4 with spaces',
      'proj_5;--'
    ];

    for (const tenant of maliciousTenants) {
      expect(() => quotePgProjectSchema(tenant)).toThrow();
    }
  });

  it('blocks statement stacking and destructive commands in read-only execution', () => {
    const dangerousQueries = [
      'SELECT * FROM users; DROP TABLE users;',
      'SELECT * FROM users; UPDATE users SET role = "admin"',
      'SELECT * FROM users; TRUNCATE TABLE audit_logs;',
      'DELETE FROM users WHERE 1=1;',
      'INSERT INTO users (email) VALUES ("attacker@evil.com");'
    ];

    for (const query of dangerousQueries) {
      expect(() => assertReadOnlySelectQuery(query)).toThrow();
    }
  });

  it('validates and safely processes RLS policy commands and expressions', () => {
    expect(() => validateRlsCommand('SELECT')).not.toThrow();
    expect(() => validateRlsCommand('INSERT')).not.toThrow();
    expect(() => validateRlsCommand('ALL')).not.toThrow();
    expect(() => validateRlsCommand('DROP DATABASE')).toThrow('Invalid RLS command');

    expect(() => validateRlsExpression('user_id = 123')).not.toThrow();
    expect(() => validateRlsExpression('status = \'active\' AND role = \'admin\'')).not.toThrow();
    expect(() => validateRlsExpression('1=1; DROP TABLE users;')).toThrow();
  });
});
