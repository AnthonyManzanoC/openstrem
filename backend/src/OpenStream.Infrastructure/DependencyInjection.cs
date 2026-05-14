using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenStream.Application.Abstractions;
using OpenStream.Infrastructure.Persistence;
using OpenStream.Infrastructure.Repositories;
using OpenStream.Infrastructure.Services;

namespace OpenStream.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton<IDapperConnectionFactory, DapperConnectionFactory>();
        services.AddScoped<IChannelRepository, ChannelRepository>();
        services.AddScoped<IAppConfigRepository, AppConfigRepository>();
        services.AddHttpClient();

        services.AddHttpClient<IM3USynchronizerService, M3USynchronizerService>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(45);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 OpenStream-IPTV/1.0");
        });

        return services;
    }
}
