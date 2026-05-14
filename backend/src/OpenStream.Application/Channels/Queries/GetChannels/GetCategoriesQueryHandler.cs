using MediatR;
using OpenStream.Application.Abstractions;

namespace OpenStream.Application.Channels.Queries.GetChannels;

public sealed class GetCategoriesQueryHandler(IChannelRepository repository)
    : IRequestHandler<GetCategoriesQuery, IReadOnlyList<CategoryDto>>
{
    public Task<IReadOnlyList<CategoryDto>> Handle(
        GetCategoriesQuery request,
        CancellationToken cancellationToken)
    {
        return repository.GetCategoriesAsync(cancellationToken);
    }
}

