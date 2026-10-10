-- Private bucket for captured photos. Files are uploaded and read by server code only (secret key),
-- and shown to the signed-in owner through short-lived signed links.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
