using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using OpenStream.Application.Sync.Commands.SynchronizeM3U;

namespace OpenStream.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class SyncController(IMediator mediator) : ControllerBase
{
    [HttpPost("m3u")]
    public async Task<IActionResult> SynchronizeM3U(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] SynchronizeM3URequest? request,
        CancellationToken cancellationToken)
    {
        var result = await mediator.Send(
            new SynchronizeM3UCommand(request?.PlaylistUrls),
            cancellationToken);

        return Ok(result);
    }
}

public sealed record SynchronizeM3URequest(IReadOnlyCollection<string>? PlaylistUrls);
