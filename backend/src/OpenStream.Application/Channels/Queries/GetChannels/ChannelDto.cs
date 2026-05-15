using System;

namespace OpenStream.Application.Channels.Queries.GetChannels;

public class ChannelDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string StreamUrl { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public bool IsActive { get; set; }
    public bool ShowInTvMode { get; set; }
    public int? TvModeOrder { get; set; }
    public string Status { get; set; } = "Active";

    // Cambiado a DateTime? para que coincida exactamente con lo que devuelve PostgreSQL
    public DateTime? LastCheckedAt { get; set; }
}

public class CategoryDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
}
