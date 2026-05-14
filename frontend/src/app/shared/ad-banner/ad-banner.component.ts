import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { AdService } from '../../core/services/ad.service';
import { ConfigService } from '../../core/services/config.service';

@Component({
  selector: 'app-ad-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ad-banner.component.html',
  styleUrl: './ad-banner.component.scss'
})
export class AdBannerComponent implements OnInit {
  readonly ads = inject(AdService);
  readonly config = inject(ConfigService);

  @Input() compact = false;

  ngOnInit(): void {
    void this.ads
      .showBanner()
      .catch(() => undefined);
  }

  shouldRender(): boolean {
    return this.config.loaded() && (this.config.isNativeMobile() || this.ads.webBannerVisible());
  }

  getPlatformLabel(): string {
    const runtime = this.config.getRuntime();

    if (runtime === 'android' || runtime === 'ios' || runtime === 'capacitor') {
      return 'AdMob movil';
    }

    if (runtime === 'electron') {
      return 'AdSense escritorio';
    }

    return 'AdSense web';
  }

  getPlacementId(): string {
    const adsConfig = this.config.config();
    return this.config.isNativeMobile()
      ? adsConfig.adMobBannerId
      : adsConfig.webAdClient;
  }
}
