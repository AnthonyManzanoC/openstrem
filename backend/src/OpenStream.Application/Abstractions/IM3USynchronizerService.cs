using OpenStream.Application.Common;

namespace OpenStream.Application.Abstractions;

public interface IM3USynchronizerService
{
    Task<M3USyncResult> SynchronizeAsync(
        IReadOnlyCollection<string>? playlistUrls,
        CancellationToken cancellationToken);
}
