ALTER TABLE "embeddings" ADD COLUMN "search_vector" tsvector generated always as (to_tsvector('english', content)) stored NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "searchVectorIndex" ON "embeddings" USING gin ("search_vector");

-- https://supabase.com/docs/guides/ai/hybrid-search
create or replace function hybrid_search(
  game_id string,
  query_text text,
  query_embedding vector(1536),
  match_count int,
  full_text_weight float = 1,
  semantic_weight float = 1,
  rrf_k int = 50
)
returns setof embeddings
language sql
as $$
with full_text as (
  select
    id,
    -- Note: ts_rank_cd is not indexable but will only rank matches of the where clause
    -- which shouldn't be too big
    row_number() over(order by ts_rank_cd(search_vector, websearch_to_tsquery(query_text)) desc) as rank_ix
  from
    embeddings
  where
    search_vector @@ websearch_to_tsquery(query_text)
    and game_id = game_id
  order by rank_ix
  limit least(match_count, 30) * 2
),
semantic as (
  select
    id,
    row_number() over (order by embedding <#> query_embedding) as rank_ix
  from
    embeddings
  where
    game_id = game_id
  order by rank_ix
  limit least(match_count, 30) * 2
)
select
  embeddings.*
from
  full_text
  full outer join semantic
    on full_text.id = semantic.id
  join embeddings
    on coalesce(full_text.id, semantic.id) = embeddings.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 30)
$$;
