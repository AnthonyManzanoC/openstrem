import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner
} from '@ionic/angular/standalone';
import { finalize, timeout } from 'rxjs';
import {
  Category,
  Channel,
  ChannelOrderItem
} from '../../core/models/channel.model';
import { ApiService } from '../../core/services/api.service';

type AdminAction = 'save' | 'proxy' | 'archive' | 'tvMode';

interface ChannelFormModel {
  name: string;
  streamUrl: string;
  categoryName: string;
  showInTvMode: boolean;
}

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonContent,
    IonIcon,
    IonSpinner
  ],
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.scss'
})
export class AdminPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  channels: Channel[] = [];
  tvChannels: Channel[] = [];
  orderedTvChannels: Channel[] = [];
  categories: Category[] = [];
  draftUrls: Record<string, string> = {};
  newChannel: ChannelFormModel = this.createEmptyChannelForm();
  loading = false;
  tvLoading = false;
  createPanelOpen = false;
  orderPanelOpen = false;
  creatingChannel = false;
  orderLoading = false;
  savingTvOrder = false;
  totalReports = 0;
  tvTotalCount = 0;
  tvHasMore = true;
  tvSearchTerm = '';
  feedback = '';
  feedbackKind: 'success' | 'error' = 'success';

  private readonly pendingActions = new Map<string, AdminAction>();
  private readonly tvPageSize = 80;
  private readonly searchDelayMs = 280;
  private tvPage = 1;
  private tvSearchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadReports();
    this.loadTvChannels(true);
  }

  ngOnDestroy(): void {
    this.clearTvSearchTimer();
  }

  goToWelcome(): void {
    void this.router.navigate(['/']);
  }

  openCreatePanel(): void {
    this.feedback = '';
    this.newChannel = this.createEmptyChannelForm();
    this.createPanelOpen = true;
  }

  closeCreatePanel(): void {
    if (this.creatingChannel) {
      return;
    }

    this.createPanelOpen = false;
  }

  openOrderPanel(): void {
    this.feedback = '';
    this.orderPanelOpen = true;
    this.loadOrderedTvChannels();
  }

  closeOrderPanel(): void {
    if (this.savingTvOrder) {
      return;
    }

    this.orderPanelOpen = false;
    this.orderedTvChannels = [];
    this.orderLoading = false;
  }

  loadCategories(): void {
    this.api.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: () => {
        this.categories = [];
      }
    });
  }

  createChannel(): void {
    const name = this.newChannel.name.trim();
    const streamUrl = this.newChannel.streamUrl.trim();
    const categoryName = this.newChannel.categoryName.trim();

    if (!name || !streamUrl || !categoryName) {
      this.showFeedback('Completa nombre, URL y categoria antes de guardar.', 'error');
      return;
    }

    if (!this.isHttpUrl(streamUrl)) {
      this.showFeedback('La URL debe empezar por http:// o https://.', 'error');
      return;
    }

    this.creatingChannel = true;
    this.feedback = '';

    this.api.createChannel({
      name,
      streamUrl,
      categoryName,
      showInTvMode: this.newChannel.showInTvMode
    })
      .pipe(finalize(() => {
        this.creatingChannel = false;
      }))
      .subscribe({
        next: (createdChannel) => {
          this.createPanelOpen = false;
          this.newChannel = this.createEmptyChannelForm();
          this.prependCreatedChannel(createdChannel);
          this.loadCategories();

          if (this.orderPanelOpen && createdChannel.showInTvMode) {
            this.orderedTvChannels = [...this.orderedTvChannels, createdChannel];
          }

          this.showFeedback('Canal creado y agregado al panel.', 'success');
        },
        error: () => this.showFeedback('No se pudo crear el canal. Revisa si el nombre ya existe.', 'error')
      });
  }

  loadReports(): void {
    this.loading = true;
    this.feedback = '';

    this.api.getReportedChannels(1, 150)
      .pipe(finalize(() => {
        this.loading = false;
      }))
      .subscribe({
        next: (result) => {
          this.channels = result.items;
          this.totalReports = result.totalCount;
          this.draftUrls = Object.fromEntries(
            result.items.map((channel) => [channel.id, channel.streamUrl])
          );
        },
        error: () => {
          this.channels = [];
          this.totalReports = 0;
          this.showFeedback('No se pudieron cargar los reportes.', 'error');
        }
      });
  }

  loadTvChannels(reset: boolean): void {
    if (this.tvLoading) {
      return;
    }

    if (!reset && !this.tvHasMore) {
      return;
    }

    if (reset) {
      this.tvPage = 1;
      this.tvChannels = [];
      this.tvTotalCount = 0;
      this.tvHasMore = true;
    }

    this.tvLoading = true;
    this.feedback = '';

    this.api.getChannels({
      page: this.tvPage,
      pageSize: this.tvPageSize,
      search: this.tvSearchTerm.trim() || undefined
    })
      .pipe(
        timeout(15000),
        finalize(() => {
          this.tvLoading = false;
        })
      )
      .subscribe({
        next: (result) => {
          this.tvChannels = reset ? result.items : [...this.tvChannels, ...result.items];
          this.tvTotalCount = result.totalCount;
          this.tvHasMore = result.hasMore;
          this.tvPage += 1;
        },
        error: () => {
          if (reset) {
            this.tvChannels = [];
            this.tvTotalCount = 0;
          }

          this.showFeedback('No se pudieron cargar los canales para Modo TV.', 'error');
        }
      });
  }

  loadOrderedTvChannels(): void {
    this.orderLoading = true;
    this.orderedTvChannels = [];
    this.loadOrderedTvChannelsPage(1, []);
  }

  moveOrderedChannel(index: number, direction: -1 | 1): void {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= this.orderedTvChannels.length) {
      return;
    }

    const reorderedChannels = [...this.orderedTvChannels];
    const [movedChannel] = reorderedChannels.splice(index, 1);
    reorderedChannels.splice(nextIndex, 0, movedChannel);
    this.orderedTvChannels = reorderedChannels;
  }

  saveTvOrder(): void {
    if (this.orderedTvChannels.length === 0) {
      this.showFeedback('No hay canales predeterminados para ordenar.', 'error');
      return;
    }

    const channels: ChannelOrderItem[] = this.orderedTvChannels.map((channel, index) => ({
      id: channel.id,
      position: index + 1
    }));

    this.savingTvOrder = true;
    this.feedback = '';

    this.api.reorderTvChannels(channels)
      .pipe(finalize(() => {
        this.savingTvOrder = false;
      }))
      .subscribe({
        next: (updatedChannels) => {
          this.orderedTvChannels = updatedChannels;
          this.orderPanelOpen = false;
          this.loadTvChannels(true);
          this.showFeedback('Orden de Modo TV guardado.', 'success');
        },
        error: () => this.showFeedback('No se pudo guardar el orden de Modo TV.', 'error')
      });
  }

  onTvSearchTermChange(term: string): void {
    this.tvSearchTerm = term;
    this.clearTvSearchTimer();
    this.tvSearchTimer = setTimeout(() => this.loadTvChannels(true), this.searchDelayMs);
  }

  clearTvSearch(): void {
    if (!this.tvSearchTerm) {
      return;
    }

    this.tvSearchTerm = '';
    this.clearTvSearchTimer();
    this.loadTvChannels(true);
  }

  toggleGlobalTvMode(channel: Channel): void {
    if (this.isBusy(channel.id)) {
      return;
    }

    const showInTvMode = !channel.showInTvMode;
    this.startAction(channel.id, 'tvMode');

    this.api.setChannelTvMode(channel.id, showInTvMode)
      .pipe(finalize(() => this.stopAction(channel.id)))
      .subscribe({
        next: (updatedChannel) => {
          this.replaceChannel(updatedChannel);

          if (this.orderPanelOpen) {
            this.syncOrderedChannel(updatedChannel);
          }

          this.showFeedback(
            showInTvMode
              ? 'Canal destacado en Modo TV para todos los clientes.'
              : 'Canal retirado de los predeterminados de Modo TV.',
            'success'
          );
        },
        error: () => this.showFeedback('No se pudo cambiar el estado global de Modo TV.', 'error')
      });
  }

  saveUrl(channel: Channel): void {
    const streamUrl = this.draftUrls[channel.id]?.trim();

    if (!streamUrl) {
      this.showFeedback('Pega una URL valida antes de guardar.', 'error');
      return;
    }

    this.startAction(channel.id, 'save');

    this.api.updateChannel(channel.id, {
      streamUrl,
      status: 'Active',
      isActive: true
    })
      .pipe(finalize(() => this.stopAction(channel.id)))
      .subscribe({
        next: () => {
          this.removeReport(channel.id);
          this.showFeedback('URL actualizada y canal reactivado.', 'success');
        },
        error: () => this.showFeedback('No se pudo guardar la nueva URL.', 'error')
      });
  }

  forceProxy(channel: Channel): void {
    this.startAction(channel.id, 'proxy');

    this.api.forceProxyChannel(channel.id)
      .pipe(finalize(() => this.stopAction(channel.id)))
      .subscribe({
        next: () => {
          this.removeReport(channel.id);
          this.showFeedback('Proxy aplicado y canal devuelto a la app.', 'success');
        },
        error: () => this.showFeedback('No se pudo aplicar el proxy.', 'error')
      });
  }

  searchReplacement(channel: Channel): void {
    const query = encodeURIComponent(`"${channel.name}" ext:m3u8 OR ext:m3u live`);
    window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
  }

  archive(channel: Channel): void {
    this.startAction(channel.id, 'archive');

    this.api.updateChannel(channel.id, {
      status: 'Archived',
      isActive: false
    })
      .pipe(finalize(() => this.stopAction(channel.id)))
      .subscribe({
        next: () => {
          this.removeReport(channel.id);
          this.showFeedback('Canal archivado.', 'success');
        },
        error: () => this.showFeedback('No se pudo archivar el canal.', 'error')
      });
  }

  isBusy(channelId: string, action?: AdminAction): boolean {
    const currentAction = this.pendingActions.get(channelId);
    return action ? currentAction === action : Boolean(currentAction);
  }

  trackByChannelId(_: number, channel: Channel): string {
    return channel.id;
  }

  trackByCategoryId(_: number, category: Category): string {
    return category.id;
  }

  private loadOrderedTvChannelsPage(page: number, collectedChannels: Channel[]): void {
    if (!this.orderPanelOpen) {
      this.orderLoading = false;
      return;
    }

    this.api.getChannels({
      page,
      pageSize: 100,
      showInTvMode: true
    })
      .pipe(timeout(15000))
      .subscribe({
        next: (result) => {
          const mergedChannels = [...collectedChannels, ...result.items];

          if (result.hasMore) {
            this.loadOrderedTvChannelsPage(page + 1, mergedChannels);
            return;
          }

          this.orderedTvChannels = mergedChannels;
          this.orderLoading = false;
        },
        error: () => {
          this.orderedTvChannels = [];
          this.orderLoading = false;
          this.showFeedback('No se pudieron cargar los canales de Modo TV.', 'error');
        }
      });
  }

  private createEmptyChannelForm(): ChannelFormModel {
    return {
      name: '',
      streamUrl: '',
      categoryName: '',
      showInTvMode: true
    };
  }

  private prependCreatedChannel(createdChannel: Channel): void {
    this.tvChannels = [
      createdChannel,
      ...this.tvChannels.filter((channel) => channel.id !== createdChannel.id)
    ];
    this.tvTotalCount += 1;
    this.draftUrls[createdChannel.id] = createdChannel.streamUrl;
  }

  private syncOrderedChannel(updatedChannel: Channel): void {
    if (!updatedChannel.showInTvMode) {
      this.orderedTvChannels = this.orderedTvChannels.filter((channel) => channel.id !== updatedChannel.id);
      return;
    }

    const channelIndex = this.orderedTvChannels.findIndex((channel) => channel.id === updatedChannel.id);

    if (channelIndex === -1) {
      this.orderedTvChannels = [...this.orderedTvChannels, updatedChannel];
      return;
    }

    this.orderedTvChannels = this.orderedTvChannels.map((channel) =>
      channel.id === updatedChannel.id ? updatedChannel : channel
    );
  }

  private isHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private startAction(channelId: string, action: AdminAction): void {
    this.feedback = '';
    this.pendingActions.set(channelId, action);
  }

  private stopAction(channelId: string): void {
    this.pendingActions.delete(channelId);
  }

  private removeReport(channelId: string): void {
    this.channels = this.channels.filter((channel) => channel.id !== channelId);
    delete this.draftUrls[channelId];
  }

  private replaceChannel(updatedChannel: Channel): void {
    this.tvChannels = this.tvChannels.map((channel) =>
      channel.id === updatedChannel.id ? updatedChannel : channel
    );
    this.channels = this.channels.map((channel) =>
      channel.id === updatedChannel.id ? updatedChannel : channel
    );
    this.draftUrls[updatedChannel.id] = updatedChannel.streamUrl;
  }

  private clearTvSearchTimer(): void {
    if (!this.tvSearchTimer) {
      return;
    }

    clearTimeout(this.tvSearchTimer);
    this.tvSearchTimer = null;
  }

  private showFeedback(message: string, kind: 'success' | 'error'): void {
    this.feedback = message;
    this.feedbackKind = kind;
  }
}
