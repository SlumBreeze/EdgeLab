import { describe, it, expect, vi, beforeEach } from 'vitest';
import { personaService } from '../services/personaService';
import { supabase } from '../services/supabaseClient';

const validUserId = '550e8400-e29b-41d4-a716-446655440000';

// Mock Supabase client
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { user_id: '550e8400-e29b-41d4-a716-446655440000' }, error: null }))
        }))
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { user_id: '550e8400-e29b-41d4-a716-446655440000' }, error: null }))
        }))
      }))
    }))
  }
}));

describe('personaService', () => {
  const validUserId = '550e8400-e29b-41d4-a716-446655440000';

  it('should fetch user persona', async () => {
    const data = await personaService.getPersona(validUserId);
    expect(data).toBeDefined();
    expect(data?.user_id).toBe(validUserId);
  });

  it('should handle error when fetching persona', async () => {
    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Fetch error' } }))
        }))
      }))
    } as any);

    const data = await personaService.getPersona(validUserId);
    expect(data).toBeNull();
  });

  it('should save user persona', async () => {
    const persona = {
      user_id: validUserId,
      min_edge_percentage: 0.5,
      volume_mode: 'High Action'
    };
    const data = await personaService.savePersona(persona as any);
    expect(data).toBeDefined();
    expect(data?.user_id).toBe(validUserId);
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
      user_id: validUserId,
      min_edge_percentage: 0.5,
      volume_mode: 'High Action'
    };
    const data = await personaService.savePersona(persona as any);
    expect(data).toBeNull();
  });
});
