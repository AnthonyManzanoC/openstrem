create extension if not exists "pgcrypto";

create table if not exists "Categories" (
    "Id" uuid primary key default gen_random_uuid(),
    "Name" text not null unique,
    "CreatedAt" timestamptz not null default now(),
    "UpdatedAt" timestamptz not null default now()
);

create table if not exists "Channels" (
    "Id" uuid primary key default gen_random_uuid(),
    "Name" text not null unique,
    "StreamUrl" text not null,
    "LogoUrl" text null,
    "CategoryId" uuid null references "Categories" ("Id") on delete set null,
    "IsActive" boolean not null default true,
    "ShowInTvMode" boolean not null default false,
    "TvModeOrder" integer null,
    "Status" text not null default 'Active',
    "LastCheckedAt" timestamptz null,
    "CreatedAt" timestamptz not null default now(),
    "UpdatedAt" timestamptz not null default now()
);

alter table "Channels"
    add column if not exists "Status" text not null default 'Active';

alter table "Channels"
    add column if not exists "ShowInTvMode" boolean not null default false;

alter table "Channels"
    add column if not exists "TvModeOrder" integer null;

with ordered_tv_channels as (
    select
        "Id",
        row_number() over (order by "TvModeOrder" nulls last, "Name") as "Position"
    from "Channels"
    where "ShowInTvMode" = true
)
update "Channels" c
set "TvModeOrder" = ordered_tv_channels."Position"
from ordered_tv_channels
where c."Id" = ordered_tv_channels."Id"
  and c."TvModeOrder" is null;

create table if not exists "AppConfig" (
    "Id" uuid primary key default gen_random_uuid(),
    "AdScript" text not null default '',
    "CreatedAt" timestamptz not null default now(),
    "UpdatedAt" timestamptz not null default now()
);

alter table "AppConfig"
    add column if not exists "AdScript" text not null default '';

create index if not exists "IX_Channels_CategoryId" on "Channels" ("CategoryId");
create index if not exists "IX_Channels_IsActive" on "Channels" ("IsActive");
create index if not exists "IX_Channels_ShowInTvMode" on "Channels" ("ShowInTvMode");
create index if not exists "IX_Channels_TvModeOrder" on "Channels" ("ShowInTvMode", "TvModeOrder");
create index if not exists "IX_Channels_Status" on "Channels" ("Status");
create index if not exists "IX_Channels_Name" on "Channels" ("Name");
create index if not exists "IX_Categories_Name" on "Categories" ("Name");

insert into "AppConfig" ("AdScript")
select '<script>console.log(''Ad Placeholder'');</script>'
where not exists (select 1 from "AppConfig");
