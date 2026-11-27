import { Routes } from '@angular/router';
import { HomePage } from './pages/home-page';
import { WizardPage } from './pages/wizard-page';
import { ResultPage } from './pages/result-page';
import { AdvancedPage } from './pages/advanced-page';
import { DxfNestPage } from './pages/dxf-nest-page';

export const routes: Routes = [
  // trang đầu: chọn Wizard View / Detail View (?chon=1 để luôn hiện)
  { path: '', pathMatch: 'full', component: HomePage, title: 'Tủ Điện Builder — Xuân Thành' },
  { path: 'cau-hinh/:id', component: WizardPage, title: 'Wizard View — Tủ Điện Builder' },
  { path: 'don-hang/:id', component: ResultPage, title: 'Kết quả đơn hàng — Xuân Thành' },
  { path: 'nang-cao/:id', component: AdvancedPage, title: 'Detail View — Tủ Điện Builder' },
  { path: 'sap-ton-dxf', component: DxfNestPage, title: 'Sắp tôn từ DXF — Xuân Thành' },
  { path: '**', redirectTo: '' },
];
