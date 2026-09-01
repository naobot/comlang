-- Trigger functions run as the table owner when the trigger fires; nobody needs EXECUTE
-- on them directly. Left as-is they were published as callable RPC endpoints — and
-- sync_profile_from_auth_user was reachable by `anon`, which the advisor flags.
--
-- Verified after applying: signup still creates a profile, so the trigger is unaffected.
revoke execute on function public.sync_profile_from_auth_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
