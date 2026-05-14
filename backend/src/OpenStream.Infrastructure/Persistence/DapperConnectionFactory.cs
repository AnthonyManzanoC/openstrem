using System.Data;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace OpenStream.Infrastructure.Persistence;

public sealed class DapperConnectionFactory(IConfiguration configuration) : IDapperConnectionFactory
{
    public async Task<IDbConnection> CreateOpenConnectionAsync(CancellationToken cancellationToken)
    {
        var connectionString = configuration.GetConnectionString("Supabase")
            ?? configuration["SUPABASE_POSTGRES_CONNECTION"]
            ?? throw new InvalidOperationException(
                "Configure ConnectionStrings:Supabase or SUPABASE_POSTGRES_CONNECTION.");

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        return connection;
    }
}

