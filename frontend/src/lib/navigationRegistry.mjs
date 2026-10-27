export const CORE_NAVIGATION = Object.freeze([
 {key:'territorial-explorer',label:'Explorador Territorial',group:'BACKSTAGE'},
 {key:'feed',label:'Feed',group:'BACKSTAGE'},
 {key:'profile',label:'Cuenta',group:'BACKSTAGE'},
 {key:'organization-settings',label:'Organización',group:'BACKSTAGE'},
]);
export const isExplorerPage = page => !['feed','profile','organization-settings'].includes(page);
export const primaryPage = page => isExplorerPage(page) ? 'territorial-explorer' : page;
export function selectedPage(search) { return new URLSearchParams(search).get('page') || 'territorial-explorer'; }
