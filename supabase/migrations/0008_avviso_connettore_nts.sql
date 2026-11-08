-- Shop B2B DAV — avviso "connettore NTS muto" da un job programmato in Supabase.
--
-- Il connettore in LAN scrive un heartbeat in impostazioni.connettore_nts a ogni giro (30 s).
-- Ogni minuto pg_cron esegue controlla_connettore_nts(): se l'ultimo heartbeat è più vecchio
-- di 5 minuti manda un'email all'ufficio con pg_net → API Resend. Al massimo un'email all'ora
-- per lo stesso silenzio; un nuovo silenzio dopo che il connettore era ripartito riparte subito.
-- Non dipende né dal connettore (che può essere spento) né dallo shop (nessuno deve aprire pagine).
--
-- PREREQUISITO, da fare una volta a mano nel SQL Editor (la chiave non va mai nel repo):
--   select vault.create_secret('<chiave Resend re_...>', 'resend_api_key', 'Resend: avvisi connettore NTS');
-- Senza la chiave il job registra l'avviso in impostazioni.connettore_nts_allarme con
-- esito "chiave Resend mancante" e non manda niente.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Ora di ricezione dell'heartbeat data dal database, non dall'orologio della macchina in LAN.
create or replace function public.impostazioni_heartbeat_ricevuto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.chiave = 'connettore_nts' and jsonb_typeof(new.valore) = 'object' then
    new.valore := new.valore || jsonb_build_object('ricevuto_il', now());
  end if;
  return new;
end;
$$;

drop trigger if exists impostazioni_heartbeat on public.impostazioni;
create trigger impostazioni_heartbeat before insert or update on public.impostazioni
  for each row execute function public.impostazioni_heartbeat_ricevuto();

-- Controllo eseguito dal job. Restituisce cosa ha fatto (utile da SQL Editor: select public.controlla_connettore_nts();).
create or replace function public.controlla_connettore_nts(p_minuti integer default 5, p_ripeti_minuti integer default 60)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hb          jsonb;
  v_ultimo      timestamptz;
  v_minuti      integer;
  v_allarme     jsonb;
  v_ultimo_avv  timestamptz;
  v_chiave      text;
  v_a           text;
  v_da          text;
  v_testo       text;
  v_richiesta   bigint;
begin
  select valore into v_hb from public.impostazioni where chiave = 'connettore_nts';
  if v_hb is null then
    return 'connettore mai avviato: nessun avviso';
  end if;
  v_ultimo := coalesce((v_hb ->> 'ricevuto_il')::timestamptz, (v_hb ->> 'ultimo_giro')::timestamptz);
  if v_ultimo is null then
    return 'heartbeat senza data';
  end if;
  v_minuti := floor(extract(epoch from now() - v_ultimo) / 60);
  if v_minuti < p_minuti then
    return 'connettore attivo';
  end if;

  select valore into v_allarme from public.impostazioni where chiave = 'connettore_nts_allarme';
  v_ultimo_avv := (v_allarme ->> 'inviato_il')::timestamptz;
  if v_ultimo_avv is not null and v_ultimo_avv > v_ultimo and now() - v_ultimo_avv < make_interval(mins => p_ripeti_minuti) then
    return 'silenzio già segnalato';
  end if;

  select valore #>> '{}' into v_a from public.impostazioni where chiave = 'email_ordini';
  select valore #>> '{}' into v_da from public.impostazioni where chiave = 'mittente_email';
  v_a := coalesce(nullif(v_a, ''), 'info@davsnc.it');
  v_da := coalesce(nullif(v_da, ''), 'ordini@davsnc.it');
  if v_da not like '%<%' then
    v_da := 'DAV Ordini <' || v_da || '>';
  end if;

  select decrypted_secret into v_chiave from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if v_chiave is null or v_chiave = '' then
    insert into public.impostazioni (chiave, valore)
    values ('connettore_nts_allarme', jsonb_build_object('inviato_il', now(), 'minuti', v_minuti, 'esito', 'chiave Resend mancante in Vault: email non inviata'))
    on conflict (chiave) do update set valore = excluded.valore;
    return 'chiave Resend mancante';
  end if;

  v_testo :=
    'Il connettore NTS non si fa sentire da ' || v_minuti || ' minuti (ultimo segnale: '
    || to_char(v_ultimo at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI') || ').' || chr(10)
    || 'Gli ordini dello shop non stanno entrando in NTS in automatico.' || chr(10) || chr(10)
    || 'Controllare che la macchina del connettore sia accesa e in rete e che il servizio ShopDavConnettoreNts sia avviato.' || chr(10)
    || 'Nel frattempo gli ordini restano in coda e partono appena il connettore riparte; l''email di ogni ordine arriva comunque.' || chr(10)
    || 'Se serve evaderli prima: inserirli a mano in NTS e segnarli "inserito a mano" nel portale.';

  v_richiesta := net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object('from', v_da, 'to', jsonb_build_array(v_a), 'subject', '[Shop DAV] Connettore NTS fermo', 'text', v_testo),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_chiave, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );

  insert into public.impostazioni (chiave, valore)
  values ('connettore_nts_allarme', jsonb_build_object('inviato_il', now(), 'minuti', v_minuti, 'a', v_a, 'richiesta_pg_net', v_richiesta, 'esito', 'email inviata a Resend'))
  on conflict (chiave) do update set valore = excluded.valore;
  return 'avviso inviato';
end;
$$;

revoke all on function public.controlla_connettore_nts(integer, integer) from public, anon, authenticated;
revoke all on function public.impostazioni_heartbeat_ricevuto() from public, anon, authenticated;

-- Job ogni minuto (rieseguire la migrazione aggiorna il job con lo stesso nome, non lo duplica).
select cron.schedule('connettore-nts-muto', '* * * * *', 'select public.controlla_connettore_nts()');
