import { lazy } from 'react';
import manifests from '../../../shared/modules.json';
const components = Object.freeze({
 soi: lazy(() => import('../pages/SoiWorkspace')),
 'soi-routes': lazy(() => import('../pages/SoiRoutes')),
 'clean-com': lazy(() => import('../pages/CleanCom')),
});
export const MODULE_NAVIGATION = manifests.modules.flatMap(module => module.pages.map(page => ({ ...page, group:'Módulos', moduleId:module.id, readRoles:module.readRoles })));
export function modulePage(key) { return components[key] || null; }
