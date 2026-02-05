import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonaEditor } from '../components/PersonaEditor';
import { useGameContext } from '../hooks/useGameContext';
import { personaService } from '../services/personaService';

// Mock dependencies
vi.mock('../hooks/useGameContext', () => ({
  useGameContext: vi.fn()
}));

vi.mock('../services/personaService', () => ({
  personaService: {
    savePersona: vi.fn().mockImplementation((p) => Promise.resolve(p))
  }
}));

describe('PersonaEditor', () => {
  const mockSetPersona = vi.fn();
  const mockOnClose = vi.fn();
  
  const mockPersona = {
    user_id: 'user123',
    min_edge_percentage: 0.1,
    volume_mode: 'High Action',
    max_odds_american: -175,
    risk_tolerance: 'Balanced',
    active_sports: ['nba', 'nfl']
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useGameContext as any).mockReturnValue({
      userId: 'user123',
      persona: mockPersona,
      setPersona: mockSetPersona
    });
  });

  it('should render correctly when open', () => {
    render(<PersonaEditor isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText(/AI Persona Configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/Stoic Handicapper/i)).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    render(<PersonaEditor isOpen={true} onClose={mockOnClose} />);
    const closeButton = screen.getByLabelText(/close/i);
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should update and save persona settings', async () => {
    render(<PersonaEditor isOpen={true} onClose={mockOnClose} />);
    
    // Simulate changing edge threshold
    const edgeInput = screen.getByLabelText(/Min Edge %/i);
    fireEvent.change(edgeInput, { target: { value: '0.5' } });
    
    const saveButton = screen.getByText(/Save Persona/i);
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(personaService.savePersona).toHaveBeenCalledWith(expect.objectContaining({
        min_edge_percentage: 0.5
      }));
      expect(mockSetPersona).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should load initial settings from context', () => {
    render(<PersonaEditor isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText(/0.1%/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/-175/i)).toBeInTheDocument();
  });
});
