declare module 'pg' {
  export interface QueryResult<T> {
    rows: T[];
    rowCount: number;
  }

  export interface PoolConfig {
    [key: string]: unknown;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
}
