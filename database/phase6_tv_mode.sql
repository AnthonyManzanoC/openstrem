alter table "Channels"
    add column if not exists "ShowInTvMode" boolean not null default false;
