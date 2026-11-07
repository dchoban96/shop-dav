-- Shop B2B DAV — viste di supporto al catalogo (conteggi per famiglia e per marchio)
-- security_invoker: le viste rispettano le policy RLS di chi le interroga.

create or replace view public.v_famiglie_catalogo
with (security_invoker = true) as
select f.id, f.nome, count(a.cod_dav)::integer as n_articoli
from public.famiglie f
left join public.articoli a on a.famiglia_id = f.id and a.attivo
group by f.id, f.nome
having count(a.cod_dav) > 0
order by f.nome;

create or replace view public.v_marchi_catalogo
with (security_invoker = true) as
select fo.id, fo.nome_nts, fo.nome_breve, fo.logo_path, fo.cartella_foto,
       count(a.cod_dav)::integer as n_articoli,
       coalesce(sum(a.fatturato_12m), 0)::numeric(14,2) as fatturato_12m
from public.fornitori fo
left join public.articoli a on a.fornitore_id = fo.id and a.attivo
where fo.attivo
group by fo.id, fo.nome_nts, fo.nome_breve, fo.logo_path, fo.cartella_foto
having count(a.cod_dav) > 0
order by count(a.cod_dav) desc, fo.nome_breve;

grant select on public.v_famiglie_catalogo, public.v_marchi_catalogo to authenticated;
