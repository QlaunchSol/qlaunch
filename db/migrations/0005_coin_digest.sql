-- The signed digest on every coin, so the grid can draw each coin's signature chains.
-- (Columns can only be appended to a view.)
create or replace view coins as
select l.mint, l.name, l.symbol, l.description, l.image_url, l.metadata_uri, l.twitter, l.telegram,
       l.creator, l.pq_address, l.leaf, l.dev_buy_sol, l.tx_signature, l.created_at, l.launched_at,
       m.price_usd, m.market_cap_usd, m.volume_24h_usd, m.holders, m.curve_progress,
       coalesce(m.complete, false) as complete, m.updated_at as market_updated_at,
       l.dev_tokens, l.digest
from launches l
left join launch_market m on m.mint = l.mint
where l.status = 'live' and not l.hidden;
