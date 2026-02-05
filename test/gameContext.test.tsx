import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameProvider, useGameContext } from '../hooks/useGameContext';
import React from 'react';

// Mock Supabase and Auth
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      }))
    })),
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } }))
    },
    isSupabaseConfigured: true
  },
  isSupabaseConfigured: true
}));

vi.mock('../components/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'test-user' } })),
  AuthProvider: vi.fn(({ children }) => children)
}));

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <GameProvider>{children}</GameProvider>
);

describe('useGameContext - Batch Removal & Restore', () => {
  it('should remove multiple games from the queue', async () => {
    const { result } = renderHook(() => useGameContext(), { wrapper });
    
    const mockGame1 = { id: 'g1', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, date: '2026-02-04', sport: 'NBA' };
    const mockGame2 = { id: 'g2', homeTeam: { name: 'C' }, awayTeam: { name: 'D' }, date: '2026-02-04', sport: 'NBA' };

    act(() => {
      result.current.addToQueue(mockGame1 as any);
      result.current.addToQueue(mockGame2 as any);
    });

    expect(result.current.queue.length).toBe(2);

    act(() => {
      result.current.removeGames(['g1', 'g2']);
    });

    expect(result.current.queue.length).toBe(0);
  });

  it('should restore multiple games to the queue', async () => {
    const { result } = renderHook(() => useGameContext(), { wrapper });
    
    const mockGames = [
      { id: 'g1', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, date: '2026-02-04', sport: 'NBA', visibleId: '1' },
      { id: 'g2', homeTeam: { name: 'C' }, awayTeam: { name: 'D' }, date: '2026-02-04', sport: 'NBA', visibleId: '2' }
    ];

    act(() => {
      result.current.restoreGames(mockGames as any);
    });

    expect(result.current.queue.length).toBe(2);
    expect(result.current.queue[0].id).toBe('g1');
  });
});