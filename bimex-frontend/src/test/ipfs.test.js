import { describe, it, expect } from 'vitest';
import {
  validarArchivo,
  TIPOS_PERMITIDOS,
  TAMANO_MAX_BYTES,
  esCID,
  cidAUrl,
  parsearDocHash,
} from '../utils/ipfs.js';

describe('validarArchivo', () => {
  it('should invalidate undefined/null file', () => {
    const res = validarArchivo(null);
    expect(res.valido).toBe(false);
    expect(res.error).toBe('No se seleccionó ningún archivo');
  });

  it('should validate correct PDF file', () => {
    const file = {
      name: 'test.pdf',
      type: 'application/pdf',
      size: 1024 * 1024 // 1MB
    };
    const res = validarArchivo(file);
    expect(res.valido).toBe(true);
    expect(res.error).toBeNull();
  });

  it('should validate correct PNG file', () => {
    const file = {
      name: 'test.png',
      type: 'image/png',
      size: 5 * 1024 * 1024 // 5MB
    };
    const res = validarArchivo(file);
    expect(res.valido).toBe(true);
    expect(res.error).toBeNull();
  });

  it('should invalidate .exe file', () => {
    const file = {
      name: 'test.exe',
      type: 'application/x-msdownload',
      size: 1024 * 1024 // 1MB
    };
    const res = validarArchivo(file);
    expect(res.valido).toBe(false);
    expect(res.error).toContain('Tipo no permitido');
  });

  it('should invalidate file larger than 10MB', () => {
    const file = {
      name: 'large.pdf',
      type: 'application/pdf',
      size: 11 * 1024 * 1024 // 11MB
    };
    const res = validarArchivo(file);
    expect(res.valido).toBe(false);
    expect(res.error).toContain('El archivo supera el límite de 10MB');
  });
});

describe('esCID', () => {
  it('accepts CIDv0 (Qm…)', () => {
    expect(esCID('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
  });
  it('accepts CIDv1 (baf…)', () => {
    expect(esCID('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')).toBe(true);
  });
  it('rejects SHA-256 hex hash', () => {
    expect(esCID('a'.repeat(64))).toBe(false);
  });
  it('rejects empty string', () => {
    expect(esCID('')).toBe(false);
  });
  it('rejects null/undefined', () => {
    expect(esCID(null)).toBe(false);
    expect(esCID(undefined)).toBe(false);
  });
});

describe('cidAUrl', () => {
  it('builds pinata gateway URL', () => {
    const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
    expect(cidAUrl(cid)).toBe(`https://gateway.pinata.cloud/ipfs/${cid}`);
  });
});

describe('parsearDocHash', () => {
  const CID0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
  const CID1 = 'QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB';
  const CID2 = 'QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o';
  const SHA  = 'a'.repeat(64);

  it('parses three CIDs separated by pipe', () => {
    const result = parsearDocHash(`${CID0}|${CID1}|${CID2}`);
    expect(result.esFallback).toBe(false);
    expect(result.cids).toEqual([CID0, CID1, CID2]);
    expect(result.fallbackHash).toBeNull();
  });

  it('parses single CID as IPFS (not fallback)', () => {
    const result = parsearDocHash(CID0);
    expect(result.esFallback).toBe(false);
    expect(result.cids).toEqual([CID0]);
  });

  it('parses SHA-256 hash as fallback', () => {
    const result = parsearDocHash(SHA);
    expect(result.esFallback).toBe(true);
    expect(result.fallbackHash).toBe(SHA);
    expect(result.cids).toEqual([]);
  });

  it('returns empty result for null/undefined', () => {
    expect(parsearDocHash(null)).toEqual({ cids: [], fallbackHash: null, esFallback: false });
    expect(parsearDocHash('')).toEqual({ cids: [], fallbackHash: null, esFallback: false });
  });

  it('trims whitespace around CIDs', () => {
    const result = parsearDocHash(` ${CID0} | ${CID1} `);
    expect(result.cids).toEqual([CID0, CID1]);
  });
});
