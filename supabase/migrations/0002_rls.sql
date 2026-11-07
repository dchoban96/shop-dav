-- Shop B2B DAV — Row Level Security (STRUTTURA, sezione 2)
-- Regola: un cliente vede solo le proprie righe; il catalogo è leggibile da ogni
-- utente autenticato; scrive solo l'admin, tranne ordini/righe/telefoni del cliente.
-- Il service role (import, script) bypassa RLS per costruzione.

-- Funzioni di contesto ---------------------------------------------------------
create or replace function public.cliente_corrente()
returns bigint
language sql stable security definer
set search_path = public
as $$
  select cliente_id from public.utenti where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select ruolo = 'admin' from public.utenti where id = auth.uid()), false);
$$;

revoke all on function public.cliente_corrente() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.cliente_corrente() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Abilita RLS ovunque ------------------------------------------------------------
alter table public.fornitori          enable row level security;
alter table public.famiglie           enable row level security;
alter table public.articoli           enable row level security;
alter table public.giacenze           enable row level security;
alter table public.clienti            enable row level security;
alter table public.clienti_telefoni   enable row level security;
alter table public.utenti             enable row level security;
alter table public.inviti             enable row level security;
alter table public.condizioni_cliente enable row level security;
alter table public.storico_acquisti   enable row level security;
alter table public.acquisti_mensili   enable row level security;
alter table public.raccomandazioni    enable row level security;
alter table public.evidenze           enable row level security;
alter table public.fatture            enable row level security;
alter table public.ordini             enable row level security;
alter table public.righe_ordine       enable row level security;
alter table public.import_log         enable row level security;
alter table public.impostazioni       enable row level security;

-- Catalogo: lettura per tutti gli autenticati, scrittura admin ------------------
create policy fornitori_lettura   on public.fornitori for select to authenticated using (true);
create policy fornitori_pubblici  on public.fornitori for select to anon using (pubblicato and attivo);
create policy fornitori_admin     on public.fornitori for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy famiglie_lettura    on public.famiglie for select to authenticated using (true);
create policy famiglie_admin      on public.famiglie for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy articoli_lettura    on public.articoli for select to authenticated using (attivo or public.is_admin());
create policy articoli_admin      on public.articoli for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy giacenze_lettura    on public.giacenze for select to authenticated using (true);
create policy giacenze_admin      on public.giacenze for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy evidenze_lettura    on public.evidenze for select to authenticated using (true);
create policy evidenze_admin      on public.evidenze for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy impostazioni_lettura on public.impostazioni for select to authenticated using (true);
create policy impostazioni_admin   on public.impostazioni for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Dati del cliente: lettura propria o admin, scrittura admin --------------------
create policy clienti_propri      on public.clienti for select to authenticated using (id = public.cliente_corrente() or public.is_admin());
create policy clienti_admin       on public.clienti for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy telefoni_propri     on public.clienti_telefoni for all to authenticated
  using (cliente_id = public.cliente_corrente() or public.is_admin())
  with check (cliente_id = public.cliente_corrente() or public.is_admin());

create policy utenti_proprio      on public.utenti for select to authenticated using (id = auth.uid() or public.is_admin());
create policy utenti_admin        on public.utenti for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy inviti_admin        on public.inviti for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy condizioni_proprie  on public.condizioni_cliente for select to authenticated using (cliente_id = public.cliente_corrente() or public.is_admin());
create policy condizioni_admin    on public.condizioni_cliente for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy storico_proprio     on public.storico_acquisti for select to authenticated using (cliente_id = public.cliente_corrente() or public.is_admin());
create policy storico_admin       on public.storico_acquisti for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy mensili_propri      on public.acquisti_mensili for select to authenticated using (cliente_id = public.cliente_corrente() or public.is_admin());
create policy mensili_admin       on public.acquisti_mensili for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy raccomandazioni_proprie on public.raccomandazioni for select to authenticated using (cliente_id = public.cliente_corrente() or public.is_admin());
create policy raccomandazioni_admin   on public.raccomandazioni for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy fatture_proprie     on public.fatture for select to authenticated using (cliente_id = public.cliente_corrente() or public.is_admin());
create policy fatture_admin       on public.fatture for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Ordini: il cliente legge e crea i propri; lo stato lo cambia l'admin ---------
create policy ordini_propri       on public.ordini for select to authenticated using (cliente_id = public.cliente_corrente() or public.is_admin());
create policy ordini_inserimento  on public.ordini for insert to authenticated with check (cliente_id = public.cliente_corrente() and stato in ('bozza', 'inviato'));
create policy ordini_admin        on public.ordini for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy righe_proprie       on public.righe_ordine for select to authenticated
  using (exists (select 1 from public.ordini o where o.id = ordine_id and (o.cliente_id = public.cliente_corrente() or public.is_admin())));
create policy righe_inserimento   on public.righe_ordine for insert to authenticated
  with check (exists (select 1 from public.ordini o where o.id = ordine_id and o.cliente_id = public.cliente_corrente() and o.stato in ('bozza', 'inviato')));
create policy righe_admin         on public.righe_ordine for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Import: solo admin ---------------------------------------------------------------
create policy import_log_admin    on public.import_log for all to authenticated using (public.is_admin()) with check (public.is_admin());
