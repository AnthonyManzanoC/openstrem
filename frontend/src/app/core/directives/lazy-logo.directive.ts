import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject
} from '@angular/core';

@Directive({
  selector: 'img[appLazyLogo]',
  standalone: true
})
export class LazyLogoDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input('appLazyLogo') source: string | null | undefined;

  private readonly element = inject<ElementRef<HTMLImageElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;
  private initialized = false;
  private loaded = false;

  ngAfterViewInit(): void {
    this.initialized = true;
    this.observe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['source'] || !this.initialized) {
      return;
    }

    this.loaded = false;
    this.observe();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private observe(): void {
    this.disconnect();

    const image = this.element.nativeElement;
    image.removeAttribute('src');
    image.classList.add('lazy-logo');

    if (!this.source) {
      image.classList.add('lazy-logo-empty');
      return;
    }

    if (!('IntersectionObserver' in window)) {
      this.load();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.load();
        }
      },
      {
        rootMargin: '220px 0px',
        threshold: 0.01
      }
    );

    this.observer.observe(image);
  }

  private load(): void {
    if (this.loaded || !this.source) {
      return;
    }

    this.loaded = true;
    const image = this.element.nativeElement;
    image.src = this.source;
    image.classList.add('lazy-logo-loaded');
    this.disconnect();
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

