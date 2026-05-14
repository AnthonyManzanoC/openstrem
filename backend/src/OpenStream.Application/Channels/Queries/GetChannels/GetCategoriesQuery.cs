using MediatR;

namespace OpenStream.Application.Channels.Queries.GetChannels;

public sealed record GetCategoriesQuery : IRequest<IReadOnlyList<CategoryDto>>;

