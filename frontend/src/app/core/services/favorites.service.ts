import { Injectable } from '@angular/core';
import { Channel } from '../models/channel.model';

interface TvFavoritesState {
  added: string[];
  removed: string[];
}

@Injectable({
  providedIn: 'root'
})
export class FavoritesService {
  private readonly favoritesStorageKey = 'openstream.tv-favorites.v1';
  private readonly favoriteChannelsStorageKey = 'openstream.tv-favorite-channels.v1';
  private readonly clientStorageKey = 'openstream.client-id.v1';
  private readonly defaultFavorites = new Map<string, boolean>();
  private memoryState: TvFavoritesState = { added: [], removed: [] };
  private memoryFavoriteChannels = new Map<string, Channel>();
  private memoryClientId = '';

  getClientId(): string {
    const storedClientId = this.readClientId();

    if (storedClientId) {
      return storedClientId;
    }

    const clientId = this.createClientId();
    this.writeClientId(clientId);

    return clientId;
  }

  applyPreferences(channels: Channel[]): Channel[] {
    const state = this.readState();
    return channels.map((channel) => this.applyPreference(channel, state));
  }

  applyPreference(channel: Channel, state = this.readState()): Channel {
    this.defaultFavorites.set(channel.id, channel.showInTvMode);

    return {
      ...channel,
      showInTvMode: this.isFavorite(channel, state)
    };
  }

  getMergedChannels(apiChannels: Channel[]): Channel[] {
    const state = this.readState();
    const localizedChannels = this.applyPreferences(apiChannels);
    const mergedChannels = localizedChannels.filter((channel) => channel.showInTvMode);
    const mergedIds = new Set(mergedChannels.map((channel) => channel.id));
    const locallyAddedChannels = localizedChannels.filter((channel) =>
      state.added.includes(channel.id) && channel.showInTvMode
    );
    const cachedChannels = this.readFavoriteChannels();

    if (locallyAddedChannels.length > 0) {
      this.rememberFavoriteChannels(locallyAddedChannels);
    }

    state.added.forEach((channelId) => {
      if (mergedIds.has(channelId)) {
        return;
      }

      const cachedChannel = cachedChannels.get(channelId);

      if (!cachedChannel) {
        return;
      }

      mergedChannels.push({
        ...cachedChannel,
        showInTvMode: true
      });
      mergedIds.add(channelId);
    });

    return mergedChannels;
  }

  getAddedChannelIds(): string[] {
    return [...this.readState().added];
  }

  toggleFavorite(channel: Channel): Channel {
    const state = this.readState();
    const defaultFavorite = this.getDefaultFavorite(channel, state);
    const nextFavorite = !this.resolveFavorite(channel.id, defaultFavorite, state);
    const nextState = this.withPreference(state, channel.id, defaultFavorite, nextFavorite);

    this.writeState(nextState);

    const updatedChannel = {
      ...channel,
      showInTvMode: nextFavorite
    };

    if (nextFavorite) {
      this.rememberFavoriteChannel(updatedChannel);
    } else if (!defaultFavorite) {
      this.forgetFavoriteChannel(channel.id);
    }

    return updatedChannel;
  }

  private isFavorite(channel: Channel, state: TvFavoritesState): boolean {
    const defaultFavorite = this.getDefaultFavorite(channel, state);

    return this.resolveFavorite(channel.id, defaultFavorite, state);
  }

  private getDefaultFavorite(channel: Channel, state: TvFavoritesState): boolean {
    if (this.defaultFavorites.has(channel.id)) {
      return this.defaultFavorites.get(channel.id) ?? false;
    }

    if (state.added.includes(channel.id)) {
      return false;
    }

    if (state.removed.includes(channel.id)) {
      return true;
    }

    return channel.showInTvMode;
  }

  private resolveFavorite(
    channelId: string,
    defaultFavorite: boolean,
    state: TvFavoritesState
  ): boolean {
    if (defaultFavorite) {
      return !state.removed.includes(channelId);
    }

    return state.added.includes(channelId);
  }

