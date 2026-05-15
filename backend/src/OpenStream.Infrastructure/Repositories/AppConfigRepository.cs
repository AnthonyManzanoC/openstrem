using Dapper;
using OpenStream.Application.Abstractions;
using OpenStream.Application.Ads.Queries.GetAdsConfig;
using OpenStream.Infrastructure.Persistence;

namespace OpenStream.Infrastructure.Repositories;

public sealed class AppConfigRepository(IDapperConnectionFactory connectionFactory) : IAppConfigRepository
{
    public async Task<AdsConfigDto> GetAsync(CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string adScriptColumnExistsSql = @"
            select exists (
                select 1
                from information_schema.columns
                where table_schema = current_schema()
                  and table_name = 'AppConfig'
                  and column_name = 'AdScript'
            );";

        var hasAdScriptColumn = await connection.ExecuteScalarAsync<bool>(
            new CommandDefinition(adScriptColumnExistsSql, cancellationToken: cancellationToken));

        var sql = hasAdScriptColumn
            ? @"
            select
                ""Id"",
                ""AdScript""
            from ""AppConfig""
            order by ""CreatedAt""
            limit 1;"
            : @"
            select
                ""Id"",
                @FallbackAdScript as ""AdScript""
            from ""AppConfig""
            order by ""CreatedAt""
            limit 1;";

        var config = await connection.QuerySingleOrDefaultAsync<AdsConfigDto>(
            new CommandDefinition(
                sql,
                new { FallbackAdScript = AdsConfigDefaults.FallbackAdScript },
                cancellationToken: cancellationToken));

        return Normalize(config);
    }

    private static AdsConfigDto Normalize(AdsConfigDto? config)
    {
        if (config is null)
        {
            return new AdsConfigDto(
                Guid.Empty,
                AdsConfigDefaults.FallbackAdScript);
        }

        return config with
        {
            AdScript = string.IsNullOrWhiteSpace(config.AdScript)
                ? AdsConfigDefaults.FallbackAdScript
                : config.AdScript
        };
    }
}
