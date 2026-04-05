import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import confetti from 'canvas-confetti';

const MONTH_KEY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const DAY_KEY = () => new Date().toISOString().split('T')[0];

export function useGameScoring() {
  const [profile, setProfile] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        loadProfile(data.user.id);
      }
    });
  }, []);

  const loadProfile = async (uid) => {
    const { data } = await supabase.from('player_profiles').select('*').eq('user_id', uid).single();
    if (data) setProfile(data);
  };

  const submitScore = useCallback(async (gameSlug, rawScore, pointsAwarded) => {
    if (!userId || !profile) return { newBest: false, position: null };

    const monthKey = MONTH_KEY();

    // Save score
    await supabase.from('game_scores').insert({
      user_id: userId,
      display_name: profile.display_name,
      game_slug: gameSlug,
      raw_score: rawScore,
      points_awarded: pointsAwarded,
      month_key: monthKey,
    });

    // Update personal best
    const { data: currentBest } = await supabase.from('personal_bests')
      .select('best_score').eq('user_id', userId).eq('game_slug', gameSlug).single();

    let newBest = false;
    if (!currentBest) {
      await supabase.from('personal_bests').insert({
        user_id: userId, game_slug: gameSlug, best_score: rawScore,
      });
      newBest = true;
    } else if (rawScore > currentBest.best_score) {
      await supabase.from('personal_bests').update({ best_score: rawScore, achieved_at: new Date().toISOString() })
        .eq('user_id', userId).eq('game_slug', gameSlug);
      newBest = true;
    }

    // Update leaderboard
    const { data: lb } = await supabase.from('monthly_leaderboard')
      .select('total_points').eq('user_id', userId).eq('month_key', monthKey).single();

    if (!lb) {
      await supabase.from('monthly_leaderboard').insert({
        user_id: userId, display_name: profile.display_name,
        avatar_emoji: profile.avatar_emoji, total_points: pointsAwarded,
        month_key: monthKey, rank: 99,
      });
    } else {
      await supabase.from('monthly_leaderboard').update({
        total_points: lb.total_points + pointsAwarded,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('month_key', monthKey);
    }

    // Get position
    const { data: allLb } = await supabase.from('monthly_leaderboard')
      .select('user_id, total_points').eq('month_key', monthKey)
      .order('total_points', { ascending: false });

    const position = allLb ? allLb.findIndex(r => r.user_id === userId) + 1 : null;

    // Update ranks
    if (allLb) {
      for (let i = 0; i < allLb.length; i++) {
        await supabase.from('monthly_leaderboard').update({ rank: i + 1 })
          .eq('user_id', allLb[i].user_id).eq('month_key', monthKey);
      }
    }

    if (newBest) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
    }

    return { newBest, position };
  }, [userId, profile]);

  const getPersonalBest = useCallback(async (gameSlug) => {
    if (!userId) return null;
    const { data } = await supabase.from('personal_bests')
      .select('best_score').eq('user_id', userId).eq('game_slug', gameSlug).single();
    return data?.best_score || null;
  }, [userId]);

  const getTodayScoreCount = useCallback(async (gameSlug) => {
    if (!userId) return 0;
    const today = DAY_KEY();
    const { count } = await supabase.from('game_scores')
      .select('id', { count: 'exact' })
      .eq('user_id', userId).eq('game_slug', gameSlug)
      .gte('played_at', `${today}T00:00:00`)
      .lte('played_at', `${today}T23:59:59`);
    return count || 0;
  }, [userId]);

  const getDailyLeader = useCallback(async (gameSlug) => {
    const today = DAY_KEY();
    const { data } = await supabase.from('game_scores')
      .select('display_name, raw_score')
      .eq('game_slug', gameSlug)
      .gte('played_at', `${today}T00:00:00`)
      .order('raw_score', { ascending: false })
      .limit(1);
    return data?.[0] || null;
  }, []);

  return { profile, userId, submitScore, getPersonalBest, getTodayScoreCount, getDailyLeader };
}
