# 1. Usar la imagen del SDK de .NET 8 para compilar
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# 2. Copiar los archivos de proyecto y restaurar dependencias
COPY src/OpenStream.API/*.csproj ./src/OpenStream.API/
COPY src/OpenStream.Application/*.csproj ./src/OpenStream.Application/
COPY src/OpenStream.Domain/*.csproj ./src/OpenStream.Domain/
COPY src/OpenStream.Infrastructure/*.csproj ./src/OpenStream.Infrastructure/
RUN dotnet restore src/OpenStream.API/OpenStream.API.csproj

# 3. Copiar el resto del código y publicar
COPY . .
WORKDIR /app/src/OpenStream.API
RUN dotnet publish -c Release -o /out

# 4. Usar la imagen ligera de ASP.NET 8 para ejecutar
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .

# 5. Configurar el puerto (Render usa la variable PORT o 8080 por defecto)
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "OpenStream.API.dll"]
