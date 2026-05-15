import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
  effect,
  inject,
  signal
} from '@angular/core';
import { AdService } from '../../core/services/ad.service';
import { ConfigService } from '../../core/services/config.service';

@Component({
  selector: 'app-ad-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ad-banner.component.html',
  styleUrl: './ad-banner.component.scss'
})
export class AdBannerComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly ads = inject(AdService);
  readonly config = inject(ConfigService);

  @Input() compact = false;
  @ViewChild('adContainer', { static: true }) private adContainer?: ElementRef<HTMLElement>;

  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly viewReady = signal(false);
  private readonly injectedNodes: Node[] = [];
  private lastInjectedAdScript = '';

  constructor() {
    effect(() => {
      const ready = this.viewReady();
      const adScript = this.config.config().adScript;
      const canRender = this.shouldRender();

      if (!ready) {
        return;
      }

      if (!canRender || !adScript) {
        this.clearInjectedAd();
        return;
      }

      queueMicrotask(() => this.injectAd(adScript));
    });
  }

  ngOnInit(): void {
    void this.ads
      .showBanner()
      .catch(() => undefined);
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);
  }

  ngOnDestroy(): void {
    this.clearInjectedAd();
  }

  shouldRender(): boolean {
    return this.config.loaded() && this.ads.webBannerVisible();
  }

  injectAd(adScript = this.config.config().adScript): void {
    const normalizedAdScript = adScript.trim();

    if (!normalizedAdScript || normalizedAdScript === this.lastInjectedAdScript) {
      return;
    }

    const container = this.adContainer?.nativeElement ?? this.host.nativeElement;
    this.clearInjectedAd();

    const parsedDocument = new DOMParser().parseFromString(normalizedAdScript, 'text/html');
    const scripts = Array.from(parsedDocument.querySelectorAll('script'));

    scripts.forEach((script) => script.remove());
    this.appendNonScriptNodes(parsedDocument.body, container);

    scripts.forEach((originalScript) => {
      const script = this.renderer.createElement('script') as HTMLScriptElement;

      if (!originalScript.hasAttribute('async')) {
        script.async = false;
      }

      Array.from(originalScript.attributes).forEach((attribute) => {
        this.renderer.setAttribute(script, attribute.name, attribute.value);
      });

      const inlineCode = originalScript.textContent?.trim();

      if (inlineCode) {
        this.renderer.setProperty(script, 'text', originalScript.textContent ?? '');
      }

      this.renderer.appendChild(container, script);
      this.injectedNodes.push(script);
    });

    this.lastInjectedAdScript = normalizedAdScript;
  }

  private appendNonScriptNodes(source: HTMLElement, container: HTMLElement): void {
    Array.from(source.childNodes).forEach((node) => {
      const clonedNode = node.cloneNode(true);

      this.renderer.appendChild(container, clonedNode);
      this.injectedNodes.push(clonedNode);
    });
  }

  private clearInjectedAd(): void {
    while (this.injectedNodes.length > 0) {
      const node = this.injectedNodes.pop();
      const parent = node?.parentNode;

      if (node && parent) {
        this.renderer.removeChild(parent, node);
      }
    }

    this.lastInjectedAdScript = '';
  }
}
