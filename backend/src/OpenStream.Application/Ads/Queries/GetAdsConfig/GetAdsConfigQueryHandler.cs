using MediatR;
using OpenStream.Application.Abstractions;

namespace OpenStream.Application.Ads.Queries.GetAdsConfig;

public sealed class GetAdsConfigQueryHandler(IAppConfigRepository repository)
    : IRequestHandler<GetAdsConfigQuery, AdsConfigDto>
{
    public Task<AdsConfigDto> Handle(GetAdsConfigQuery request, CancellationToken cancellationToken)
    {
        return repository.GetAsync(cancellationToken);
    }
}

