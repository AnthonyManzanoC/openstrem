import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner
} from '@ionic/angular/standalone';
import { finalize } from 'rxjs';
import { Channel } from '../../core/models/channel.model';
import { ApiService } from '../../core/services/api.service';

type AdminAction = 'save' | 'proxy' | 'archive';

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
export class AdminPage implements OnInit {
  private readonly api = inject(ApiService);

  channels: Channel[] = [];
  draftUrls: Record<string, string> = {};
  loading = false;
  totalReports = 0;
  feedback = '';
  feedbackKind: 'success' | 'error' = 'success';

  private readonly pendingActions = new Map<string, AdminAction>();

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadReports();
  }

  goToWelcome(): void {
    void this.router.navigate(['/']);
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

  private showFeedback(message: string, kind: 'success' | 'error'): void {
    this.feedback = message;
    this.feedbackKind = kind;
  }
}
