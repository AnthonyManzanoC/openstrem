namespace OpenStream.Application.Ads.Queries.GetAdsConfig;

public sealed record AdsConfigDto(
    Guid Id,
    string AdMobBannerId,
    string AdMobInterstitialId,
    string WebAdClient);

