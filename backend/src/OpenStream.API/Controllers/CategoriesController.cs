using MediatR;
using Microsoft.AspNetCore.Mvc;
using OpenStream.Application.Channels.Queries.GetChannels;

namespace OpenStream.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class CategoriesController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var result = await mediator.Send(new GetCategoriesQuery(), cancellationToken);
        return Ok(result);
    }
}

