alter table "AppConfig"
    drop column if exists "AdMobBannerId",
    drop column if exists "AdMobInterstitialId",
    drop column if exists "WebAdClient";
