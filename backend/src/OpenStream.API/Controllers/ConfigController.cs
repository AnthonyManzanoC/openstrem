using Microsoft.AspNetCore.Mvc;
using OpenStream.Application.Abstractions;
using OpenStream.Application.Ads.Queries.GetAdsConfig;

namespace OpenStream.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class ConfigController(IAppConfigRepository appConfigRepository) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AdsConfigDto>> Get(CancellationToken cancellationToken)
    {
        var config = await appConfigRepository.GetAsync(cancellationToken);

        return Ok(config with
        {
            AdMobBannerId = config.AdMobBannerId ?? string.Empty,
            AdMobInterstitialId = config.AdMobInterstitialId ?? string.Empty,
            WebAdClient = config.WebAdClient ?? string.Empty
        });
    }
}
