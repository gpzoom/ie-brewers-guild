/**
 * A recording stand-in for the Supabase client in unit tests: every
 * from(table) chain records its calls and resolves to `tables[table]`.
 */
export type RecordedQuery = { table: string; ops: Array<[string, unknown[]]> };

export function fakeSupabase(tables: Record<string, unknown[]>) {
  const calls: RecordedQuery[] = [];
  const client = {
    from(table: string) {
      const rec: RecordedQuery = { table, ops: [] };
      calls.push(rec);
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve, reject);
            }
            return (...args: unknown[]) => {
              rec.ops.push([String(prop), args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { client: client as never, calls };
}

export function opsOf(calls: RecordedQuery[], table: string): Array<[string, unknown[]]> {
  return calls.filter((c) => c.table === table).flatMap((c) => c.ops);
}
