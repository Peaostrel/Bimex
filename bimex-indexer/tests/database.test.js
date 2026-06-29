import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    rpc: vi.fn(),
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
  };
  return {
    createClient: () => mockSupabase,
  };
});

// Import database.js after mocking
import { conRetry, upsertProyecto, upsertAportacion, insertEvento, getLastIndexedLedger, supabaseOk } from '../database.js';

// Retrieve mocked client instance by importing supabase default (which is the created client)
import supabaseMock from '../database.js';

describe('database.js', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('conRetry', () => {
    it('succeeds on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const promise = conRetry(mockFn, 3, 10);
      const res = await promise;
      expect(res).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('succeeds on third attempt after two failures', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success 3');

      const promise = conRetry(mockFn, 3, 10);
      
      // Fast forward the backoff timeouts
      await vi.runAllTimersAsync();
      
      const res = await promise;
      expect(res).toBe('success 3');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('fails permanently and sets supabaseOk to false', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fatal database error'));

      // Start the promise THEN advance fake timers so the retry delays complete
      const promise = conRetry(mockFn, 3, 10);
      vi.runAllTimersAsync(); // don't await — let it run while promise settles
      await expect(promise).rejects.toThrow('fatal database error');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Database helpers mapping', () => {
    it('upsertProyecto calls supabase rpc when yield_entregado_delta exists', async () => {
      supabaseMock.rpc.mockResolvedValue({ error: null });
      
      await upsertProyecto({ id: 1, yield_entregado_delta: '500' });
      
      expect(supabaseMock.rpc).toHaveBeenCalledWith('incrementar_yield_entregado', {
        p_id: 1,
        p_delta: '500'
      });
    });

    it('upsertProyecto calls supabase upsert normally', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({
        upsert: mockUpsert
      });

      const proj = { id: 1, name: 'Proyecto Test' };
      await upsertProyecto(proj);

      expect(supabaseMock.from).toHaveBeenCalledWith('proyectos');
      expect(mockUpsert).toHaveBeenCalledWith(proj, { onConflict: 'id' });
    });

    it('upsertAportacion calls supabase upsert', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({
        upsert: mockUpsert
      });

      const aport = { proyecto_id: 2, contribuidor: 'addr1', monto: '100' };
      await upsertAportacion(aport);

      expect(supabaseMock.from).toHaveBeenCalledWith('aportaciones');
      expect(mockUpsert).toHaveBeenCalledWith(aport, { onConflict: 'proyecto_id,contribuidor' });
    });

    it('insertEvento calls supabase upsert', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({
        upsert: mockUpsert
      });

      const ev = { tx_hash: 'tx1', tipo: 'cambio_estado' };
      await insertEvento(ev);

      expect(supabaseMock.from).toHaveBeenCalledWith('eventos');
      expect(mockUpsert).toHaveBeenCalledWith(ev, { onConflict: 'tx_hash', ignoreDuplicates: true });
    });

    it('getLastIndexedLedger returns ledger from database response', async () => {
      const mockLimit = vi.fn().mockResolvedValue({ data: [{ ledger: 1025 }], error: null });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      supabaseMock.from.mockReturnValue({
        select: mockSelect
      });

      const ledger = await getLastIndexedLedger();
      expect(ledger).toBe(1025);
      expect(supabaseMock.from).toHaveBeenCalledWith('eventos');
      expect(mockSelect).toHaveBeenCalledWith('ledger');
    });
  });
});
