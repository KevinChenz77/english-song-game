import { Component, ElementRef, Service, computed, inject, signal, viewChild } from '@angular/core';
import { FormField, form, validate } from '@angular/forms/signals';
import { Api } from '../../core/api';
import { KidsStore } from '../../core/kids-store';
import { SongCatalog } from '../../core/song-catalog';
import { Kid } from '../../core/models/kid.model';
import { SavedPlayer } from '../../core/models/save-data.model';
import { buildSave, cleanSave, sameName } from '../../core/game/save-data';
import { starStr } from '../../core/game/reward-rules';
import { nameOk, passwordOk } from '../../core/game/text';
import { load, save } from '../../core/storage';

type Kind = 'save' | 'load';

/**
 * 讓 💾（外框）和 📥（選小朋友）打開同一個 <app-cloud-dialog>。
 * ponytail: CloudDialog 建構時把自己的 open 塞進來，只支援畫面上一個實例；要多個再改成 signal 請求＋effect。
 */
@Service()
export class Cloud {
  open: (kind: Kind) => void = () => {};
}

/**
 * 匯入：沒有同名的就新增；同名的依序問 ask()（true = 用雲端的）。
 * 名字不合格（1～10 字）的玩家算略過。
 */
export async function mergeImport(
  store: KidsStore,
  players: SavedPlayer[],
  ask: (mine: Kid, theirs: SavedPlayer) => Promise<boolean>,
) {
  let added = 0,
    updated = 0,
    skipped = 0;
  for (const p of players) {
    const mine = sameName(store.kids(), p.name);
    if (!mine) {
      if (store.add(p.name, p.avatar, { songs: p.songs, stickers: p.stickers })) added++;
      else skipped++;
    } else if (await ask(mine, p)) {
      store.update(mine.id, (k) => ({ ...k, avatar: p.avatar, songs: p.songs, stickers: p.stickers }));
      updated++;
    }
  }
  return { added, updated, skipped };
}

@Component({
  imports: [FormField],
  selector: 'app-cloud-dialog',
  templateUrl: './cloud-dialog.html',
  styleUrl: './cloud-dialog.css',
})
export class CloudDialog {
  private readonly api = inject(Api);
  private readonly store = inject(KidsStore);
  private readonly catalog = inject(SongCatalog);

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly askDlg = viewChild.required<ElementRef<HTMLDialogElement>>('askDlg');
  private readonly nameEl = viewChild.required<ElementRef<HTMLInputElement>>('nameEl');
  private readonly pwEl = viewChild.required<ElementRef<HTMLInputElement>>('pwEl');
  private readonly closeEl = viewChild.required<ElementRef<HTMLButtonElement>>('closeEl');

  protected readonly kind = signal<Kind>('save');
  protected readonly msg = signal('');
  protected readonly bad = signal(false);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);

  private readonly model = signal({ name: '', password: '' });
  protected readonly f = form(this.model, (p) => {
    validate(p.name, ({ value }) => (nameOk(value()) ? undefined : { kind: 'name', message: '名字要 1～10 個字' }));
    validate(p.password, ({ value }) =>
      passwordOk(value()) ? undefined : { kind: 'password', message: '密碼要 4～64 個字' },
    );
  });

  /** 同名比較 dialog 的內容；null = 沒在問。 */
  protected readonly asking = signal<{ mine: Kid; theirs: SavedPlayer } | null>(null);
  private resolveAsk?: (useCloud: boolean) => void;
  protected readonly compare = computed(() => {
    const a = this.asking();
    return a && { cloud: this.describe(a.theirs), here: this.describe(a.mine) };
  });

  constructor() {
    inject(Cloud).open = (kind) => this.open(kind);
  }

  open(kind: Kind) {
    if (this.dlg().nativeElement.open) return;
    this.kind.set(kind);
    const name = load('cloudName', '');
    this.model.set({ name, password: '' });
    this.say('');
    this.done.set(false);
    this.dlg().nativeElement.showModal();
    (name ? this.pwEl() : this.nameEl()).nativeElement.focus(); // 游標移到第一個空白欄位
  }

  protected close() {
    this.dlg().nativeElement.close();
  }

  /** dialog 關掉（取消、關閉、Esc）時清掉密碼。 */
  protected closed() {
    this.clearPassword();
  }

  private clearPassword() {
    this.model.update((m) => ({ ...m, password: '' }));
  }

  /** 按 Enter 也會走這裡。 */
  protected async submit(e: Event) {
    e.preventDefault();
    if (this.busy()) return;
    for (const [field, el] of [
      [this.f.name, this.nameEl],
      [this.f.password, this.pwEl],
    ] as const) {
      if (field().invalid()) {
        this.say(field().errors()[0].message ?? '', true);
        return el().nativeElement.focus();
      }
    }
    const { password } = this.model();
    const name = this.model().name.trim();
    save('cloudName', name); // 只記名字，不記密碼
    this.busy.set(true);
    this.say('');
    try {
      if (this.kind() === 'save') {
        const r = await this.api.save(name, password, buildSave(this.store.kids()));
        return this.finish(r.created ? '存好了！下次用同樣的名字和密碼就能匯入' : '存好了！');
      }
      const players = cleanSave(await this.api.load(name, password));
      if (!players) return this.say('存檔格式不對', true);
      const r = await mergeImport(this.store, players, (mine, theirs) => this.ask(mine, theirs));
      this.finish(
        `匯入完成：新增 ${r.added} 位、更新 ${r.updated} 位` + (r.skipped ? `、略過 ${r.skipped} 位（名字要 1～10 個字）` : ''),
      );
    } catch (err) {
      this.say((err as Error).message, true);
    } finally {
      this.busy.set(false);
    }
  }

  /** 第二個 dialog 關掉時 resolve；Esc＝保留這台。 */
  private ask(mine: Kid, theirs: SavedPlayer) {
    this.asking.set({ mine, theirs });
    const d = this.askDlg().nativeElement;
    d.returnValue = '';
    d.showModal();
    return new Promise<boolean>((res) => (this.resolveAsk = res));
  }

  protected asked() {
    this.resolveAsk?.(this.askDlg().nativeElement.returnValue === 'cloud');
    this.resolveAsk = undefined;
    this.asking.set(null);
  }

  /** 每首歌一行星星＋貼紙。 */
  private describe(k: SavedPlayer) {
    const known = this.catalog.songs.hasValue() ? this.catalog.songs.value() : [];
    const ids = [...new Set([...known.map((s) => s.id), ...Object.keys(k.songs)])];
    return {
      songs: ids.map((id) => {
        const s = known.find((x) => x.id === id);
        return `${s?.emoji ?? '🎵'} ${s?.title ?? id}：${starStr(k.songs[id] ?? {})}`;
      }),
      stickers: k.stickers.join(' ') || '還沒有',
    };
  }

  private say(s: string, bad = false) {
    this.msg.set(s);
    this.bad.set(bad);
  }

  private finish(s: string) {
    this.say(s);
    this.clearPassword();
    this.done.set(true);
    this.closeEl().nativeElement.focus();
  }
}
