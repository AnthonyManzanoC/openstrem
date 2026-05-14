using MediatR;
using OpenStream.Application.Abstractions;
using OpenStream.Application.Common;

namespace OpenStream.Application.Sync.Commands.SynchronizeM3U;

public sealed class SynchronizeM3UCommandHandler(IM3USynchronizerService synchronizer)
    : IRequestHandler<SynchronizeM3UCommand, M3USyncResult>
{
    public Task<M3USyncResult> Handle(SynchronizeM3UCommand request, CancellationToken cancellationToken)
    {
        return synchronizer.SynchronizeAsync(request.PlaylistUrls, cancellationToken);
    }
}
