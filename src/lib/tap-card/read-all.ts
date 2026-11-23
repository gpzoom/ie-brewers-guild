const PAGE = 1000;

/**
 * Reads every row of a query, 1,000 at a time (the database's page limit).
 * The query must be ordered by a unique column pair or pages can overlap.
 */
export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE) return rows;
  }
}
