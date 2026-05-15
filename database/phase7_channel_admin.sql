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

create index if not exists "IX_Channels_TvModeOrder"
    on "Channels" ("ShowInTvMode", "TvModeOrder");
