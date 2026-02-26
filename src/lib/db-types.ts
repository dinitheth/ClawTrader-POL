// Database type definitions for the ClawTrader Neon database

export type AgentPersonality =
    | 'aggressive'
    | 'cautious'
    | 'deceptive'
    | 'adaptive'
    | 'chaotic'
    | 'calculating';

export type MatchStatus = 'pending' | 'active' | 'completed' | 'cancelled';
export type AllianceStatus = 'proposed' | 'active' | 'betrayed' | 'dissolved';

export interface Agent {
    id: string;
    owner_id: string | null;
    wallet_address: string | null;
    onchain_tx_hash: string | null;
    name: string;
    avatar: string;
    bio: string | null;
    generation: number;
    parent_id: string | null;
    mutation_count: number | null;
    dna_risk_tolerance: number;
    dna_aggression: number;
    dna_pattern_recognition: number;
    dna_timing_sensitivity: number;
    dna_contrarian_bias: number;
    personality: AgentPersonality;
    deception_skill: number | null;
    alliance_tendency: number | null;
    betrayal_threshold: number | null;
    can_self_modify: boolean | null;
    modification_history: any | null;
    total_matches: number | null;
    wins: number | null;
    losses: number | null;
    total_pnl: number | null;
    best_pnl: number | null;
    worst_pnl: number | null;
    win_streak: number | null;
    current_streak: number | null;
    balance: number | null;
    total_wagered: number | null;
    total_won: number | null;
    is_active: boolean | null;
    is_in_match: boolean | null;
    created_at: string;
    updated_at: string;
}

export type AgentInsert = Omit<Agent, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
    created_at?: string;
    updated_at?: string;
};

export interface Profile {
    id: string;
    user_id: string | null;
    wallet_address: string | null;
    display_name: string | null;
    claw_balance: number | null;
    total_winnings: number | null;
    total_bets_placed: number | null;
    created_at: string;
    updated_at: string;
}

export interface Match {
    id: string;
    agent1_id: string | null;
    agent2_id: string | null;
    wager_amount: number;
    duration_seconds: number;
    market_scenario: any | null;
    status: MatchStatus;
    started_at: string | null;
    ended_at: string | null;
    winner_id: string | null;
    agent1_final_pnl: number | null;
    agent2_final_pnl: number | null;
    total_pot: number | null;
    match_log: any | null;
    commentary: any | null;
    alliance_formed: boolean | null;
    alliance_betrayed: boolean | null;
    network: string | null;
    created_at: string;
    updated_at: string;
    // Joined fields
    agent1?: Agent;
    agent2?: Agent;
}

export interface EvolutionLog {
    id: string;
    agent_id: string | null;
    match_id: string | null;
    evolution_type: string;
    dna_before: any;
    dna_after: any;
    trigger_reason: string | null;
    modification_code: string | null;
    created_at: string;
}

export interface Bet {
    id: string;
    bettor_id: string | null;
    match_id: string | null;
    predicted_winner_id: string | null;
    amount: number;
    odds: number;
    potential_payout: number;
    is_settled: boolean | null;
    is_won: boolean | null;
    actual_payout: number | null;
    placed_at: string;
    settled_at: string | null;
    match?: Match;
}
