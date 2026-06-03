import { 
  quotePgIdentifier, 
  quoteMysqlIdentifier, 
  quotePgProjectSchema, 
  quoteMysqlProjectSchema 
} from './sql-safety';

export type SafeSqlFragment = string & { readonly __safeSqlFragmentBrand: never };

/**
 * Tagged template literal helper to safely construct compile-time validated SafeSqlFragment.
 * Only accepts static query string segments and other SafeSqlFragments (or raw safe numbers/booleans/nulls).
 */
export function safeSql(
  strings: TemplateStringsArray,
  ...interpolated: Array<SafeSqlFragment | number | boolean | null>
): SafeSqlFragment {
  return strings.reduce(
    (result, string, i) => {
      const val = interpolated[i];
      let valStr = '';
      if (val !== undefined && val !== null) {
        valStr = String(val);
      } else if (val === null) {
        valStr = 'NULL';
      }
      return result + string + valStr;
    },
    ''
  ) as SafeSqlFragment;
}

export function toSafeSql(sql: string): SafeSqlFragment {
  return sql as any;
}

export function quotePgIdentifierSafe(identifier: string, label?: string): SafeSqlFragment {
  return quotePgIdentifier(identifier, label) as any;
}

export function quoteMysqlIdentifierSafe(identifier: string, label?: string): SafeSqlFragment {
  return quoteMysqlIdentifier(identifier, label) as any;
}

export function quotePgProjectSchemaSafe(projectId: string): SafeSqlFragment {
  return quotePgProjectSchema(projectId) as any;
}

export function quoteMysqlProjectSchemaSafe(projectId: string): SafeSqlFragment {
  return quoteMysqlProjectSchema(projectId) as any;
}
