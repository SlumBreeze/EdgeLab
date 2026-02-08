import { supabase } from './supabaseClient';

export interface UserPersona {
  user_id: string;
  min_edge_percentage: number;
  volume_mode: string;
  max_odds_american: number;
  risk_tolerance: string;
  active_sports: string[];
  decision_mode?: "MATH_STRICT" | "HYBRID_PRO" | "QUALITATIVE_PRO";
  updated_at?: string;
}

export const personaService = {
  async getPersona(userId: string): Promise<UserPersona | null> {
    // UUID validation guard
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      console.warn('Invalid or missing UUID for persona fetch:', userId);
      return null;
    }

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
    // UUID validation guard
    if (!persona.user_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(persona.user_id)) {
      console.error('Cannot save persona: Invalid or missing UUID:', persona.user_id);
      return null;
    }

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
