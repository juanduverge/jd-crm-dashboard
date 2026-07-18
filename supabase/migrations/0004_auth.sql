-- =============================================================
-- 0004_auth.sql — Alta automática de perfil al crear usuario
-- =============================================================

-- Crea una fila en profiles cada vez que se registra un usuario en auth.users.
-- El nombre sale de user_metadata.name si viene en la invitación; el rol por
-- defecto es 'vendedor' (el primer admin se ajusta a mano tras crearlo).
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
