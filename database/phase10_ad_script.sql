alter table "AppConfig"
    add column if not exists "AdScript" text not null default '';

update "AppConfig"
set "AdScript" = '<script>console.log(''Ad Placeholder'');</script>',
    "UpdatedAt" = now()
where coalesce(trim("AdScript"), '') = '';
