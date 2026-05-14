using MediatR;

namespace OpenStream.Application.Ads.Queries.GetAdsConfig;

public sealed record GetAdsConfigQuery : IRequest<AdsConfigDto>;

