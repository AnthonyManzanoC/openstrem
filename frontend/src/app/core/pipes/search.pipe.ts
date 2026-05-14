import { Pipe, PipeTransform } from '@angular/core';
import { Channel } from '../models/channel.model';

@Pipe({
  name: 'searchChannels',
  standalone: true,
  pure: true
})
export class SearchPipe implements PipeTransform {
  transform(channels: readonly Channel[] | null, term: string | null | undefined): Channel[] {
    if (!channels?.length) {
      return [];
    }

    const normalizedTerm = this.normalize(term ?? '');
    if (!normalizedTerm) {
      return [...channels];
    }

    return channels.filter((channel) => {
      const searchable = this.normalize(`${channel.name} ${channel.categoryName ?? ''}`);
      return searchable.includes(normalizedTerm);
    });
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase();
  }
}

