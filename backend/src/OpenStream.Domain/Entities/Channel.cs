namespace OpenStream.Domain.Entities;

public sealed class Channel
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string StreamUrl { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public Guid? CategoryId { get; set; }
    public bool IsActive { get; set; } = true;
    public bool ShowInTvMode { get; set; }
    public int? TvModeOrder { get; set; }
    public string Status { get; set; } = "Active";
    public DateTimeOffset? LastCheckedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
