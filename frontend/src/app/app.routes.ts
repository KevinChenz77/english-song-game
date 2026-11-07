import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { KidsStore } from './core/kids-store';
import { SongCatalog } from './core/song-catalog';
import { KidPicker } from './features/kids/kid-picker';
import { SongList } from './features/songs/song-list';

/** kid 不存在 → 回首頁。 */
const kidGuard: CanActivateFn = (route) => {
  const id = Number(route.paramMap.get('kidId'));
  return (Number.isFinite(id) && !!inject(KidsStore).byId(id)) || inject(Router).parseUrl('/');
};

/** 歌不在 index.json（或清單讀不到）→ 回選歌。 */
const songGuard: CanActivateFn = async (route) => {
  const back = inject(Router).parseUrl(`/kids/${route.paramMap.get('kidId')}`);
  const ids = await inject(SongCatalog)
    .ids()
    .catch((): string[] => []);
  return ids.includes(route.paramMap.get('songId') ?? '') || back;
};

export const routes: Routes = [
  { path: '', component: KidPicker },
  { path: 'help', loadComponent: () => import('./features/help/help').then((m) => m.Help) },
  { path: 'kids/:kidId', component: SongList, canActivate: [kidGuard] },
  {
    path: 'kids/:kidId/play/:songId',
    loadComponent: () => import('./features/play/play').then((m) => m.Play),
    canActivate: [kidGuard, songGuard],
  },
  { path: '**', redirectTo: '' },
];
