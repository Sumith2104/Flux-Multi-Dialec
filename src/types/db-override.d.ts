import { SafeSqlFragment } from '@/lib/safe-sql';

declare module 'pg' {
  export interface Pool {
    query<T extends QueryResultRow = any, I extends any[] = any[], Q extends string = string>(
      queryText: string extends Q ? SafeSqlFragment : Q,
      values?: I
    ): Promise<QueryResult<T>>;
  }
  export interface Client {
    query<T extends QueryResultRow = any, I extends any[] = any[], Q extends string = string>(
      queryText: string extends Q ? SafeSqlFragment : Q,
      values?: I
    ): Promise<QueryResult<T>>;
  }
}

declare module 'mysql2/promise' {
  export interface Pool {
    query<T extends RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[] | ResultSetHeader, Q extends string = string>(
      sql: string extends Q ? SafeSqlFragment : Q,
      values?: any
    ): Promise<[T, FieldPacket[]]>;
  }
  export interface Connection {
    query<T extends RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[] | ResultSetHeader, Q extends string = string>(
      sql: string extends Q ? SafeSqlFragment : Q,
      values?: any
    ): Promise<[T, FieldPacket[]]>;
  }
}
