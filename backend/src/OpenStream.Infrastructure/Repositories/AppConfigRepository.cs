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

        const string sql = @"
            select
                ""Id"",
                ""AdMobBannerId"",
                ""AdMobInterstitialId"",
                ""WebAdClient""
            from ""AppConfig""
            order by ""CreatedAt""
            limit 1;";

        var config = await connection.QuerySingleOrDefaultAsync<AdsConfigDto>(
            new CommandDefinition(sql, cancellationToken: cancellationToken));

        return config ?? new AdsConfigDto(Guid.Empty, string.Empty, string.Empty, string.Empty);
    }
}

