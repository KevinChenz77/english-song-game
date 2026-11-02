import { Component, ElementRef, Injector, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KidsStore } from '../../core/kids-store';
import { Kid } from '../../core/models/kid.model';
import { AVATARS } from '../../core/game/avatars';
import { starCount } from '../../core/game/reward-rules';
import { Cloud } from '../cloud/cloud-dialog';

/** 選小朋友：卡片、✕ 刪除、新增表單＋頭像、❓ 說明、📥 匯入。 */
@Component({
  imports: [RouterLink],
  selector: 'app-kid-picker',
  templateUrl: './kid-picker.html',
  styleUrl: './kid-picker.css',
})
export class KidPicker {
  protected readonly store = inject(KidsStore);
  protected readonly cloud = inject(Cloud);
  private readonly injector = inject(Injector);
  protected readonly avatars = AVATARS;
  protected readonly adding = signal(false);
  protected readonly avatar = signal(AVATARS[0]);
  protected readonly nameMsg = signal('');
  private readonly nameEl = viewChild<ElementRef<HTMLInputElement>>('name');
  private readonly addBtn = viewChild.required<ElementRef<HTMLButtonElement>>('addBtn');

  /** 卡片上的星星：這位小朋友所有歌的星星數加總。 */
  protected stars(k: Kid) {
    return Object.values(k.songs).reduce((n, p) => n + starCount(p), 0);
  }

  protected remove(k: Kid) {
    if (confirm(`要刪除 ${k.name} 的存檔嗎？`)) this.store.remove(k.id);
  }

  protected open() {
    this.adding.set(true);
    this.nameMsg.set('');
    afterNextRender(() => this.nameEl()?.nativeElement.focus(), { injector: this.injector });
  }

  protected add(input: HTMLInputElement) {
    // KidsStore.add() 用 nameOk()：去空白後 1～10 字
    if (!this.store.add(input.value, this.avatar())) {
      this.nameMsg.set('名字要 1～10 個字');
      return input.focus();
    }
    this.cancel();
  }

  protected cancel() {
    this.adding.set(false);
    this.addBtn().nativeElement.focus();
  }
}
