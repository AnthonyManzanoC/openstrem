using MediatR;
using Microsoft.AspNetCore.Mvc;
using OpenStream.Application.Abstractions;
using OpenStream.Application.Channels.Queries.GetChannels;

namespace OpenStream.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class ChannelsController(
    IMediator mediator,
    IChannelRepository channelRepository,
    IHttpClientFactory httpClientFactory,
    ILogger<ChannelsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string? category,
        [FromQuery] string? search,
        [FromQuery] bool? showInTvMode,
        [FromQuery] Guid[]? ids,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 40,
        CancellationToken cancellationToken = default)
    {
        var channelIds = ids?
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToArray();

        var result = await mediator.Send(
            new GetChannelsQuery(category, search, showInTvMode, channelIds, page, pageSize),
            cancellationToken);

        return Ok(result);
    }

    [HttpGet("reported")]
    public async Task<IActionResult> GetReported(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100,
        CancellationToken cancellationToken = default)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 200);
        var result = await channelRepository.GetReportedAsync(safePage, safePageSize, cancellationToken);

        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] ChannelUpdateRequest? request,
        CancellationToken cancellationToken)
    {
        if (request is null || request.IsEmpty)
        {
            return BadRequest(new { message = "At least one field is required." });
        }

        if (!string.IsNullOrWhiteSpace(request.StreamUrl) && !IsHttpUrl(request.StreamUrl))
        {
            return BadRequest(new { message = "StreamUrl must be an absolute http or https URL." });
        }

        var updated = await channelRepository.UpdateChannelAsync(
            id,
            request.StreamUrl,
            request.Status,
            request.IsActive,
            cancellationToken);

        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPatch("{id:guid}/tvmode")]
    public async Task<IActionResult> ToggleTvMode(
        Guid id,
        [FromBody] ChannelTvModeRequest? request,
        CancellationToken cancellationToken)
    {
        var updated = await channelRepository.SetTvModeAsync(
            id,
            request?.ShowInTvMode,
            cancellationToken);

        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPost("{id:guid}/report")]
    public async Task<IActionResult> ReportPlayback(
        Guid id,
        [FromBody] PlaybackReportRequest? request,
        CancellationToken cancellationToken)
    {
        var recorded = await channelRepository.MarkReportedAsync(id, cancellationToken);

        return recorded
            ? Accepted(new { id, status = "Reported", reason = request?.Reason })
            : NotFound();
    }

    [HttpPost("{id:guid}/force-proxy")]
    public async Task<IActionResult> ForceProxy(
        Guid id,
        CancellationToken cancellationToken)
    {
        var channel = await channelRepository.GetByIdAsync(id, cancellationToken);

        if (channel is null)
        {
            return NotFound();
        }

        var originalUrl = ResolveOriginalStreamUrl(channel.StreamUrl);

        if (!IsHttpUrl(originalUrl))
        {
            return BadRequest(new { message = "The current stream URL cannot be proxied." });
        }

        var proxyUrl = BuildProxyUrl(originalUrl);
        var updated = await channelRepository.UpdateChannelAsync(
            id,
            proxyUrl,
            "Proxy",
            true,
            cancellationToken);

        return updated is null
            ? NotFound()
            : Ok(new ChannelRepairResponse(id, true, updated.StreamUrl, updated.Status, "Proxy enabled."));
    }

    [HttpPost("{id:guid}/report-and-heal")]
    public async Task<IActionResult> ReportAndHeal(
        Guid id,
        [FromBody] PlaybackReportRequest? request,
        CancellationToken cancellationToken)
    {
        var channel = await channelRepository.GetByIdAsync(id, cancellationToken);

        if (channel is null)
        {
            return NotFound();
        }

        await channelRepository.MarkReportedAsync(id, cancellationToken);

        var originalUrl = ResolveOriginalStreamUrl(channel.StreamUrl);

        if (!IsHttpUrl(originalUrl))
        {
            return Accepted(new ChannelRepairResponse(
                id,
                false,
                null,
                "Reported",
                "The stream URL is not valid for proxy repair."));
        }

        var reachable = await CanReachStreamAsync(originalUrl, cancellationToken);

        if (!reachable)
        {
            return Accepted(new ChannelRepairResponse(
                id,
                false,
                null,
                "Reported",
                "The origin did not respond from the server; it stays in admin clinic."));
        }

        var proxyUrl = BuildProxyUrl(originalUrl);
        var updated = await channelRepository.UpdateChannelAsync(
            id,
            proxyUrl,
            "Proxy",
            true,
            cancellationToken);

        return Ok(new ChannelRepairResponse(
            id,
            true,
            updated?.StreamUrl ?? proxyUrl,
            updated?.Status ?? "Proxy",
            request?.Reason ?? "Proxy repair applied."));
    }

    private async Task<bool> CanReachStreamAsync(string streamUrl, CancellationToken cancellationToken)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(12));

            using var request = new HttpRequestMessage(HttpMethod.Get, streamUrl);
            AddBrowserHeaders(request, streamUrl);

            var client = httpClientFactory.CreateClient();
            using var response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token);

            return response.IsSuccessStatusCode;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or OperationCanceledException)
        {
            logger.LogWarning(exception, "Stream validation failed for {StreamUrl}", streamUrl);
            return false;
        }
    }

    private string BuildProxyUrl(string originalUrl)
    {
        return $"{Request.Scheme}://{Request.Host}/api/proxy/stream?url={Uri.EscapeDataString(originalUrl)}";
    }

    private static void AddBrowserHeaders(HttpRequestMessage request, string targetUrl)
    {
        request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36");
        request.Headers.TryAddWithoutValidation("Accept", "application/vnd.apple.mpegurl, application/x-mpegURL, video/mp2t, video/mp4, audio/*, */*");
        request.Headers.TryAddWithoutValidation("Accept-Language", "es-419,es;q=0.9,en;q=0.8");
        request.Headers.TryAddWithoutValidation("Cache-Control", "no-cache");
        request.Headers.TryAddWithoutValidation("Pragma", "no-cache");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "empty");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "cors");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "cross-site");

        if (Uri.TryCreate(targetUrl, UriKind.Absolute, out var targetUri))
        {
            var origin = targetUri.IsDefaultPort
                ? $"{targetUri.Scheme}://{targetUri.Host}"
                : $"{targetUri.Scheme}://{targetUri.Host}:{targetUri.Port}";

            request.Headers.TryAddWithoutValidation("Origin", origin);
            request.Headers.TryAddWithoutValidation("Referer", $"{origin}/");
        }
    }

    private static string ResolveOriginalStreamUrl(string streamUrl)
    {
        if (!Uri.TryCreate(streamUrl, UriKind.Absolute, out var uri))
        {
            return streamUrl;
        }

        if (!uri.AbsolutePath.EndsWith("/api/proxy/stream", StringComparison.OrdinalIgnoreCase))
        {
            return streamUrl;
        }

        var url = TryReadQueryValue(uri.Query, "url");
        return string.IsNullOrWhiteSpace(url) ? streamUrl : url;
    }

    private static string? TryReadQueryValue(string query, string key)
    {
        foreach (var part in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = part.Split('=', 2);

            if (pair.Length == 2 && string.Equals(pair[0], key, StringComparison.OrdinalIgnoreCase))
            {
                return Uri.UnescapeDataString(pair[1].Replace("+", " "));
            }
        }

        return null;
    }

    private static bool IsHttpUrl(string value)
    {
        return Uri.TryCreate(value, UriKind.Absolute, out var uri)
               && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }
}

public sealed record PlaybackReportRequest(string? Status, string? Reason);

public sealed record ChannelUpdateRequest(
    string? StreamUrl,
    string? Status,
    bool? IsActive)
{
    public bool IsEmpty =>
        string.IsNullOrWhiteSpace(StreamUrl)
        && string.IsNullOrWhiteSpace(Status)
        && IsActive is null;
}

public sealed record ChannelTvModeRequest(bool? ShowInTvMode);

public sealed record ChannelRepairResponse(
    Guid Id,
    bool Repaired,
    string? StreamUrl,
    string Status,
    string Message);
