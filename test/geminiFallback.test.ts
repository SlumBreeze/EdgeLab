import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geminiService } from '../services/geminiService';

describe('Gemini Fallback & Timeout Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should fallback to Gemini 3 Flash if Gemini 3 Pro times out', async () => {
    const mockGenerateContent = vi.fn()
      // First call (Pro 3) never resolves (simulates hang)
      .mockReturnValueOnce(new Promise(() => {}))
      // Second call (Flash 3) succeeds
      .mockResolvedValueOnce({ text: 'Flash Result' });

    // Directly mock getAiClient on the service object
    vi.spyOn(geminiService, 'getAiClient').mockImplementation(() => {
      return {
        models: {
          generateContent: mockGenerateContent
        }
      } as any;
    });

    const callPromise = geminiService.generateWithFallback(['gemini-3-pro-preview'], { contents: 'test' });

    // Advance timers past 45s (default timeout)
    await vi.advanceTimersByTimeAsync(46000);

    const result = await callPromise;

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: 'gemini-3-pro-preview' }));
    expect(mockGenerateContent).toHaveBeenNthCalledWith(2, expect.objectContaining({ model: 'gemini-3-flash-preview' }));
    expect(result.text).toBe('Flash Result');
  });

  it('should throw if all models fail', async () => {
    const mockGenerateContent = vi.fn()
      .mockRejectedValue(new Error('Persistent Failure'));

    vi.spyOn(geminiService, 'getAiClient').mockImplementation(() => {
      return {
        models: {
          generateContent: mockGenerateContent
        }
      } as any;
    });

    const callPromise = geminiService.generateWithFallback(['gemini-3-pro-preview'], { contents: 'test' });
    
    await expect(callPromise).rejects.toThrow('Persistent Failure');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});
