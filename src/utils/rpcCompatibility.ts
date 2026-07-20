/** Komari 不同版本可能用数组或键值对象表示同一组 RPC 实体。 */
export type RpcCollection<T> = T[] | Record<string, T>

export class RpcCompatibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RpcCompatibilityError'
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 将集合型 RPC 响应统一为键值对象。
 *
 * 已经是对象的新版响应保持原样；旧版数组响应则使用实体自身的稳定标识建索引。
 */
export function normalizeRpcCollection<T>(
  payload: unknown,
  method: string,
  getKey: (item: T) => unknown,
): Record<string, T> {
  if (isObjectRecord(payload))
    return payload as Record<string, T>

  if (!Array.isArray(payload))
    throw new RpcCompatibilityError(`${method} returned neither an object nor an array`)

  const seenKeys = new Set<string>()
  const entries: Array<[string, T]> = payload.map((item, index) => {
    if (!isObjectRecord(item))
      throw new RpcCompatibilityError(`${method} returned an invalid item at index ${index}`)

    const key = getKey(item as T)
    if (typeof key !== 'string' || key.trim() === '')
      throw new RpcCompatibilityError(`${method} returned an item without a stable key at index ${index}`)
    if (seenKeys.has(key))
      throw new RpcCompatibilityError(`${method} returned a duplicate stable key at index ${index}`)

    seenKeys.add(key)
    return [key, item as T]
  })

  return Object.fromEntries(entries)
}
