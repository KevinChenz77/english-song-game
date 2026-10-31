import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { APP_CONFIG, checkConfig } from './app/core/app-config';

const fail = (msg: string) => (e: unknown) => {
  document.body.textContent = msg;
  console.error(e);
};

fetch('config.json', { cache: 'no-store' })
  .then((r) => {
    if (!r.ok) throw new Error(`config.json ${r.status}`);
    return r.json();
  })
  .then(checkConfig)
  .then(
    (cfg) =>
      bootstrapApplication(App, {
        ...appConfig,
        providers: [...appConfig.providers, { provide: APP_CONFIG, useValue: cfg }],
      }).catch(fail('程式啟動失敗，請重新整理，還是不行請聯絡管理者。')),
    fail('設定檔讀不到，請重新整理或聯絡管理者。'),
  );
