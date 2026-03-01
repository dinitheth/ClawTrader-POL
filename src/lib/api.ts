import sql from '@/lib/db';
import type { Agent, AgentInsert, Match, Profile, Bet, EvolutionLog } from '@/lib/db-types';

// ─── Agent CRUD ────────────────────────────────────────────────────────────────
export const agentService = {
  async getAll(): Promise<Agent[]> {
    const rows = await sql`
      SELECT * FROM agents
      ORDER BY total_won DESC NULLS LAST
    `;
    return rows as Agent[];
  },

  async getByOwner(ownerId: string): Promise<Agent[]> {
    const rows = await sql`
      SELECT * FROM agents
      WHERE owner_id = ${ownerId}
      ORDER BY created_at DESC
    `;
    return rows as Agent[];
  },

  async getByWallet(walletAddress: string): Promise<Agent[]> {
    const rows = await sql`
      SELECT * FROM agents
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
    `;
    return rows as Agent[];
  },

  async getById(id: string): Promise<Agent | null> {
    const rows = await sql`
      SELECT * FROM agents WHERE id = ${id} LIMIT 1
    `;
    return (rows[0] as Agent) ?? null;
  },

  async create(agent: Partial<AgentInsert>): Promise<Agent> {
    const rows = await sql`
      INSERT INTO agents (
        owner_id, wallet_address, onchain_tx_hash,
        name, avatar, bio,
        generation, mutation_count,
        dna_risk_tolerance, dna_aggression, dna_pattern_recognition,
        dna_timing_sensitivity, dna_contrarian_bias,
        personality, deception_skill, alliance_tendency, betrayal_threshold,
        can_self_modify, balance, is_active
      ) VALUES (
        ${agent.owner_id ?? null},
        ${agent.wallet_address ?? null},
        ${agent.onchain_tx_hash ?? null},
        ${agent.name},
        ${agent.avatar ?? '🦞'},
        ${agent.bio ?? null},
        ${agent.generation ?? 1},
        ${agent.mutation_count ?? 0},
        ${agent.dna_risk_tolerance ?? 0.5},
        ${agent.dna_aggression ?? 0.5},
        ${agent.dna_pattern_recognition ?? 0.5},
        ${agent.dna_timing_sensitivity ?? 0.5},
        ${agent.dna_contrarian_bias ?? 0.5},
        ${agent.personality ?? 'adaptive'},
        ${agent.deception_skill ?? 0.15},
        ${agent.alliance_tendency ?? 0.5},
        ${agent.betrayal_threshold ?? 0.3},
        ${agent.can_self_modify ?? false},
        ${agent.balance ?? 500},
        ${agent.is_active ?? true}
      )
      RETURNING *
    `;
    return rows[0] as Agent;
  },

  async update(id: string, updates: Partial<Agent>): Promise<Agent> {
    // Build dynamic SET clause
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const allowed = [
      'name', 'avatar', 'bio', 'personality', 'balance', 'is_active',
      'is_in_match', 'total_matches', 'wins', 'losses', 'total_pnl',
      'best_pnl', 'worst_pnl', 'win_streak', 'current_streak',
      'total_wagered', 'total_won', 'mutation_count', 'can_self_modify',
      'modification_history', 'dna_risk_tolerance', 'dna_aggression',
      'dna_pattern_recognition', 'dna_timing_sensitivity', 'dna_contrarian_bias',
      'deception_skill', 'alliance_tendency', 'betrayal_threshold',
      'onchain_tx_hash', 'wallet_address'
    ];

    for (const key of allowed) {
      if (key in updates) {
        setClauses.push(`${key} = $${idx++}`);
        values.push((updates as any)[key]);
      }
    }

    if (setClauses.length === 0) {
      return (await agentService.getById(id))!;
    }

    // Use query for dynamic statements
    const rows = await sql.query(
      `UPDATE agents SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
      [...values, id]
    );
    return rows[0] as Agent;
  },

  async getLeaderboard(limit = 10): Promise<Agent[]> {
    const rows = await sql`
      SELECT * FROM agents
      ORDER BY total_won DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows as Agent[];
  },

  async getAvailableForMatch(): Promise<Agent[]> {
    const rows = await sql`
      SELECT * FROM agents
      WHERE is_in_match = false
        AND is_active = true
        AND balance > 0
    `;
    return rows as Agent[];
  },
};

// ─── Match Service ─────────────────────────────────────────────────────────────
export const matchService = {
  async getAll(): Promise<Match[]> {
    const rows = await sql`
      SELECT
        m.*,
        row_to_json(a1.*) AS agent1,
        row_to_json(a2.*) AS agent2
      FROM matches m
      LEFT JOIN agents a1 ON a1.id = m.agent1_id
      LEFT JOIN agents a2 ON a2.id = m.agent2_id
      ORDER BY m.created_at DESC
    `;
    return rows as Match[];
  },

  async getLive(): Promise<Match[]> {
    const rows = await sql`
      SELECT
        m.*,
        row_to_json(a1.*) AS agent1,
        row_to_json(a2.*) AS agent2
      FROM matches m
      LEFT JOIN agents a1 ON a1.id = m.agent1_id
      LEFT JOIN agents a2 ON a2.id = m.agent2_id
      WHERE m.status = 'active'
      ORDER BY m.started_at DESC
    `;
    return rows as Match[];
  },

  async getPending(): Promise<Match[]> {
    const rows = await sql`
      SELECT
        m.*,
        row_to_json(a1.*) AS agent1,
        row_to_json(a2.*) AS agent2
      FROM matches m
      LEFT JOIN agents a1 ON a1.id = m.agent1_id
      LEFT JOIN agents a2 ON a2.id = m.agent2_id
      WHERE m.status = 'pending'
      ORDER BY m.created_at DESC
    `;
    return rows as Match[];
  },

  async getRecent(limit = 10): Promise<Match[]> {
    const rows = await sql`
      SELECT
        m.*,
        row_to_json(a1.*) AS agent1,
        row_to_json(a2.*) AS agent2
      FROM matches m
      LEFT JOIN agents a1 ON a1.id = m.agent1_id
      LEFT JOIN agents a2 ON a2.id = m.agent2_id
      WHERE m.status IN ('active', 'completed')
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;
    return rows as Match[];
  },

  async create(agent1Id: string, agent2Id: string, wagerAmount: number): Promise<Match> {
    const rows = await sql`
      INSERT INTO matches (agent1_id, agent2_id, wager_amount, total_pot)
      VALUES (${agent1Id}, ${agent2Id}, ${wagerAmount}, ${wagerAmount * 2})
      RETURNING *
    `;
    return rows[0] as Match;
  },

  async update(id: string, updates: Partial<Match>): Promise<Match> {
    const allowed = [
      'status', 'started_at', 'ended_at', 'winner_id',
      'agent1_final_pnl', 'agent2_final_pnl', 'total_pot',
      'match_log', 'commentary', 'alliance_formed', 'alliance_betrayed'
    ];
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (key in updates) {
        setClauses.push(`${key} = $${idx++}`);
        values.push((updates as any)[key]);
      }
    }

    if (setClauses.length === 0) return updates as Match;

    const rows = await sql.query(
      `UPDATE matches SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
      [...values, id]
    );
    return rows[0] as Match;
  },

  // Polling-based subscription (replaces Supabase realtime)
  subscribeToMatch(matchId: string, callback: (match: Match) => void) {
    const interval = setInterval(async () => {
      try {
        const rows = await sql`SELECT * FROM matches WHERE id = ${matchId} LIMIT 1`;
        if (rows[0]) callback(rows[0] as Match);
      } catch (e) {
        console.error('Match poll error:', e);
      }
    }, 3000);
    return { unsubscribe: () => clearInterval(interval) };
  },

  subscribeToLiveMatches(callback: (match: Match) => void) {
    const interval = setInterval(async () => {
      try {
        const rows = await sql`
          SELECT * FROM matches WHERE status IN ('active', 'pending')
          ORDER BY created_at DESC LIMIT 20
        `;
        rows.forEach((r) => callback(r as Match));
      } catch (e) {
        console.error('Live matches poll error:', e);
      }
    }, 4000);
    return { unsubscribe: () => clearInterval(interval) };
  },
};

