import { describe, it, expect } from 'vitest';
import { parseEvent } from '../eventParser.js';

describe('eventParser.js', () => {
  const contractId = 'CCONTRACT12345';

  it('ignores events from a different contract', () => {
    const rawEvent = {
      contract_id: 'CWRONGCONT',
      topics: [['contribuir', 'actor1']],
      data: [1, '100', '1600000000'],
      ledger: 100,
      transaction_hash: 'txhash123'
    };
    const result = parseEvent(rawEvent, contractId);
    expect(result).toBeNull();
  });

  it('parses "contribuir" event', () => {
    const rawEvent = {
      contract_id: contractId,
      topics: [['contribuir'], ['GDSTINATIONWALLET']],
      data: [42, '5000000', '1700000000'],
      ledger: 101,
      transaction_hash: 'tx_contribute',
      created_at: '2023-11-14T22:13:20.000Z'
    };
    const result = parseEvent(rawEvent, contractId);
    expect(result).not.toBeNull();
    expect(result.evento).toEqual({
      tipo: 'nueva_aportacion',
      contract_id: contractId,
      fn_name: 'contribuir',
      data: [42, '5000000', '1700000000'],
      ledger: 101,
      timestamp: '2023-11-14T22:13:20.000Z',
      tx_hash: 'tx_contribute'
    });
    expect(result.aportacion).toEqual({
      proyecto_id: 42,
      contribuidor: 'GDSTINATIONWALLET',
      monto: '5000000',
      timestamp: '1700000000'
    });
    expect(result.proyecto).toBeNull();
  });

  it('parses "yield" event', () => {
    const rawEvent = {
      contract_id: contractId,
      topics: [['yield'], ['actor_yield']],
      data: [10, '250000'],
      ledger: 102,
      transaction_hash: 'tx_yield'
    };
    const result = parseEvent(rawEvent, contractId);
    expect(result.evento.tipo).toBe('yield_reclamado');
    expect(result.proyecto).toEqual({
      id: 10,
      yield_entregado_delta: '250000'
    });
  });

  it('parses "retiro" event', () => {
    const rawEvent = {
      contract_id: contractId,
      topics: [['retiro'], ['contribuidor_addr']],
      data: [15, '8000'],
      ledger: 103,
      transaction_hash: 'tx_withdraw'
    };
    const result = parseEvent(rawEvent, contractId);
    expect(result.evento.tipo).toBe('retiro_principal');
    expect(result.aportacion).toEqual({
      proyecto_id: 15,
      contribuidor: 'contribuidor_addr',
      monto: '8000',
      retirado: true,
      timestamp: 'null'
    });
  });

  it('parses "aprobar" event', () => {
    const rawEvent = {
      contract_id: contractId,
      topics: [['aprobar'], ['admin']],
      data: [99],
      ledger: 104,
      transaction_hash: 'tx_approve'
    };
    const result = parseEvent(rawEvent, contractId);
    expect(result.evento.tipo).toBe('cambio_estado');
    expect(result.proyecto).toEqual({
      id: 99,
      estado: 'EtapaInicial'
    });
  });

  it('parses "rechazar" event', () => {
    const rawEvent = {
      contract_id: contractId,
      topics: [['rechazar'], ['admin']],
      data: [99, 'No cumple requisitos'],
      ledger: 105,
      transaction_hash: 'tx_reject'
    };
    const result = parseEvent(rawEvent, contractId);
    expect(result.evento.tipo).toBe('cambio_estado');
    expect(result.proyecto).toEqual({
      id: 99,
      estado: 'Rechazado',
      motivo_rechazo: 'No cumple requisitos'
    });
  });

  it('handles malformed event or scVal conversion failure gracefully', () => {
    // Should catch and return null if execution throws internally
    // If topics or args are missing and causes TypeError, parseEvent wraps in try-catch and returns null
    const badEvent = null;
    const result = parseEvent(badEvent, contractId);
    expect(result).toBeNull();
  });

  it('parses extreme / big i128 values correctly', () => {
    const rawEvent = {
      contract_id: contractId,
      topics: [['contribuir'], ['GDSTINATIONWALLET']],
      // representing a very large number as string
      data: [1, '170141183460469231731687303715884105727', '1700000000'],
      ledger: 101,
      transaction_hash: 'tx_big'
    };
    const result = parseEvent(rawEvent, contractId);
    expect(result.aportacion.monto).toBe('170141183460469231731687303715884105727');
  });
});
