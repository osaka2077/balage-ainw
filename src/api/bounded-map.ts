/**
 * BoundedMap — Map mit maximaler Groesse und FIFO-Eviction (SEC-003)
 *
 * Verhindert unbegrenztes Wachstum von In-Memory Stores.
 * Wenn die Map voll ist, wird der aelteste Eintrag (erster Key) geloescht.
 */

/** Standard-Limit fuer alle In-Memory Stores */
export const DEFAULT_MAX_STORE_SIZE = 10_000;

export class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly maxSize: number = DEFAULT_MAX_STORE_SIZE) {
    super();
    if (maxSize < 1) {
      throw new Error("BoundedMap maxSize must be >= 1");
    }
  }

  override set(key: K, value: V): this {
    // Wenn Key bereits existiert: kein Eviction noetig, nur Update
    if (!this.has(key)) {
      while (this.size >= this.maxSize) {
        // Aeltesten Eintrag loeschen (FIFO — erster Key in Map-Insertion-Order)
        const firstKey = this.keys().next().value;
        if (firstKey !== undefined) {
          this.delete(firstKey);
        } else {
          break;
        }
      }
    }

    return super.set(key, value);
  }
}