// ─── Profile Service ────────────────────────────────────────────────────────────
export const profileService = {
  async getOrCreateByWallet(walletAddress: string): Promise<Profile> {
    // Try to get existing
    const existing = await sql`
      SELECT * FROM profiles WHERE wallet_address = ${walletAddress} LIMIT 1
    `;
    if (existing[0]) return existing[0] as Profile;

    // Create new
    const created = await sql`
      INSERT INTO profiles (wallet_address, claw_balance)
      VALUES (${walletAddress}, 1000)
      RETURNING *
    `;
    return created[0] as Profile;
  },

  async getByWallet(walletAddress: string): Promise<Profile | null> {
    const rows = await sql`
      SELECT * FROM profiles WHERE wallet_address = ${walletAddress} LIMIT 1
    `;
    return (rows[0] as Profile) ?? null;
  },

  async getProfileCount(): Promise<number> {
    const rows = await sql`SELECT COUNT(*)::int AS count FROM profiles`;
    return rows[0]?.count ?? 0;
  },

  async update(id: string, updates: Partial<Profile>): Promise<Profile> {
    const allowed = ['display_name', 'claw_balance', 'total_winnings', 'total_bets_placed'];
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (key in updates) {
        setClauses.push(`${key} = $${idx++}`);
        values.push((updates as any)[key]);
      }
    }

    if (setClauses.length === 0) return updates as Profile;

    const rows = await sql.query(
      `UPDATE profiles SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
      [...values, id]
    );
    return rows[0] as Profile;
  },
};

// ─── Betting Service ────────────────────────────────────────────────────────────
export const bettingService = {
  async placeBet(
    bettorId: string,
    matchId: string,
    predictedWinnerId: string,
    amount: number,
    odds: number
  ): Promise<Bet> {
    const rows = await sql`
      INSERT INTO bets (bettor_id, match_id, predicted_winner_id, amount, odds, potential_payout)
      VALUES (${bettorId}, ${matchId}, ${predictedWinnerId}, ${amount}, ${odds}, ${amount * odds})
      RETURNING *
    `;
    return rows[0] as Bet;
  },

  async getBetsForMatch(matchId: string): Promise<Bet[]> {
    const rows = await sql`
      SELECT * FROM bets WHERE match_id = ${matchId}
    `;
    return rows as Bet[];
  },

  async getUserBets(profileId: string): Promise<Bet[]> {
    const rows = await sql`
      SELECT
        b.*,
        row_to_json(m.*) AS match
      FROM bets b
      LEFT JOIN matches m ON m.id = b.match_id
      WHERE b.bettor_id = ${profileId}
      ORDER BY b.placed_at DESC
    `;
    return rows as Bet[];
  },
};

// ─── Evolution Log ──────────────────────────────────────────────────────────────
export const evolutionService = {
  async log(entry: Omit<EvolutionLog, 'id' | 'created_at'>): Promise<EvolutionLog> {
    const rows = await sql`
      INSERT INTO evolution_log (
        agent_id, match_id, evolution_type,
        dna_before, dna_after, trigger_reason, modification_code
      ) VALUES (
        ${entry.agent_id ?? null},
        ${entry.match_id ?? null},
        ${entry.evolution_type},
        ${JSON.stringify(entry.dna_before)},
        ${JSON.stringify(entry.dna_after)},
        ${entry.trigger_reason ?? null},
        ${entry.modification_code ?? null}
      )
      RETURNING *
    `;
    return rows[0] as EvolutionLog;
  },

  async getForAgent(agentId: string): Promise<EvolutionLog[]> {
    const rows = await sql`
      SELECT * FROM evolution_log
      WHERE agent_id = ${agentId}
      ORDER BY created_at DESC
    `;
    return rows as EvolutionLog[];
  },
};
