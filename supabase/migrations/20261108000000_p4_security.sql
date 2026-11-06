-- P4 Part 4 (security round): the storage limit is enforced by the database,
-- not only by the editor. A person cannot store more than their plan allows
-- even if they call the database directly with their own token.
--
-- The plan comes from profiles.plan (a person cannot change it: only the
-- server writes it); the size comes from the live Platform Config
-- (config_versions where live). With no live config the built-in default is
-- used (free plan: 2048 MB, see src/platform-config/defaults.ts).

create function public.storage_limit_mb(uid uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select (p -> 'limits' ->> 'storageMb')::numeric
      from public.config_versions cv
      cross join lateral jsonb_array_elements(cv.config -> 'plans') p
      where cv.live
        and p ->> 'id' = (select plan from public.profiles where id = uid)
      limit 1
    ),
    2048
  );
$$;
revoke all on function public.storage_limit_mb(uuid) from public, anon, authenticated;
grant execute on function public.storage_limit_mb(uuid) to service_role;

-- What a person stores, counted for the server (service role only): the
-- gateway uses it instead of a number the browser reports.
create function public.usage_of(uid uuid)
returns table (bytes bigint, projects bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(char_length(document) + coalesce(char_length(thumbnail), 0)) from public.projects where owner_id = uid), 0)
    + coalesce((select sum(size) from public.media where owner_id = uid), 0)
    + coalesce((select sum(char_length(document) + coalesce(char_length(thumbnail), 0)) from public.library_items where owner_id = uid), 0),
    (select count(*) from public.projects where owner_id = uid);
$$;
revoke all on function public.usage_of(uuid) from public, anon, authenticated;
grant execute on function public.usage_of(uuid) to service_role;

-- Before a row grows, the person's total must still fit the plan. A row that
-- shrinks or stays the same size is always allowed (so a person over the limit
-- can still delete and shrink).
create function public.enforce_storage_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_size bigint;
  old_size bigint := 0;
  used bigint;
begin
  if tg_table_name = 'media' then
    new_size := new.size;
    if tg_op = 'UPDATE' then old_size := old.size; end if;
  else
    new_size := char_length(new.document) + coalesce(char_length(new.thumbnail), 0);
    if tg_op = 'UPDATE' then
      old_size := char_length(old.document) + coalesce(char_length(old.thumbnail), 0);
    end if;
  end if;
  if new_size <= old_size then
    return new;
  end if;
  select bytes into used from public.usage_of(new.owner_id);
  if used + (new_size - old_size) > public.storage_limit_mb(new.owner_id) * 1048576 then
    raise exception 'storage_limit_exceeded'
      using errcode = '53400', hint = 'Your plan has no cloud space left.';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_storage_limit() from public, anon, authenticated;

create trigger projects_storage_limit
  before insert or update on public.projects
  for each row execute function public.enforce_storage_limit();
create trigger media_storage_limit
  before insert or update on public.media
  for each row execute function public.enforce_storage_limit();
create trigger library_items_storage_limit
  before insert or update on public.library_items
  for each row execute function public.enforce_storage_limit();

-- A person's plan and credits are never theirs to write (belt and braces: the
-- column grants already allow only locale and brand_kit).
revoke insert, delete on public.profiles from authenticated, anon;
revoke insert, update, delete on public.credit_ledger from authenticated, anon;
