FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Copiamos todo el repositorio
COPY . .

# Buscamos el proyecto dinamicamente y lo compilamos
RUN dotnet publish $(find . -name "OpenStream.API.csproj") -c Release -o /out

# Imagen ligera de produccion
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "OpenStream.API.dll"]
