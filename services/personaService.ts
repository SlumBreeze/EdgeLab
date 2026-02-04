import { supabase } from './supabaseClient';

export interface UserPersona {
  user_id: string;
  min_edge_percentage: number;
  volume_mode: string;
  max_odds_american: number;
  risk_tolerance: string;
  active_sports: string[];
  updated_at?: string;
}

export const personaService = {
  async getPersona(userId: string): Promise<UserPersona | null> {
    const { data, error } = await supabase
      .from('user_personas')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching persona:', error);
      return null;
    }

    return data;
  },

  async savePersona(persona: Partial<UserPersona> & { user_id: string }): Promise<UserPersona | null> {
    const { data, error } = await supabase
      .from('user_personas')
      .upsert(persona)
      .select()
      .single();

    if (error) {
      console.error('Error saving persona:', error);
      return null;
    }

    return data;
  }
};
