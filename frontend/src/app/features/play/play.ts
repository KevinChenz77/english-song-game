import { Component, inject, input, numberAttribute, resource } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Song } from '../../core/models/song.model';

/** 遊玩（佔位：第二波做影片、歌詞、填填看、唱唱看、家長設定）。 */
@Component({
  imports: [RouterLink],
  selector: 'app-play',
  templateUrl: './play.html',
})
export class Play {
  readonly kidId = input.required({ transform: numberAttribute });
  readonly songId = input.required<string>();
  private readonly api = inject(Api);

  /** 歌曲設定（public/songs/<id>.json）。guard 已用 index.json 確認歌存在。 */
  protected readonly song = httpResource<Song>(() => `songs/${this.songId()}.json`);

  /** 歌詞＋整句中文（後端）。失敗時 error().message 是可直接顯示的中文；重試 = content.reload()。 */
  protected readonly content = resource({
    params: () => this.songId(),
    loader: ({ params }) => this.api.content(params),
  });
}
