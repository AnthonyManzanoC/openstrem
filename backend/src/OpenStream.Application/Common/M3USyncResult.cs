namespace OpenStream.Application.Common;

public sealed record M3USyncResult(
    int Parsed,
    int Validated,
    int Upserted,
    int Skipped,
    IReadOnlyList<string> Errors);

