import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  resource,
  untracked,
  viewChild,
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { KidsStore } from '../../core/kids-store';
import { PlaySession } from '../../core/play-session';
import { SongCatalog } from '../../core/song-catalog';
import { Sfx } from '../../core/sfx';
import { YoutubePlayer } from '../../core/youtube-player';
import { starStr } from '../../core/game/reward-rules';
import { Dicts, langOf } from '../../core/lang';
import { PlayMode, Song } from '../../core/models/song.model';
import { LyricsPanel } from './lyrics-panel';
import { QuizPanel } from './quiz-panel';
import { SingPanel } from './sing-panel';
import { WordPop } from './word-pop';

/** 遊玩容器：分頁、影片區（透明遮罩）、▶ 按鈕、狀態訊息、家長設定、歌詞（載入失敗＋重試）。 */
@Component({
  imports: [RouterLink, LyricsPanel, QuizPanel, SingPanel, WordPop],
  selector: 'app-play',
  templateUrl: './play.html',
  styleUrl: './play.css',
})
export class Play {
  readonly kidId = input.required({ transform: numberAttribute });
  readonly songId = input.required<string>();
  private readonly api = inject(Api);
  private readonly kids = inject(KidsStore);
  private readonly catalog = inject(SongCatalog);
  protected readonly session = inject(PlaySession);
  protected readonly player = inject(YoutubePlayer);
  protected readonly sfx = inject(Sfx);
  private readonly yt = viewChild.required<ElementRef<HTMLElement>>('yt');
  private createdFor: string | null = null; // 已建立播放器的 song.id（同一個 Play 換歌時重建）

  protected readonly tabs: [PlayMode, string][] = [
    ['listen', '🎧 聽聽看'],
    ['quiz', '🧩 填填看'],
    ['sing', '🎤 唱唱看'],
  ];

  /** 歌曲設定（public/songs/<id>.json）。guard 已用 index.json 確認歌存在。 */
  protected readonly song = httpResource<Song>(() => `songs/${this.songId()}.json`);

  /** 歌詞＋整句中文（後端）。失敗時 error().message 是可直接顯示的中文；重試 = content.reload()。 */
  protected readonly content = resource({
    params: () => this.songId(),
    loader: ({ params }) => this.api.content(params),
  });

  /** 這首歌用到的語言（歌曲語言＋tokens 裡的其他語言）各一份共用字典。params 用字串，同一組語言不重抓。 */
  private readonly sharedDicts = resource({
    params: () => {
      const s = this.session.song();
      if (!s) return undefined;
      const codes = new Set([langOf(s).code]);
      for (const l of this.session.lines()) for (const t of l.tokens) if (t.l) codes.add(t.l);
      return [...codes].join(',');
    },
    loader: async ({ params }) =>
      Object.fromEntries(
        await Promise.all(params.split(',').map(async (c) => [c, await this.catalog.dict(c)] as const)),
      ),
    defaultValue: {},
  });

  /** 每個語言的共用字典；這首歌的 dict 只疊在歌曲語言那一份上。 */
  protected readonly dicts = computed<Dicts>(() => {
    const s = this.session.song();
    const own = s ? langOf(s).code : '';
    return Object.fromEntries(
      Object.entries(this.sharedDicts.value()).map(([c, d]) => [c, c === own ? { ...d, ...s?.dict } : d]),
    );
  });

  protected readonly stars = computed(() =>
    starStr(this.kids.byId(this.kidId())?.songs[this.songId()] ?? {}),
  );

  protected readonly offsetText = computed(() => {
    const o = this.session.offset();
    return ` ${o > 0 ? '+' : ''}${o.toFixed(1)} 秒 `;
  });

  constructor() {
    // 歌曲設定＋歌詞都到了就開新的一局（資料同步，不是遊戲流程；不會呼叫 play()）
    effect(() => {
      if (!this.song.hasValue() || !this.content.hasValue()) return;
      const s = this.song.value(),
        c = this.content.value(),
        kidId = this.kidId();
      untracked(() => this.session.open(kidId, s, c.lines, c.translations, c.tokens));
    });
    // 這個元件自己的資料都到了（上面的 effect 已先 open()）才建立播放器，每首歌一次。
    // 所以 open()/setMode() 都發生在播放器 ready 之前，不會打斷已經按下的 ▶。
    // 離開畫面就銷毀，回來是全新的 player。
    afterRenderEffect(() => {
      if (!this.song.hasValue() || !this.content.hasValue()) return;
      const s = this.song.value();
      if (this.createdFor === s.id) return;
      const v = s.videos[untracked(this.session.videoIndex)];
      if (!v) return;
      this.createdFor = s.id;
      this.player.create(
        this.yt().nativeElement,
        v.id,
        (t) => this.session.onTick(t),
        () => this.session.finish(),
      );
    });
    inject(DestroyRef).onDestroy(() => this.player.destroy());
  }

  /** ▶／⏸ 與影片遮罩。點擊當下同步 play()（iOS）。 */
  protected toggle(): void {
    if (!this.player.ready()) return;
    if (this.player.playing()) this.player.pause();
    else this.player.play();
  }

  protected setVideo(e: Event): void {
    this.session.setVideo(Number((e.target as HTMLSelectElement).value));
  }

  protected onParentToggle(e: Event): void {
    this.session.parentOpen.set((e.target as HTMLDetailsElement).open);
  }
}
