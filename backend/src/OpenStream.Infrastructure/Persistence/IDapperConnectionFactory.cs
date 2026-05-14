using System.Data;

namespace OpenStream.Infrastructure.Persistence;

public interface IDapperConnectionFactory
{
    Task<IDbConnection> CreateOpenConnectionAsync(CancellationToken cancellationToken);
}

