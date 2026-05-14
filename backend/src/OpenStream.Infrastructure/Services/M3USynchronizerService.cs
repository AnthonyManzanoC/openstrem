using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OpenStream.Application.Abstractions;
using OpenStream.Application.Common;
using OpenStream.Domain.Entities;

namespace OpenStream.Infrastructure.Services;

public sealed partial class M3USynchronizerService(
    HttpClient httpClient,
    IChannelRepository channelRepository,
    IConfiguration configuration,
    ILogger<M3USynchronizerService> logger) : IM3USynchronizerService
{
    private const int BATCH_SIZE = 1000;
    private const int MAX_CHANNELS_TO_SYNC = 30000;
    private const string DEFAULT_MASTER_FILE = "master-premium.m3u";
    private static readonly TimeSpan DownloadTimeout = TimeSpan.FromSeconds(45);
    private static readonly char[] SourceSeparators = [',', ';', '\n', '\r'];

    private static readonly IReadOnlyList<M3USource> DefaultSources = new[]
    {
        new M3USource("https://telechancho.github.io/telechancho-iptv/telechancho-infinity.m3u", "Telechancho"),
        new M3USource("https://www.m3u.cl/lista/AR.m3u", "Argentina"),
        new M3USource("https://www.m3u.cl/lista/BO.m3u", "Bolivia"),
        new M3USource("https://www.m3u.cl/lista/BR.m3u", "Brasil"),
        new M3USource("https://www.m3u.cl/lista/CL.m3u", "Chile"),
        new M3USource("https://www.m3u.cl/lista/CO.m3u", "Colombia"),
        new M3USource("https://www.m3u.cl/lista/EC.m3u", "Ecuador"),
        new M3USource("https://www.m3u.cl/lista/ES.m3u", "Espana"),
        new M3USource("https://www.m3u.cl/lista/MX.m3u", "Mexico"),
        new M3USource("https://www.m3u.cl/lista/PY.m3u", "Paraguay"),
        new M3USource("https://www.m3u.cl/lista/PE.m3u", "Peru"),
        new M3USource("https://www.m3u.cl/lista/DO.m3u", "Republica Dominicana"),
        new M3USource("https://www.m3u.cl/lista/VE.m3u", "Venezuela"),
        new M3USource("https://www.m3u.cl/lista/LATAM.m3u", "LATAM"),
        new M3USource("https://www.m3u.cl/lista/musica.m3u", "Musica"),
        new M3USource("https://www.m3u.cl/lista/religiosos.m3u", "Religiosos"),
        new M3USource("https://www.m3u.cl/lista/total.m3u", "M3U Total"),
        new M3USource("https://iptv-org.github.io/iptv/languages/spa.m3u", "Espanol"),
        new M3USource("https://iptv-org.github.io/iptv/categories/sports.m3u", "Deportes"),
        new M3USource("https://iptv-org.github.io/iptv/categories/music.m3u", "Musica"),
        new M3USource("https://iptv-org.github.io/iptv/categories/radio.m3u", "Radio"),
        new M3USource("https://www.tdtchannels.com/lists/tv.m3u8", "TDTChannels TV"),
        new M3USource("https://www.tdtchannels.com/lists/tv_mpd.m3u8", "TDTChannels TV MPD"),
        new M3USource("https://www.tdtchannels.com/lists/radio.m3u8", "TDTChannels Radio"),
        new M3USource("https://www.tdtchannels.com/lists/tvradio.m3u8", "TDTChannels TV Radio"),
        new M3USource("https://www.tdtchannels.com/lists/tvradio_mpd.m3u8", "TDTChannels TV Radio MPD"),
        new M3USource("https://pastebin.com/raw/wCnH-1-d3port3s-CDX2", "Deportes"),
        new M3USource("https://pastebin.com/raw/K-futbol211VtaQaMC", "Futbol"),
        new M3USource("http://bit.ly/futbol1onlin33-applil", "Futbol"),
        new M3USource("http://bit.ly/deportes1general33-applil", "Deportes"),
        new M3USource("http://bit.ly/Deportes1Ymasyaj12", "Deportes"),
        new M3USource("http://bit.ly/Pelis1-IPT331", "Peliculas"),
        new M3USource("http://bit.ly/TV2146Films", "Peliculas"),
        new M3USource("http://bit.ly/tvy1632peli222sm3u", "Peliculas"),
        new M3USource("http://bit.ly/PELIS1S11245M3U", "Peliculas"),
        new M3USource("http://bit.ly/Pelis1HDggs33Alterna", "Peliculas"),
        new M3USource("http://bit.ly/TV12467sFilms", "Peliculas"),
        new M3USource("http://bit.ly/Peli156632IPTv", "Peliculas"),
        new M3USource("http://bit.ly/tv1y1series331", "Series"),
        new M3USource("http://bit.ly/Serie235677FULL", "Series"),
        new M3USource("http://bit.ly/Series45552FULL", "Series"),
        new M3USource("http://bit.ly/1series134flixx", "Series"),
        new M3USource("https://mametchikitty.github.io/Listas-IPTV/dibujos-animados.m3u", "Animacion"),
        new M3USource("https://mametchikitty.github.io/Listas-IPTV/studio-ghibli-latino.m3u", "Animacion"),
        new M3USource("https://iptv-org.github.io/channels/ec/Ecuavisa", "Ecuador"),
        new M3USource("https://iptv-org.github.io/channels/co/Canal1", "Colombia"),
        new M3USource("https://iptv-org.github.io/channels/ec/TCTelevision", "Ecuador"),
        // --- LO QUE FALTABA DE MAMETCHI KITTY ---
        new M3USource("https://mametchikitty.github.io/Listas-IPTV/super-mario-bros-la-pelicula.m3u", "Peliculas"),
        new M3USource("https://mametchikitty.github.io/Listas-IPTV/animal-crossing.m3u", "Peliculas"),
        new M3USource("https://mametchikitty.github.io/Listas-IPTV/jefe-en-pañales.m3u", "Peliculas"),
        new M3USource("http://gluvu.atspace.cc/Passion%20Wii%20Streaming", "Wii Streaming"),
        new M3USource("http://gluvu.atspace.cc/Zona%20Kids", "Wii Kids"),

        // --- CANALES NACIONALES ECUADOR PARA MODO TV ---
        new M3USource("https://iptv-org.github.io/channels/ec/Ecuavisa", "Ecuador"),
        new M3USource("https://iptv-org.github.io/channels/ec/RTS", "Ecuador"),
        new M3USource("https://iptv-org.github.io/channels/ec/Teleamazonas", "Ecuador"),
        new M3USource("https://iptv-org.github.io/channels/ec/EcuadorTV", "Ecuador"),
        new M3USource("https://iptv-org.github.io/channels/ec/TC_Television", "Ecuador"),

        // --- LOS CANALES DIRECTOS PREMIUM (Colombia y Ecuador) ---
        new M3USource("https://iptv-org.github.io/channels/co/CaracolTelevision", "Colombia"),
        new M3USource("https://iptv-org.github.io/channels/co/CanalRCN", "Colombia"),
        new M3USource("https://iptv-org.github.io/channels/ec/RTS", "Ecuador"),
        new M3USource("https://iptv-org.github.io/channels/ec/Teleamazonas", "Ecuador")
    };

    public async Task<M3USyncResult> SynchronizeAsync(
        IReadOnlyCollection<string>? playlistUrls,
        CancellationToken cancellationToken)
    {
        var sources = BuildSources(playlistUrls);
        var errors = new List<string>();
        var collectedEntries = new List<M3UEntry>();

        collectedEntries.AddRange(await LoadLocalMasterEntriesAsync(errors, cancellationToken));

        foreach (var source in sources)
        {
            var playlist = await TryDownloadPlaylistAsync(source, errors, cancellationToken);

            if (playlist is null)
            {
                continue;
            }

            collectedEntries.AddRange(
                Parse(playlist, source.Label)
                    .Where(entry => IsHttpStreamUrl(entry.StreamUrl)));
        }

        var parsedEntries = collectedEntries
            .DistinctBy(entry => entry.StreamUrl, StringComparer.OrdinalIgnoreCase)
            .DistinctBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var entriesToSync = parsedEntries
            .Take(MAX_CHANNELS_TO_SYNC)
            .ToArray();

        if (entriesToSync.Length == 0)
        {
            return new M3USyncResult(parsedEntries.Length, 0, 0, 0, errors);
        }

        var categoryIds = await channelRepository.UpsertCategoriesAsync(
            entriesToSync.Select(entry => entry.Category)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray(),
            cancellationToken);

        var channels = entriesToSync
            .Select(entry => new Channel
            {
                Name = entry.Name,
                StreamUrl = entry.StreamUrl,
                LogoUrl = string.IsNullOrWhiteSpace(entry.LogoUrl) ? null : entry.LogoUrl,
                CategoryId = categoryIds.TryGetValue(entry.Category, out var categoryId)
                    ? categoryId
                    : null,
                IsActive = true,
                Status = "Active",
                LastCheckedAt = null
            })
            .Where(channel => channel.CategoryId.HasValue)
            .ToArray();

        var upserted = 0;

        foreach (var batch in channels.Chunk(BATCH_SIZE))
        {
            upserted += await channelRepository.UpsertChannelsAsync(batch, cancellationToken);
        }

        var skipped = parsedEntries.Length - channels.Length;

        return new M3USyncResult(
            parsedEntries.Length,
            channels.Length,
            upserted,
            skipped,
            errors);
    }

    private async Task<IReadOnlyList<M3UEntry>> LoadLocalMasterEntriesAsync(
        List<string> errors,
        CancellationToken cancellationToken)
    {
        var masterPath = configuration["OpenStream:M3U:MasterPlaylistPath"]
            ?? Environment.GetEnvironmentVariable("OPENSTREAM_MASTER_M3U_PATH")
            ?? DEFAULT_MASTER_FILE;

        var fullPath = Path.IsPathRooted(masterPath)
            ? masterPath
            : Path.Combine(Directory.GetCurrentDirectory(), masterPath);

        if (!File.Exists(fullPath))
        {
            if (!string.Equals(masterPath, DEFAULT_MASTER_FILE, StringComparison.OrdinalIgnoreCase))
            {
                var message = $"Master M3U file was not found: {fullPath}";
                errors.Add(message);
                logger.LogWarning("{Message}", message);
            }

            return Array.Empty<M3UEntry>();
        }

        try
        {
            var playlist = await File.ReadAllTextAsync(fullPath, cancellationToken);

            return Parse(playlist, "Master Premium")
                .Where(entry => IsHttpStreamUrl(entry.StreamUrl))
                .ToArray();
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            var message = $"Could not read master M3U file {fullPath}: {exception.Message}";
            errors.Add(message);
            logger.LogWarning(exception, "Could not read master M3U file {MasterPath}", fullPath);
            return Array.Empty<M3UEntry>();
        }
    }

    private async Task<string?> TryDownloadPlaylistAsync(
        M3USource source,
        List<string> errors,
        CancellationToken cancellationToken)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(DownloadTimeout);

            using var request = new HttpRequestMessage(HttpMethod.Get, source.Url);
            request.Headers.TryAddWithoutValidation("Accept", "application/vnd.apple.mpegurl, application/x-mpegURL, audio/mpegurl, */*");
            request.Headers.TryAddWithoutValidation("Accept-Language", "es-419,es;q=0.9,en;q=0.8");

            using var response = await httpClient.SendAsync(request, timeout.Token);

            if (!response.IsSuccessStatusCode)
            {
                var message = $"Could not download {source.Label} playlist ({source.Url}): {(int)response.StatusCode} {response.ReasonPhrase}";
                errors.Add(message);
                logger.LogWarning("{Message}", message);
                return null;
            }

            return await response.Content.ReadAsStringAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            var message = $"Timeout while downloading {source.Label} playlist ({source.Url}).";
            errors.Add(message);
            logger.LogWarning("{Message}", message);
            return null;
        }
        catch (HttpRequestException exception)
        {
            var message = $"Could not download {source.Label} playlist ({source.Url}): {exception.Message}";
            errors.Add(message);
            logger.LogWarning(exception, "Could not download {SourceLabel} playlist from {SourceUrl}", source.Label, source.Url);
            return null;
        }
        catch (Exception exception)
        {
            var message = $"Unexpected error while downloading {source.Label} playlist ({source.Url}): {exception.Message}";
            errors.Add(message);
            logger.LogWarning(exception, "Unexpected error while downloading {SourceLabel} playlist from {SourceUrl}", source.Label, source.Url);
            return null;
        }
    }

    private IReadOnlyList<M3USource> BuildSources(IReadOnlyCollection<string>? playlistUrls)
    {
        var configuredMasterSources = ReadConfiguredUrls(
                configuration["OpenStream:M3U:MasterPlaylistUrl"],
                Environment.GetEnvironmentVariable("OPENSTREAM_MASTER_M3U_URL"))
            .Select(url => new M3USource(url, "Master Premium"));

        var configuredExtraSources = ReadConfiguredUrls(
                configuration["OpenStream:M3U:ExtraSources"],
                Environment.GetEnvironmentVariable("OPENSTREAM_EXTRA_M3U_SOURCES"))
            .Select(url => new M3USource(url, ResolveSourceLabel(url)));

        var requestSources = (playlistUrls ?? Array.Empty<string>())
            .Select(url => url.Trim())
            .Where(IsValidPlaylistUrl)
            .Select(url => new M3USource(url, ResolveSourceLabel(url)));

        return configuredMasterSources
            .Concat(DefaultSources)
            .Concat(configuredExtraSources)
            .Concat(requestSources)
            .DistinctBy(source => source.Url, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static IEnumerable<string> ReadConfiguredUrls(params string?[] values)
    {
        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            foreach (var url in value.Split(SourceSeparators, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (IsValidPlaylistUrl(url))
                {
                    yield return url;
                }
            }
        }
    }

    private static string ResolveSourceLabel(string url)
    {
        if (url.Contains("/EC.", StringComparison.OrdinalIgnoreCase) || url.Contains("/ec/", StringComparison.OrdinalIgnoreCase))
        {
            return "Ecuador";
        }

        if (url.Contains("/CO.", StringComparison.OrdinalIgnoreCase) || url.Contains("/co/", StringComparison.OrdinalIgnoreCase))
        {
            return "Colombia";
        }

        if (url.Contains("deporte", StringComparison.OrdinalIgnoreCase) || url.Contains("futbol", StringComparison.OrdinalIgnoreCase))
        {
            return "Deportes";
        }

        if (url.Contains("sports", StringComparison.OrdinalIgnoreCase))
        {
            return "Deportes";
        }

        if (url.Contains("music", StringComparison.OrdinalIgnoreCase) || url.Contains("musica", StringComparison.OrdinalIgnoreCase))
        {
            return "Musica";
        }

        if (url.Contains("radio", StringComparison.OrdinalIgnoreCase))
        {
            return "Radio";
        }

        if (url.Contains("peli", StringComparison.OrdinalIgnoreCase) || url.Contains("film", StringComparison.OrdinalIgnoreCase))
        {
            return "Peliculas";
        }

        if (url.Contains("serie", StringComparison.OrdinalIgnoreCase))
        {
            return "Series";
        }

        if (url.Contains("/languages/spa.", StringComparison.OrdinalIgnoreCase))
        {
            return "Espanol";
        }

        return "Personalizado";
    }

    private static bool IsValidPlaylistUrl(string url)
    {
        return Uri.TryCreate(url, UriKind.Absolute, out var uri)
               && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }

    private static IEnumerable<M3UEntry> Parse(string playlist, string sourceLabel)
    {
        using var reader = new StringReader(playlist);

        string? line;
        string? extInf = null;

        while ((line = reader.ReadLine()) is not null)
        {
            var trimmedLine = line.Trim();

            if (trimmedLine.StartsWith("#EXTINF", StringComparison.OrdinalIgnoreCase))
            {
                extInf = trimmedLine;
                continue;
            }

            if (extInf is null
                || string.IsNullOrWhiteSpace(trimmedLine)
                || trimmedLine.StartsWith('#'))
            {
                continue;
            }

            if (!IsHttpStreamUrl(trimmedLine))
            {
                extInf = null;
                continue;
            }

            var fallbackName = ExtractNameAfterComma(extInf);
            var name = GetAttribute(extInf, "tvg-name", fallbackName);

            if (string.IsNullOrWhiteSpace(name))
            {
                extInf = null;
                continue;
            }

            var category = NormalizeCategory(GetAttribute(extInf, "group-title", sourceLabel), sourceLabel);

            yield return new M3UEntry(
                Normalize(name),
                trimmedLine,
                GetAttribute(extInf, "tvg-logo", string.Empty),
                string.IsNullOrWhiteSpace(category) ? sourceLabel : category);

            extInf = null;
        }
    }

    private static string GetAttribute(string extInf, string key, string fallback)
    {
        foreach (Match match in AttributeRegex().Matches(extInf))
        {
            if (string.Equals(match.Groups["key"].Value, key, StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrWhiteSpace(match.Groups["value"].Value))
            {
                return match.Groups["value"].Value.Trim();
            }
        }

        return fallback.Trim();
    }

    private static string ExtractNameAfterComma(string extInf)
    {
        var commaIndex = extInf.LastIndexOf(',');
        return commaIndex < 0 || commaIndex == extInf.Length - 1
            ? string.Empty
            : extInf[(commaIndex + 1)..].Trim();
    }

    private static string Normalize(string value)
    {
        return Regex.Replace(value.Trim(), @"\s+", " ");
    }

    private static string NormalizeCategory(string value, string fallback)
    {
        var normalized = Normalize(value);

        if (string.IsNullOrWhiteSpace(normalized)
            || normalized.Equals("Undefined", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("Other", StringComparison.OrdinalIgnoreCase))
        {
            return fallback;
        }

        var primary = normalized
            .Split([';', '|'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault() ?? normalized;

        if (primary.Contains("sport", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("deporte", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("football", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("soccer", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("futbol", StringComparison.OrdinalIgnoreCase))
        {
            return "Deportes";
        }

        if (primary.Contains("music", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("musica", StringComparison.OrdinalIgnoreCase))
        {
            return "Musica";
        }

        if (primary.Contains("radio", StringComparison.OrdinalIgnoreCase))
        {
            return "Radio";
        }

        if (primary.Contains("animation", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("kids", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("cartoon", StringComparison.OrdinalIgnoreCase))
        {
            return "Animacion";
        }

        if (primary.Contains("movie", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("film", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("pelicula", StringComparison.OrdinalIgnoreCase))
        {
            return "Peliculas";
        }

        if (primary.Contains("news", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("noticia", StringComparison.OrdinalIgnoreCase))
        {
            return "Noticias";
        }

        return Normalize(primary);
    }

    private static bool IsHttpStreamUrl(string streamUrl)
    {
        return StreamUrlRegex().IsMatch(streamUrl)
               && Uri.TryCreate(streamUrl, UriKind.Absolute, out var uri)
               && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }

    [GeneratedRegex("(?<key>[A-Za-z0-9_-]+)\\s*=\\s*\"(?<value>[^\"]*)\"", RegexOptions.Compiled | RegexOptions.CultureInvariant)]
    private static partial Regex AttributeRegex();

    [GeneratedRegex("^https?://\\S+$", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex StreamUrlRegex();

    private sealed record M3UEntry(
        string Name,
        string StreamUrl,
        string LogoUrl,
        string Category);

    private sealed record M3USource(string Url, string Label);
}
