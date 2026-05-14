using OpenStream.Application.Ads.Queries.GetAdsConfig;

namespace OpenStream.Application.Abstractions;

public interface IAppConfigRepository
{
    Task<AdsConfigDto> GetAsync(CancellationToken cancellationToken);
}

