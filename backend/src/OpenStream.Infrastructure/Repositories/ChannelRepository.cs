using Dapper;
using OpenStream.Application.Abstractions;
using OpenStream.Application.Channels.Queries.GetChannels;
using OpenStream.Application.Common;
using OpenStream.Domain.Entities;
using OpenStream.Infrastructure.Persistence;

namespace OpenStream.Infrastructure.Repositories;

public sealed class ChannelRepository(IDapperConnectionFactory connectionFactory) : IChannelRepository
{
    public async Task<PagedResult<ChannelDto>> GetPagedAsync(
        string? category,
        string? search,
        bool? showInTvMode,
        IReadOnlyCollection<Guid>? channelIds,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var where = @"where c.""IsActive"" = true and coalesce(c.""Status"", 'Active') <> 'Archived'";
        var parameters = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(category))
        {
            where += @" and lower(cat.""Name"") = lower(@Category)";
            parameters.Add("Category", category.Trim());
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            where += @" and (
                lower(c.""Name"") like @Search escape '\'
                or lower(coalesce(cat.""Name"", '')) like @Search escape '\'
            )";
            parameters.Add("Search", $"%{EscapeLikePattern(search.Trim().ToLowerInvariant())}%");
        }

        if (showInTvMode.HasValue)
        {
            where += @" and c.""ShowInTvMode"" = @ShowInTvMode";
            parameters.Add("ShowInTvMode", showInTvMode.Value);
        }

        if (channelIds is { Count: > 0 })
        {
            where += @" and c.""Id"" = any(@ChannelIds)";
            parameters.Add("ChannelIds", channelIds.ToArray());
        }

        parameters.Add("Limit", pageSize);
        parameters.Add("Offset", (page - 1) * pageSize);

        var countSql = $@"
            select count(1)
            from ""Channels"" c
            left join ""Categories"" cat on cat.""Id"" = c.""CategoryId""
            {where};";

        var dataSql = $@"
            select
                c.""Id"",
                c.""Name"",
                c.""StreamUrl"",
                c.""LogoUrl"",
                c.""CategoryId"",
                cat.""Name"" as ""CategoryName"",
                c.""IsActive"",
                c.""ShowInTvMode"",
                coalesce(c.""Status"", 'Active') as ""Status"",
                c.""LastCheckedAt""
            from ""Channels"" c
            left join ""Categories"" cat on cat.""Id"" = c.""CategoryId""
            {where}
            order by cat.""Name"" nulls last, c.""Name""
            limit @Limit offset @Offset;";

        var total = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(countSql, parameters, cancellationToken: cancellationToken));

        var items = await connection.QueryAsync<ChannelDto>(
            new CommandDefinition(dataSql, parameters, cancellationToken: cancellationToken));

        return new PagedResult<ChannelDto>(items.AsList(), page, pageSize, total);
    }

    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string sql = @"
            select cat.""Id"", cat.""Name""
            from ""Categories"" cat
            where exists (
                select 1
                from ""Channels"" c
                where c.""CategoryId"" = cat.""Id""
                  and c.""IsActive"" = true
                  and coalesce(c.""Status"", 'Active') <> 'Archived'
            )
            order by cat.""Name"";";

        var categories = await connection.QueryAsync<CategoryDto>(
            new CommandDefinition(sql, cancellationToken: cancellationToken));

        return categories.AsList();
    }

    public async Task<ChannelDto?> GetByIdAsync(Guid channelId, CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string sql = @"
            select
                c.""Id"",
                c.""Name"",
                c.""StreamUrl"",
                c.""LogoUrl"",
                c.""CategoryId"",
                cat.""Name"" as ""CategoryName"",
                c.""IsActive"",
                c.""ShowInTvMode"",
                coalesce(c.""Status"", 'Active') as ""Status"",
                c.""LastCheckedAt""
            from ""Channels"" c
            left join ""Categories"" cat on cat.""Id"" = c.""CategoryId""
            where c.""Id"" = @ChannelId;";

        return await connection.QuerySingleOrDefaultAsync<ChannelDto>(
            new CommandDefinition(sql, new { ChannelId = channelId }, cancellationToken: cancellationToken));
    }

    public async Task<PagedResult<ChannelDto>> GetReportedAsync(
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("Limit", pageSize);
        parameters.Add("Offset", (page - 1) * pageSize);

        const string countSql = @"
            select count(1)
            from ""Channels""
            where coalesce(""Status"", 'Active') = 'Reported';";

        const string dataSql = @"
            select
                c.""Id"",
                c.""Name"",
                c.""StreamUrl"",
                c.""LogoUrl"",
                c.""CategoryId"",
                cat.""Name"" as ""CategoryName"",
                c.""IsActive"",
                c.""ShowInTvMode"",
                coalesce(c.""Status"", 'Active') as ""Status"",
                c.""LastCheckedAt""
            from ""Channels"" c
            left join ""Categories"" cat on cat.""Id"" = c.""CategoryId""
            where coalesce(c.""Status"", 'Active') = 'Reported'
            order by c.""LastCheckedAt"" desc nulls last, c.""UpdatedAt"" desc
            limit @Limit offset @Offset;";

        var total = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(countSql, cancellationToken: cancellationToken));

        var items = await connection.QueryAsync<ChannelDto>(
            new CommandDefinition(dataSql, parameters, cancellationToken: cancellationToken));

        return new PagedResult<ChannelDto>(items.AsList(), page, pageSize, total);
    }

    public async Task<Guid> UpsertCategoryAsync(string name, CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string sql = @"
            insert into ""Categories"" (""Name"", ""UpdatedAt"")
            values (@Name, now())
            on conflict (""Name"")
            do update set ""UpdatedAt"" = excluded.""UpdatedAt""
            returning ""Id"";";

        return await connection.ExecuteScalarAsync<Guid>(
            new CommandDefinition(sql, new { Name = name.Trim() }, cancellationToken: cancellationToken));
    }

    public async Task UpsertChannelAsync(Channel channel, CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string sql = @"
            insert into ""Channels"" (
                ""Name"",
                ""StreamUrl"",
                ""LogoUrl"",
                ""CategoryId"",
                ""IsActive"",
                ""Status"",
                ""LastCheckedAt"",
                ""UpdatedAt"")
            values (
                @Name,
                @StreamUrl,
                @LogoUrl,
                @CategoryId,
                @IsActive,
                @Status,
                @LastCheckedAt,
                now())
            on conflict (""Name"")
            do update set
                ""StreamUrl"" = excluded.""StreamUrl"",
                ""LogoUrl"" = excluded.""LogoUrl"",
                ""CategoryId"" = excluded.""CategoryId"",
                ""IsActive"" = excluded.""IsActive"",
                ""Status"" = excluded.""Status"",
                ""LastCheckedAt"" = excluded.""LastCheckedAt"",
                ""UpdatedAt"" = now();";

        await connection.ExecuteAsync(
            new CommandDefinition(sql, channel, cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyDictionary<string, Guid>> UpsertCategoriesAsync(
        IReadOnlyCollection<string> names,
        CancellationToken cancellationToken)
    {
        var normalizedNames = names
            .Select(name => name.Trim())
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (normalizedNames.Length == 0)
        {
            return new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        }

        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        const string sql = @"
            with input as (
                select distinct nullif(trim(value), '') as ""Name""
                from unnest(cast(@Names as text[])) as source(value)
            ),
            filtered as (
                select ""Name""
                from input
                where ""Name"" is not null
            ),
            upserted as (
                insert into ""Categories"" (""Name"", ""UpdatedAt"")
                select ""Name"", now()
                from filtered
                on conflict (""Name"")
                do update set ""UpdatedAt"" = excluded.""UpdatedAt""
                returning ""Id"", ""Name""
            )
            select ""Id"", ""Name""
            from upserted;";

        try
        {
            var rows = await connection.QueryAsync<CategoryRow>(
                new CommandDefinition(
                    sql,
                    new { Names = normalizedNames },
                    transaction,
                    cancellationToken: cancellationToken));

            transaction.Commit();

            return rows.ToDictionary(
                row => row.Name,
                row => row.Id,
                StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }

    public async Task<int> UpsertChannelsAsync(
        IReadOnlyCollection<Channel> channels,
        CancellationToken cancellationToken)
    {
        var batch = channels
            .Where(channel =>
                !string.IsNullOrWhiteSpace(channel.Name)
                && !string.IsNullOrWhiteSpace(channel.StreamUrl)
                && channel.CategoryId.HasValue)
            .DistinctBy(channel => channel.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (batch.Length == 0)
        {
            return 0;
        }

        var parameters = new
        {
            Names = batch.Select(channel => channel.Name.Trim()).ToArray(),
            StreamUrls = batch.Select(channel => channel.StreamUrl.Trim()).ToArray(),
            LogoUrls = batch.Select(channel =>
                string.IsNullOrWhiteSpace(channel.LogoUrl) ? null : channel.LogoUrl.Trim()).ToArray(),
            CategoryIds = batch.Select(channel => channel.CategoryId!.Value).ToArray(),
            IsActives = batch.Select(channel => channel.IsActive).ToArray(),
            Statuses = batch.Select(channel =>
                string.IsNullOrWhiteSpace(channel.Status) ? "Active" : channel.Status.Trim()).ToArray()
        };

        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        const string sql = @"
            with input as (
                select *
                from unnest(
                    cast(@Names as text[]),
                    cast(@StreamUrls as text[]),
                    cast(@LogoUrls as text[]),
                    cast(@CategoryIds as uuid[]),
                    cast(@IsActives as boolean[]),
                    cast(@Statuses as text[])
                ) as source(
                    ""Name"",
                    ""StreamUrl"",
                    ""LogoUrl"",
                    ""CategoryId"",
                    ""IsActive"",
                    ""Status""
                )
            ),
            deduplicated as (
                select distinct on (lower(""Name""))
                    trim(""Name"") as ""Name"",
                    trim(""StreamUrl"") as ""StreamUrl"",
                    nullif(trim(""LogoUrl""), '') as ""LogoUrl"",
                    ""CategoryId"",
                    ""IsActive"",
                    nullif(trim(""Status""), '') as ""Status""
                from input
                where nullif(trim(""Name""), '') is not null
                  and nullif(trim(""StreamUrl""), '') is not null
                order by lower(""Name""), ""Name""
            ),
            upserted as (
                insert into ""Channels"" (
                    ""Name"",
                    ""StreamUrl"",
                    ""LogoUrl"",
                    ""CategoryId"",
                    ""IsActive"",
                    ""Status"",
                    ""LastCheckedAt"",
                    ""UpdatedAt"")
                select
                    ""Name"",
                    ""StreamUrl"",
                    ""LogoUrl"",
                    ""CategoryId"",
                    ""IsActive"",
                    coalesce(""Status"", 'Active'),
                    null,
                    now()
                from deduplicated
                on conflict (""Name"")
                do update set
                    ""StreamUrl"" = excluded.""StreamUrl"",
                    ""LogoUrl"" = excluded.""LogoUrl"",
                    ""CategoryId"" = excluded.""CategoryId"",
                    ""IsActive"" = case
                        when ""Channels"".""Status"" = 'Archived' then false
                        else excluded.""IsActive""
                    end,
                    ""Status"" = case
                        when ""Channels"".""Status"" in ('Archived', 'Reported') then ""Channels"".""Status""
                        else excluded.""Status""
                    end,
                    ""LastCheckedAt"" = null,
                    ""UpdatedAt"" = now()
                returning 1
            )
            select count(*)::int
            from upserted;";

        try
        {
            var upserted = await connection.ExecuteScalarAsync<int>(
                new CommandDefinition(sql, parameters, transaction, cancellationToken: cancellationToken));

            transaction.Commit();
            return upserted;
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }

    public async Task<bool> RecordPlaybackReportAsync(
        Guid channelId,
        CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string sql = @"
            update ""Channels""
            set
                ""LastCheckedAt"" = now(),
                ""UpdatedAt"" = now()
            where ""Id"" = @ChannelId;";

        var affectedRows = await connection.ExecuteAsync(
            new CommandDefinition(sql, new { ChannelId = channelId }, cancellationToken: cancellationToken));

        return affectedRows > 0;
    }

    public async Task<bool> MarkReportedAsync(
        Guid channelId,
        CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string sql = @"
            update ""Channels""
            set
                ""Status"" = 'Reported',
                ""LastCheckedAt"" = now(),
                ""UpdatedAt"" = now()
            where ""Id"" = @ChannelId;";

        var affectedRows = await connection.ExecuteAsync(
            new CommandDefinition(sql, new { ChannelId = channelId }, cancellationToken: cancellationToken));

        return affectedRows > 0;
    }

    public async Task<ChannelDto?> UpdateChannelAsync(
        Guid channelId,
        string? streamUrl,
        string? status,
        bool? isActive,
        CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string sql = @"
            update ""Channels""
            set
                ""StreamUrl"" = coalesce(nullif(trim(cast(@StreamUrl as text)), ''), ""StreamUrl""),
                ""Status"" = coalesce(nullif(trim(cast(@Status as text)), ''), ""Status""),
                ""IsActive"" = coalesce(cast(@IsActive as boolean), ""IsActive""),
                ""LastCheckedAt"" = case
                    when nullif(trim(cast(@Status as text)), '') in ('Active', 'Proxy', 'Archived') then now()
                    else ""LastCheckedAt""
                end,
                ""UpdatedAt"" = now()
            where ""Id"" = @ChannelId
            returning ""Id"";";

        var updatedId = await connection.ExecuteScalarAsync<Guid?>(
            new CommandDefinition(
                sql,
                new
                {
                    ChannelId = channelId,
                    StreamUrl = streamUrl,
                    Status = status,
                    IsActive = isActive
                },
                cancellationToken: cancellationToken));

        return updatedId.HasValue
            ? await GetByIdAsync(updatedId.Value, cancellationToken)
            : null;
    }

    public async Task<ChannelDto?> SetTvModeAsync(
        Guid channelId,
        bool? showInTvMode,
        CancellationToken cancellationToken)
    {
        using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        const string sql = @"
            update ""Channels""
            set
                ""ShowInTvMode"" = coalesce(cast(@ShowInTvMode as boolean), not ""ShowInTvMode""),
                ""UpdatedAt"" = now()
            where ""Id"" = @ChannelId
              and ""IsActive"" = true
              and coalesce(""Status"", 'Active') <> 'Archived'
            returning ""Id"";";

        var updatedId = await connection.ExecuteScalarAsync<Guid?>(
            new CommandDefinition(
                sql,
                new
                {
                    ChannelId = channelId,
                    ShowInTvMode = showInTvMode
                },
                cancellationToken: cancellationToken));

        return updatedId.HasValue
            ? await GetByIdAsync(updatedId.Value, cancellationToken)
            : null;
    }

    private sealed class CategoryRow
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    private static string EscapeLikePattern(string value)
    {
        return value
            .Replace(@"\", @"\\")
            .Replace("%", @"\%")
            .Replace("_", @"\_");
    }
}
