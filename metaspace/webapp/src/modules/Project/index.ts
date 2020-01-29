export { default as EditProjectPage } from './ProjectSettings.vue'
export { default as ViewProjectPage } from './ViewProjectPage.vue'
// TODO: Figure out a way to allow this module to be correctly split across bundles
// Currently MetadataEditor's direct import of CreateProjectDialog is inadvertently bringing EditProjectPage and ViewProjectPage into the bundle
export { default as CreateProjectDialog } from './CreateProjectDialog.vue'
