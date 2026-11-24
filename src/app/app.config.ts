import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { CatalogService } from './core/catalog.service';
import { ProjectStore } from './core/project.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Nạp thư viện JSON rồi mở dự án gần nhất trước khi hiển thị app.
    // Muốn dùng Firestore: thêm { provide: PROJECT_REPOSITORY, useClass: FirestoreProjectRepository }.
    provideAppInitializer(() => {
      // inject() phải gọi đồng bộ trong injection context, trước mọi await
      const catalog = inject(CatalogService);
      const store = inject(ProjectStore);
      return catalog.load().then(() => store.init());
    }),
  ],
};
