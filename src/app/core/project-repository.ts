import { InjectionToken } from '@angular/core';
import { CabinetType, Project } from '../geometry';

export interface ProjectSummary {
  id: string;
  name: string;
  orderCode: string;
  customer: string;
  cabinetType: CabinetType;
  updatedAt: string;
}

/**
 * Kho lưu dự án. Bản demo dùng localStorage; sau này thay bằng FirestoreProjectRepository
 * (collection `projects/{id}`) mà không phải sửa UI — chỉ đổi provider trong app.config.ts.
 */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<Project | null>;
  save(p: Project): Promise<void>;
  remove(id: string): Promise<void>;
  getLastOpenedId(): string | null;
  setLastOpenedId(id: string): void;
}

const INDEX_KEY = 'tdb.projects';
const LAST_KEY = 'tdb.last';
const itemKey = (id: string): string => `tdb.project.${id}`;

export class LocalStorageProjectRepository implements ProjectRepository {
  private readIndex(): ProjectSummary[] {
    try {
      return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as ProjectSummary[];
    } catch {
      return [];
    }
  }

  private writeIndex(list: ProjectSummary[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  }

  async list(): Promise<ProjectSummary[]> {
    return this.readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<Project | null> {
    try {
      const raw = localStorage.getItem(itemKey(id));
      return raw ? (JSON.parse(raw) as Project) : null;
    } catch {
      return null;
    }
  }

  async save(p: Project): Promise<void> {
    localStorage.setItem(itemKey(p.id), JSON.stringify(p));
    const idx = this.readIndex().filter((x) => x.id !== p.id);
    idx.push({ id: p.id, name: p.name, orderCode: p.orderCode, customer: p.customer, cabinetType: p.cabinetType, updatedAt: p.updatedAt });
    this.writeIndex(idx);
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(itemKey(id));
    this.writeIndex(this.readIndex().filter((x) => x.id !== id));
  }

  getLastOpenedId(): string | null {
    try {
      return localStorage.getItem(LAST_KEY);
    } catch {
      return null;
    }
  }

  setLastOpenedId(id: string): void {
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      /* bỏ qua khi trình duyệt chặn storage */
    }
  }
}

export const PROJECT_REPOSITORY = new InjectionToken<ProjectRepository>('PROJECT_REPOSITORY', {
  providedIn: 'root',
  factory: () => new LocalStorageProjectRepository(),
});
