import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KidsStore } from '../../core/kids-store';
import { AVATARS } from '../../core/game/avatars';

/** 選小朋友（佔位：第二波做卡片、刪除、頭像選擇、📥 匯入）。 */
@Component({
  imports: [RouterLink],
  selector: 'app-kid-picker',
  templateUrl: './kid-picker.html',
})
export class KidPicker {
  protected readonly store = inject(KidsStore);

  protected add(input: HTMLInputElement) {
    if (this.store.add(input.value, AVATARS[0])) input.value = '';
    else input.focus();
  }
}
