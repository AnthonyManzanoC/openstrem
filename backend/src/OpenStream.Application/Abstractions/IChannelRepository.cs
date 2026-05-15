using OpenStream.Application.Channels.Queries.GetChannels;
using OpenStream.Application.Common;
using OpenStream.Domain.Entities;

namespace OpenStream.Application.Abstractions;

public interface IChannelRepository
{
    Task<PagedResult<ChannelDto>> GetPagedAsync(
        string? category,
        string? search,
        bool? showInTvMode,
        IReadOnlyCollection<Guid>? channelIds,
        int page,
        int pageSize,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken);

    Task<ChannelDto?> GetByIdAsync(Guid channelId, CancellationToken cancellationToken);

    Task<ChannelDto?> CreateChannelAsync(
        string name,
        string streamUrl,
        string categoryName,
        bool showInTvMode,
        CancellationToken cancellationToken);

    Task<PagedResult<ChannelDto>> GetReportedAsync(
        int page,
        int pageSize,
        CancellationToken cancellationToken);

    Task<Guid> UpsertCategoryAsync(string name, CancellationToken cancellationToken);

    Task UpsertChannelAsync(Channel channel, CancellationToken cancellationToken);

    Task<IReadOnlyDictionary<string, Guid>> UpsertCategoriesAsync(
        IReadOnlyCollection<string> names,
        CancellationToken cancellationToken);

    Task<int> UpsertChannelsAsync(
        IReadOnlyCollection<Channel> channels,
        CancellationToken cancellationToken);

    Task<bool> RecordPlaybackReportAsync(
        Guid channelId,
        CancellationToken cancellationToken);

    Task<bool> MarkReportedAsync(
        Guid channelId,
        CancellationToken cancellationToken);

    Task<ChannelDto?> UpdateChannelAsync(
        Guid channelId,
        string? streamUrl,
        string? status,
        bool? isActive,
        CancellationToken cancellationToken);

    Task<ChannelDto?> SetTvModeAsync(
        Guid channelId,
        bool? showInTvMode,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<ChannelDto>> ReorderTvModeAsync(
        IReadOnlyList<Guid> channelIds,
        CancellationToken cancellationToken);
}
