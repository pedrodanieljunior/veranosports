interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private pending: Map<string, Promise<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutos

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now() + (ttl || this.defaultTTL),
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.timestamp) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  /**
   * Retorna dado do cache se disponível.
   * Se uma busca já está em andamento para essa chave, aguarda ela em vez de fazer nova chamada.
   * Se o cache está vazio e não há busca em andamento, executa o fetcher e cacheia o resultado.
   */
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    if (this.pending.has(key)) {
      return this.pending.get(key) as Promise<T>;
    }

    const promise = fetcher()
      .then(data => {
        this.set(key, data, ttl);
        this.pending.delete(key);
        return data;
      })
      .catch(err => {
        this.pending.delete(key);
        throw err;
      });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Registra manualmente uma promise pendente para uma chave.
   * Retorna funções resolve/reject que devem ser chamadas ao terminar a busca.
   * Isso permite que outros endpoints esperem a busca em andamento sem duplicar chamadas à API.
   */
  registerPending<T>(key: string): { resolve: (data: T) => void; reject: (err: any) => void } {
    // Se já existe um pending para esta chave, não sobrescrever
    if (this.pending.has(key)) {
      return { resolve: () => {}, reject: () => {} };
    }
    let resolver!: (data: T) => void;
    let rejecter!: (err: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolver = res;
      rejecter = rej;
    });
    this.pending.set(key, promise);
    return {
      resolve: (data: T) => {
        this.pending.delete(key);
        resolver(data);
      },
      reject: (err: any) => {
        this.pending.delete(key);
        rejecter(err);
      },
    };
  }

  /**
   * Se há uma busca em andamento para esta chave, aguarda ela terminar e retorna o resultado.
   * Útil para que endpoints dependentes esperem o endpoint principal terminar.
   */
  async waitForPending<T>(key: string): Promise<T | null> {
    if (this.pending.has(key)) {
      try {
        return await (this.pending.get(key) as Promise<T>);
      } catch {
        return null;
      }
    }
    return null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }
}

export const cache = new SimpleCache();
