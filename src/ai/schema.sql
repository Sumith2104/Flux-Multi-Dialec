-- Flux AI Agent System Schema
-- Run this in your Supabase SQL Editor

-- 1. Enable Vector Extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Agent Sessions
CREATE TABLE IF NOT EXISTS fluxbase_global.agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES fluxbase_global.users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused_for_input', 'completed', 'failed'
    context JSONB DEFAULT '{}',          
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Agent Plans (Allows dynamic replanning)
CREATE TABLE IF NOT EXISTS fluxbase_global.agent_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES fluxbase_global.agent_sessions(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    steps JSONB NOT NULL,                
    current_step_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Long-Term Memories (Vector Search)
CREATE TABLE IF NOT EXISTS fluxbase_global.agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES fluxbase_global.users(id) ON DELETE CASCADE,
    memory_type VARCHAR(50) NOT NULL,    
    content TEXT NOT NULL,               
    embedding VECTOR(1536),              
    structured_data JSONB DEFAULT '{}',  
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for semantic search capability
CREATE INDEX ON fluxbase_global.agent_memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
