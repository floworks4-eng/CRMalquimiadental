import 'server-only'

/** Lee cada página con orden estable definido por el llamador; nunca devuelve un total parcial tras un error. */
export async function readPages<T>(
  getPage: (start: number, end: number) => PromiseLike<{ data: unknown; error: unknown }>,
  message: string,
): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getPage(offset, offset + 499)
    if (error) throw new Error(message)
    const page = (data ?? []) as T[]
    result.push(...page)
    if (page.length < 500) return result
  }
}
