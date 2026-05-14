using MediatR;
using OpenStream.Application.Common;

namespace OpenStream.Application.Sync.Commands.SynchronizeM3U;

public sealed record SynchronizeM3UCommand(
    IReadOnlyCollection<string>? PlaylistUrls = null) : IRequest<M3USyncResult>;