  private withPreference(
    state: TvFavoritesState,
    channelId: string,
    defaultFavorite: boolean,
    favorite: boolean
  ): TvFavoritesState {
    const added = new Set(state.added);
    const removed = new Set(state.removed);

    added.delete(channelId);
    removed.delete(channelId);

    if (favorite !== defaultFavorite) {
      if (favorite) {
        added.add(channelId);
      } else {
        removed.add(channelId);
      }
    }

    return {
      added: Array.from(added),
      removed: Array.from(removed)
    };
  }

  private readState(): TvFavoritesState {
    try {
      const rawState = localStorage.getItem(this.favoritesStorageKey);

      if (!rawState) {
        return this.memoryState;
      }

      const parsed = JSON.parse(rawState) as Partial<TvFavoritesState>;
      const removed = this.toStringArray(parsed.removed);
      const removedSet = new Set(removed);

      return {
        added: this.toStringArray(parsed.added).filter((id) => !removedSet.has(id)),
        removed
      };
    } catch {
      return this.memoryState;
    }
  }

  private writeState(state: TvFavoritesState): void {
    this.memoryState = state;

    try {
      localStorage.setItem(this.favoritesStorageKey, JSON.stringify(state));
    } catch {
      // Local-first preferences can keep working in memory if storage is blocked.
    }
  }

  private readFavoriteChannels(): Map<string, Channel> {
    try {
      const rawChannels = localStorage.getItem(this.favoriteChannelsStorageKey);

      if (!rawChannels) {
        return new Map(this.memoryFavoriteChannels);
      }

      const parsed = JSON.parse(rawChannels) as Record<string, Channel>;
      const channels = new Map<string, Channel>();

      Object.entries(parsed).forEach(([channelId, channel]) => {
        if (this.isChannelSnapshot(channelId, channel)) {
          channels.set(channelId, channel);
        }
      });

      this.memoryFavoriteChannels = channels;

      return new Map(channels);
    } catch {
      return new Map(this.memoryFavoriteChannels);
    }
  }

  private writeFavoriteChannels(channels: Map<string, Channel>): void {
    this.memoryFavoriteChannels = new Map(channels);

    try {
      localStorage.setItem(
        this.favoriteChannelsStorageKey,
        JSON.stringify(Object.fromEntries(channels))
      );
    } catch {
      // Added channels still work for the current session if storage is blocked.
    }
  }

  private rememberFavoriteChannel(channel: Channel): void {
    this.rememberFavoriteChannels([channel]);
  }

  private rememberFavoriteChannels(channelsToRemember: Channel[]): void {
    const channels = this.readFavoriteChannels();

    channelsToRemember.forEach((channel) => {
      channels.set(channel.id, {
        ...channel,
        showInTvMode: true
      });
    });

    this.writeFavoriteChannels(channels);
  }

  private forgetFavoriteChannel(channelId: string): void {
    const channels = this.readFavoriteChannels();

    if (!channels.delete(channelId)) {
      return;
    }

    this.writeFavoriteChannels(channels);
  }

  private readClientId(): string {
    try {
      return localStorage.getItem(this.clientStorageKey) || this.memoryClientId;
    } catch {
      return this.memoryClientId;
    }
  }

  private writeClientId(clientId: string): void {
    this.memoryClientId = clientId;

    try {
      localStorage.setItem(this.clientStorageKey, clientId);
    } catch {
      // The client id is only used for local identity and can fall back to memory.
    }
  }

  private createClientId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))
    );
  }

  private isChannelSnapshot(channelId: string, value: unknown): value is Channel {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const channel = value as Partial<Channel>;

    return channel.id === channelId
      && typeof channel.name === 'string'
      && typeof channel.streamUrl === 'string'
      && typeof channel.isActive === 'boolean'
      && typeof channel.showInTvMode === 'boolean';
  }
}
