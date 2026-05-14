using MediatR;
using Microsoft.AspNetCore.Mvc;
using OpenStream.Application.Ads.Queries.GetAdsConfig;

namespace OpenStream.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AdsController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var result = await mediator.Send(new GetAdsConfigQuery(), cancellationToken);
        return Ok(result);
    }
}

