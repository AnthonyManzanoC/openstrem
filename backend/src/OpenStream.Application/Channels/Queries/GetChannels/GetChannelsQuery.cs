using MediatR;
using OpenStream.Application.Common;

namespace OpenStream.Application.Channels.Queries.GetChannels;

public sealed record GetChannelsQuery(
    string? Category,
    string? Search,
    bool? ShowInTvMode,
    IReadOnlyCollection<Guid>? ChannelIds,
    int Page = 1,
    int PageSize = 40) : IRequest<PagedResult<ChannelDto>>;
