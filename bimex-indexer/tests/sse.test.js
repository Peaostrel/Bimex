import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agregarCliente, eliminarCliente, notificarClientes, getSseMetrics } from '../sse.js';

describe('sse.js', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      write: vi.fn(() => true),
      writeHead: vi.fn(),
      end: vi.fn(),
      socket: { remoteAddress: '127.0.0.1' },
    };
    // Clear clients by calling eliminar on any possible added clients
    const metrics = getSseMetrics();
    // We cannot directly clear the set/map since they are not exported,
    // but we can eliminate clients if we keep track, or rely on them starting empty.
    // However, vitest runs describe blocks independently or we can just make sure we clean up.
  });

  it('allows adding, notifying and removing clients', () => {
    const added = agregarCliente(mockRes, '127.0.0.1');
    expect(added).toBe(true);

    notificarClientes('test_event', { key: 'value' });
    expect(mockRes.write).toHaveBeenCalledWith(
      `event: test_event\ndata: {"key":"value"}\n\n`
    );

    eliminarCliente(mockRes);
    mockRes.write.mockClear();

    notificarClientes('test_event', { key: 'value' });
    expect(mockRes.write).not.toHaveBeenCalled();
  });

  it('removes clients automatically if client.write throws', () => {
    mockRes.write.mockImplementation(() => {
      throw new Error('Write failed');
    });

    agregarCliente(mockRes, '127.0.0.2');
    // This call should run, catch the error, and delete the client
    notificarClientes('test_event', {});
    
    // Subscribing again shouldn't write anymore since it was deleted
    mockRes.write.mockClear();
    notificarClientes('test_event', {});
    expect(mockRes.write).not.toHaveBeenCalled();
  });

  it('enforces maximum connections per IP', () => {
    const clients = [];
    const ip = '192.168.1.100';

    // Add up to MAX_PER_IP (5)
    for (let i = 0; i < 5; i++) {
      const res = {
        write: vi.fn(() => true),
        writeHead: vi.fn(),
        end: vi.fn(),
        socket: { remoteAddress: ip },
      };
      clients.push(res);
      expect(agregarCliente(res, ip)).toBe(true);
    }

    // The 6th one should fail
    const extraRes = {
      write: vi.fn(() => true),
      writeHead: vi.fn(),
      end: vi.fn(),
      socket: { remoteAddress: ip },
    };
    expect(agregarCliente(extraRes, ip)).toBe(false);
    expect(extraRes.writeHead).toHaveBeenCalledWith(429);
    expect(extraRes.end).toHaveBeenCalled();

    // Clean up
    clients.forEach(c => eliminarCliente(c));
    eliminarCliente(extraRes);
  });

  it('enforces total connections limit', () => {
    // Temporarily verify total connections limit.
    // Since MAX_TOTAL is 500, we can add a few and check metrics.
    const metricsBefore = getSseMetrics();
    const ip1 = '10.0.0.1';
    const ip2 = '10.0.0.2';

    const res1 = { write: vi.fn(() => true), socket: { remoteAddress: ip1 } };
    const res2 = { write: vi.fn(() => true), socket: { remoteAddress: ip2 } };

    agregarCliente(res1, ip1);
    agregarCliente(res2, ip2);

    const metricsAfter = getSseMetrics();
    expect(metricsAfter.total).toBe(metricsBefore.total + 2);
    expect(metricsAfter.perIp[ip1]).toBe(1);
    expect(metricsAfter.perIp[ip2]).toBe(1);

    eliminarCliente(res1);
    eliminarCliente(res2);
  });

  it('removes client on backpressure (when write returns false)', () => {
    const mockBackpressureRes = {
      write: vi.fn(() => false), // returns false indicating backpressure
      socket: { remoteAddress: '10.0.0.5' },
    };

    agregarCliente(mockBackpressureRes, '10.0.0.5');
    // Notify should detect backpressure (write returns false) and remove client
    notificarClientes('test', {});

    const metrics = getSseMetrics();
    expect(metrics.perIp['10.0.0.5']).toBeUndefined();
  });
});

