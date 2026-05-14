using MediatR;
using OpenStream.Application.Abstractions;
using OpenStream.Application.Common;

namespace OpenStream.Application.Channels.Queries.GetChannels;

public sealed class GetChannelsQueryHandler(IChannelRepository repository)
    : IRequestHandler<GetChannelsQuery, PagedResult<ChannelDto>>
{
    public Task<PagedResult<ChannelDto>> Handle(
        GetChannelsQuery request,
        CancellationToken cancellationToken)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        return repository.GetPagedAsync(
            request.Category,
            request.Search,
            request.ShowInTvMode,
            request.ChannelIds,
            page,
            pageSize,
            cancellationToken);
    }
}
