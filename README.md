# OpenStream IPTV

Base multiplataforma para streaming IPTV legal con .NET 8, Clean Architecture, Dapper, MediatR, Supabase, Ionic Angular, Capacitor, Electron y video.js.

## 1. SQL Supabase

Ejecuta `database/supabase.sql` en el SQL Editor de Supabase.

## 2. Backend CLI

```powershell
cd backend
dotnet new sln -n OpenStream
dotnet sln add src/OpenStream.Domain/OpenStream.Domain.csproj
dotnet sln add src/OpenStream.Application/OpenStream.Application.csproj
dotnet sln add src/OpenStream.Infrastructure/OpenStream.Infrastructure.csproj
dotnet sln add src/OpenStream.API/OpenStream.API.csproj
dotnet restore
dotnet run --project src/OpenStream.API/OpenStream.API.csproj
```

Paquetes usados: `Dapper`, `Npgsql`, `MediatR`, `Microsoft.Extensions.Http`.

## 3. Frontend CLI

```powershell
cd frontend
npm.cmd install
npm.cmd run start
```

Comandos de plataforma:

```powershell
npm.cmd run cap:add:android
npm.cmd run android
npm.cmd run cap:add:ios
npm.cmd run ios
npm.cmd run electron
```

Paquetes usados: `@ionic/angular`, `@capacitor/core`, `@capacitor-community/admob`, `video.js`, `electron`.

## 4. Endpoints

- `GET /api/channels?category=News&page=1&pageSize=48`
- `GET /api/categories`
- `GET /api/ads`
- `POST /api/sync/m3u`
- `GET /health`

