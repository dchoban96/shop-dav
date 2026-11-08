-- Shop B2B DAV — prezzi cliente in blocco (catalogo e scheda articolo)
-- Il cliente vede solo il suo prezzo (BRIEF): la griglia del catalogo chiede in un
-- colpo solo il prezzo finale di tutti gli articoli della pagina, riusando
-- prezzo_cliente riga per riga così la regola di precedenza resta una sola.
create or replace function public.prezzi_cliente(p_cliente_id bigint, p_cod_dav text[])
returns table (
  cod_dav          text,
  listino          numeric,
  prezzo_finale    numeric,
  origine          text
)
language sql stable security definer
set search_path = public
as $$
  select ar.cod_dav, p.listino, p.prezzo_finale, p.origine
  from unnest(p_cod_dav) as u(cod)
  join public.articoli ar on ar.cod_dav = u.cod
  cross join lateral public.prezzo_cliente(p_cliente_id, ar.cod_dav) p
$$;

revoke all on function public.prezzi_cliente(bigint, text[]) from public;
grant execute on function public.prezzi_cliente(bigint, text[]) to authenticated;
