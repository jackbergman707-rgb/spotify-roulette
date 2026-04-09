-- RPC used by server-side reveal logic to increment player scores atomically
create or replace function increment_score(p_player_id uuid, p_amount int)
returns void
language plpgsql
security definer
as $$
begin
  update players
  set score = score + p_amount
  where id = p_player_id;
end;
$$;
