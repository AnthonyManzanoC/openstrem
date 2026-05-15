namespace OpenStream.Application.Ads.Queries.GetAdsConfig;

public static class AdsConfigDefaults
{
    public const string FallbackAdScript = "<script>console.log('Ad Placeholder');</script>";
}

public sealed record AdsConfigDto(
    Guid Id,
    string AdScript);
