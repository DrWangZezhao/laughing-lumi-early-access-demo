begin;
create table public.early_adopters (
 id uuid primary key default gen_random_uuid(),
 email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 role text not null check (role in ('parent','teacher')),
 interested_in_pilot boolean not null default false,
 contact_consent boolean not null check (contact_consent),
 consent_timestamp timestamptz not null default now(),
 privacy_notice_version text not null check (length(privacy_notice_version) between 1 and 80),
 preferred_language text not null check (preferred_language in ('EN','FI','ZH','SV','ES')),
 created_at timestamptz not null default now(),
 status text not null default 'waitlisted' check (status in ('waitlisted','invited','withdrawn'))
);
create unique index early_adopters_active_email on public.early_adopters(email) where status in ('waitlisted','invited');
alter table public.early_adopters enable row level security;
alter table public.early_adopters force row level security;
revoke all on public.early_adopters from public, anon, authenticated;
grant select, insert, update, delete on public.early_adopters to service_role;
-- No public RLS policies. No email, IP or visitor identifiers in rate counters.
create table public.signup_budget (
 singleton boolean primary key default true check(singleton),
 minute_start timestamptz not null,
 minute_count integer not null,
 day_start timestamptz not null,
 day_count integer not null
);
alter table public.signup_budget enable row level security;
alter table public.signup_budget force row level security;
revoke all on public.signup_budget from public, anon, authenticated;
grant select, insert, update on public.signup_budget to service_role;
-- One atomic transaction serializes quota checks and insert/duplicate handling.
create function public.register_early_adopter(p_email text,p_role text,p_pilot boolean,p_language text,p_notice text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare budget public.signup_budget%rowtype;
declare moment timestamptz := clock_timestamp();
begin
 insert into public.signup_budget values(true,date_trunc('minute',moment),0,date_trunc('day',moment),0) on conflict do nothing;
 select * into budget from public.signup_budget where singleton for update;
 if budget.minute_start <> date_trunc('minute',moment) then budget.minute_count:=0; end if;
 if budget.day_start <> date_trunc('day',moment) then budget.day_count:=0; end if;
 if budget.minute_count>=10 or budget.day_count>=300 then return false; end if;
 update public.signup_budget set minute_start=date_trunc('minute',moment),minute_count=budget.minute_count+1,
 day_start=date_trunc('day',moment),day_count=budget.day_count+1 where singleton;
 insert into public.early_adopters(email,role,interested_in_pilot,contact_consent,preferred_language,privacy_notice_version)
 values(p_email,p_role,p_pilot,true,p_language,p_notice)
 on conflict(email) where status in ('waitlisted','invited') do nothing;
 -- True also confirms an existing active record. Never overwrite someone else's consent.
 return true;
end;
$$;
revoke all on function public.register_early_adopter(text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.register_early_adopter(text,text,boolean,text,text) to service_role;
commit;
