import { describe, it, expect, vi, beforeEach } from 'vitest';
import { personaService } from '../services/personaService';
import { supabase } from '../services/supabaseClient';

// Mock Supabase client
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { user_id: '123' }, error: null }))
        }))
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { user_id: '123' }, error: null }))
        }))
      }))
    }))
  }
}));

describe('personaService', () => {
  it('should fetch user persona', async () => {
    const data = await personaService.getPersona('123');
    expect(data).toBeDefined();
    expect(data?.user_id).toBe('123');
  });

  it('should handle error when fetching persona', async () => {
    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Fetch error' } }))
        }))
      }))
    } as any);

    const data = await personaService.getPersona('123');
    expect(data).toBeNull();
  });

  it('should save user persona', async () => {
    const persona = {
      user_id: '123',
      min_edge_percentage: 0.5,
      volume_mode: 'High Action'
    };
    const data = await personaService.savePersona(persona);
    expect(data).toBeDefined();
    expect(data?.user_id).toBe('123');
  });

  it('should handle error when saving persona', async () => {
    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Save error' } }))
        }))
      }))
    } as any);

    const persona = {
      user_id: '123',
      min_edge_percentage: 0.5,
      volume_mode: 'High Action'
    };
    const data = await personaService.savePersona(persona);
    expect(data).toBeNull();
  });
});
