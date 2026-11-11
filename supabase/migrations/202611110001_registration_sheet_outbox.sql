begin;
create table public.registration_sheet_outbox (
 record_id uuid primary key references public.early_adopters(id) on delete cascade,
 email text not null,
 role text not null,
 interested_in_pilot boolean not null,
 contact_consent boolean not null,
 consent_timestamp timestamptz not null,
 privacy_notice_version text not null,
 preferred_language text not null,
 created_at timestamptz not null,
 status text not null,
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 synced_at timestamptz,
 last_error text,
 updated_at timestamptz not null default now()
);
alter table public.registration_sheet_outbox enable row level security;
alter table public.registration_sheet_outbox force row level security;
revoke all on public.registration_sheet_outbox from public, anon, authenticated;
grant select, update on public.registration_sheet_outbox to service_role;

create or replace function public.register_early_adopter(p_email text,p_role text,p_pilot boolean,p_language text,p_notice text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare budget public.signup_budget%rowtype;
declare adopter public.early_adopters%rowtype;
declare moment timestamptz := clock_timestamp();
begin
 insert into public.signup_budget values(true,date_trunc('minute',moment),0,date_trunc('day',moment),0) on conflict do nothing;
 select * into budget from public.signup_budget where singleton for update;
 if budget.minute_start <> date_trunc('minute',moment) then budget.minute_count:=0; end if;
 if budget.day_start <> date_trunc('day',moment) then budget.day_count:=0; end if;
 if budget.minute_count>=10 or budget.day_count>=300 then return false; end if;
 update public.signup_budget set minute_start=date_trunc('minute',moment),minute_count=budget.minute_count+1,day_start=date_trunc('day',moment),day_count=budget.day_count+1 where singleton;
 insert into public.early_adopters(email,role,interested_in_pilot,contact_consent,preferred_language,privacy_notice_version)
 values(p_email,p_role,p_pilot,true,p_language,p_notice)
 on conflict(email) where status in ('waitlisted','invited') do nothing;
 select * into adopter from public.early_adopters where email=p_email and status in ('waitlisted','invited') limit 1;
 insert into public.registration_sheet_outbox(record_id,email,role,interested_in_pilot,contact_consent,consent_timestamp,privacy_notice_version,preferred_language,created_at,status)
 values(adopter.id,adopter.email,adopter.role,adopter.interested_in_pilot,adopter.contact_consent,adopter.consent_timestamp,adopter.privacy_notice_version,adopter.preferred_language,adopter.created_at,adopter.status)
 on conflict(record_id) do nothing;
 return true;
end;
$$;
revoke all on function public.register_early_adopter(text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.register_early_adopter(text,text,boolean,text,text) to service_role;
commit;
