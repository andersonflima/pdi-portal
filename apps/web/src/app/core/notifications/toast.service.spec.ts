import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';

const buildService = () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [ToastService] });
  return TestBed.inject(ToastService);
};

describe('ToastService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes a success toast with the correct kind', () => {
    const service = buildService();

    service.success('Saved');

    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0]?.kind).toBe('success');
    expect(service.toasts()[0]?.message).toBe('Saved');
  });

  it('pushes an error toast with the correct kind', () => {
    const service = buildService();

    service.error('Boom');

    expect(service.toasts()[0]?.kind).toBe('error');
    expect(service.toasts()[0]?.message).toBe('Boom');
  });

  it('pushes an info toast with the correct kind', () => {
    const service = buildService();

    service.info('Heads up');

    expect(service.toasts()[0]?.kind).toBe('info');
  });

  it('dismisses a toast by id', () => {
    const service = buildService();
    const id = service.success('Saved');

    service.dismiss(id);

    expect(service.toasts()).toHaveLength(0);
  });

  it('auto-dismisses a toast after the timeout', () => {
    const service = buildService();

    service.info('Temporary');
    expect(service.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(4500);

    expect(service.toasts()).toHaveLength(0);
  });
});
