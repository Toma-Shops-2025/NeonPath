import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { type User } from '@supabase/supabase-js';
import { toast } from 'sonner';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

        if (error) {
            console.error("Auth: fetchProfile error", error);
            return;
        }

        if (data) {
            setProfile(data);
        } else {
            const { data: { session } } = await supabase.auth.getSession();
            const username = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0] || 'NeonGamer';

            const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    username: username,
                    cash_balance: 0,
                    total_earned: 0
                })
                .select()
                .single();

            if (!createError) setProfile(newProfile);
        }
    } catch (e) {
        console.error("Auth: fetchProfile critical error", e);
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
          setUser(session.user);
          fetchProfile(session.user.id);
      } else {
          setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
          setUser(session.user);
          fetchProfile(session.user.id);
      } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  /**
   * Add money to the player's balance.
   * @param amount The dollar amount (e.g. 0.05)
   * @param game The name of the game/level
   */
  const addCash = useCallback(async (amount: number, game: string = 'Neon Path') => {
    if (!user) return;

    try {
        const { error } = await supabase.rpc('claim_game_reward', {
            p_game: game,
            p_score: 1, // Placeholder score
            p_reward_est: amount
        });

        if (error) throw error;

        await fetchProfile(user.id);
    } catch (e: any) {
        console.error("Cash sync failed", e);
        toast.error("Failed to save reward: " + e.message);
    }
  }, [user, fetchProfile]);

  const signIn = async (email: string, pass: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  };

  const signUp = async (email: string, pass: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: { data: { username } }
    });
    if (error) throw error;
    if (data.user) {
        await supabase.from('profiles').insert({
            id: data.user.id,
            username,
            email,
            cash_balance: 0,
            total_earned: 0
        });
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, profile, loading, signIn, signUp, signOut, addCash, supabase, fetchProfile };
}
