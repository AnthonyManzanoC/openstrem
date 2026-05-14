using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using OpenStream.Application.Abstractions;

namespace OpenStream.API.Controllers;

[ApiController]
[Route("api/proxy")]
public sealed partial class ProxyController(
    IChannelRepository channelRepository,
    IHttpClientFactory httpClientFactory,
    ILogger<ProxyController> logger) : ControllerBase
{
    private const string BrowserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    private static readonly string[] HopByHopHeaders =
    [
        "Connection",
        "Keep-Alive",
        "Proxy-Authenticate",
        "Proxy-Authorization",
        "TE",
        "Trailer",
        "Transfer-Encoding",
        "Upgrade"
    ];

    [HttpOptions("stream")]
    public IActionResult StreamOptions()
    {
        AddCorsHeaders();
        return NoContent();
    }

    [HttpGet("stream")]
    public async Task<IActionResult> Stream(
        [FromQuery] Guid? channelId,
        [FromQuery] string? url,
        CancellationToken cancellationToken)
    {
        var targetUrl = await ResolveTargetUrlAsync(channelId, url, cancellationToken);

        if (string.IsNullOrWhiteSpace(targetUrl) || !IsHttpUrl(targetUrl))
        {
            return BadRequest(new { message = "Provide a valid channelId or url query parameter." });
        }

        AddCorsHeaders();

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, targetUrl);
            AddBrowserHeaders(request, targetUrl);
            ForwardPlaybackHeaders(request);

            var client = httpClientFactory.CreateClient();
            using var response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "Proxy request failed for {TargetUrl}: {StatusCode} {ReasonPhrase}",
                    targetUrl,
                    (int)response.StatusCode,
                    response.ReasonPhrase);

                return StatusCode(
                    (int)response.StatusCode,
                    new { message = "The upstream stream did not respond successfully." });
            }

            var contentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";

            if (LooksLikePlaylist(targetUrl, contentType))
            {
                var playlist = await response.Content.ReadAsStringAsync(cancellationToken);
                var rewrittenPlaylist = RewritePlaylist(playlist, targetUrl);

                Response.Headers.CacheControl = "no-store";
                Response.Headers["X-OpenStream-Proxy"] = "deep-playlist";
                return Content(rewrittenPlaylist, "application/vnd.apple.mpegurl", Encoding.UTF8);
            }

            Response.StatusCode = (int)response.StatusCode;
            Response.Headers.CacheControl = "no-store";
            Response.Headers["X-OpenStream-Proxy"] = "deep-segment";
            CopyStreamingHeaders(response);

            await response.Content.CopyToAsync(Response.Body, cancellationToken);
            return new EmptyResult();
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or OperationCanceledException)
        {
            logger.LogWarning(exception, "Proxy request failed for {TargetUrl}", targetUrl);
            return StatusCode(502, new { message = "The stream proxy could not reach the upstream server." });
        }
    }

    private async Task<string?> ResolveTargetUrlAsync(
        Guid? channelId,
        string? url,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(url))
        {
            return ResolveOriginalStreamUrl(url);
        }

        if (channelId is null)
        {
            return null;
        }

        var channel = await channelRepository.GetByIdAsync(channelId.Value, cancellationToken);
        return channel is null ? null : ResolveOriginalStreamUrl(channel.StreamUrl);
    }

    private string RewritePlaylist(string playlist, string sourceUrl)
    {
        var baseUri = new Uri(sourceUrl);
        var builder = new StringBuilder(playlist.Length + 256);

        using var reader = new StringReader(playlist);

        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var trimmed = line.Trim();

            if (string.IsNullOrWhiteSpace(trimmed))
            {
                builder.AppendLine(line);
                continue;
            }

            if (trimmed.StartsWith('#'))
            {
                builder.AppendLine(RewriteAttributeUris(line, baseUri));
                continue;
            }

            builder.AppendLine(ShouldProxyPlaylistReference(trimmed)
                ? BuildProxyUrl(BuildAbsoluteUrl(baseUri, trimmed))
                : line);
        }

        return builder.ToString();
    }

    private string RewriteAttributeUris(string line, Uri baseUri)
    {
        return PlaylistUriAttributeRegex().Replace(line, match =>
        {
            var attributeUrl = match.Groups["url"].Value;

            if (!ShouldProxyPlaylistReference(attributeUrl))
            {
                return match.Value;
            }

            var absoluteUrl = BuildAbsoluteUrl(baseUri, attributeUrl);
            return $"URI=\"{BuildProxyUrl(absoluteUrl)}\"";
        });
    }

    private string BuildProxyUrl(string originalUrl)
    {
        originalUrl = ResolveOriginalStreamUrl(originalUrl);
        return $"{Request.Scheme}://{Request.Host}/api/proxy/stream?url={Uri.EscapeDataString(originalUrl)}";
    }

    private static string BuildAbsoluteUrl(Uri baseUri, string value)
    {
        if (Uri.TryCreate(value, UriKind.Absolute, out var absoluteUri))
        {
            return absoluteUri.ToString();
        }

        return Uri.TryCreate(baseUri, value, out var relativeUri)
            ? relativeUri.ToString()
            : value;
    }

    private static bool LooksLikePlaylist(string targetUrl, string contentType)
    {
        if (Uri.TryCreate(targetUrl, UriKind.Absolute, out var targetUri))
        {
            var path = targetUri.AbsolutePath;

            if (path.EndsWith(".m3u", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith("/m3u8", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return contentType.Contains("mpegurl", StringComparison.OrdinalIgnoreCase)
            || contentType.Contains("vnd.apple", StringComparison.OrdinalIgnoreCase);
    }

    private void ForwardPlaybackHeaders(HttpRequestMessage request)
    {
        ForwardHeader(request, "Range");
        ForwardHeader(request, "If-Range");
        ForwardHeader(request, "If-None-Match");
        ForwardHeader(request, "If-Modified-Since");
        ForwardHeader(request, "Icy-MetaData");
    }

    private void ForwardHeader(HttpRequestMessage request, string headerName)
    {
        if (Request.Headers.TryGetValue(headerName, out var values))
        {
            request.Headers.TryAddWithoutValidation(headerName, values.ToArray());
        }
    }

    private static void AddBrowserHeaders(HttpRequestMessage request, string targetUrl)
    {
        request.Headers.TryAddWithoutValidation("User-Agent", BrowserUserAgent);
        request.Headers.TryAddWithoutValidation("Accept", "application/vnd.apple.mpegurl, application/x-mpegURL, video/mp2t, video/mp4, audio/*, */*");
        request.Headers.TryAddWithoutValidation("Accept-Language", "es-419,es;q=0.9,en;q=0.8");
        request.Headers.TryAddWithoutValidation("Cache-Control", "no-cache");
        request.Headers.TryAddWithoutValidation("Pragma", "no-cache");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "empty");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "cors");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "cross-site");

        if (Uri.TryCreate(targetUrl, UriKind.Absolute, out var targetUri))
        {
            var origin = BuildOrigin(targetUri);
            request.Headers.TryAddWithoutValidation("Origin", origin);
            request.Headers.TryAddWithoutValidation("Referer", $"{origin}/");
        }
    }

    private void CopyStreamingHeaders(HttpResponseMessage response)
    {
        Response.ContentType = response.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";

        foreach (var header in response.Content.Headers)
        {
            if (header.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)
                || HopByHopHeaders.Contains(header.Key, StringComparer.OrdinalIgnoreCase))
            {
                continue;
            }

            Response.Headers[header.Key] = header.Value.ToArray();
        }

        foreach (var header in response.Headers)
        {
            if (!ShouldCopyResponseHeader(header.Key))
            {
                continue;
            }

            Response.Headers[header.Key] = header.Value.ToArray();
        }
    }

    private static bool ShouldCopyResponseHeader(string headerName)
    {
        if (HopByHopHeaders.Contains(headerName, StringComparer.OrdinalIgnoreCase))
        {
            return false;
        }

        return headerName.Equals("Accept-Ranges", StringComparison.OrdinalIgnoreCase)
            || headerName.Equals("Content-Range", StringComparison.OrdinalIgnoreCase)
            || headerName.Equals("ETag", StringComparison.OrdinalIgnoreCase)
            || headerName.Equals("Last-Modified", StringComparison.OrdinalIgnoreCase);
    }

    private void AddCorsHeaders()
    {
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        Response.Headers["Access-Control-Allow-Headers"] = "*";
        Response.Headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
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

        var originalUrl = TryReadQueryValue(uri.Query, "url");
        return string.IsNullOrWhiteSpace(originalUrl) ? streamUrl : originalUrl;
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

    private static bool ShouldProxyPlaylistReference(string value)
    {
        return !string.IsNullOrWhiteSpace(value)
            && !value.StartsWith('#')
            && !value.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
            && !value.StartsWith("skd:", StringComparison.OrdinalIgnoreCase)
            && !value.StartsWith("urn:", StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildOrigin(Uri uri)
    {
        return uri.IsDefaultPort
            ? $"{uri.Scheme}://{uri.Host}"
            : $"{uri.Scheme}://{uri.Host}:{uri.Port}";
    }

    [GeneratedRegex("URI=\"(?<url>[^\"]+)\"", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex PlaylistUriAttributeRegex();
}
