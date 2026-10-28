// Preload: the ONLY bridge between renderer and main. Context isolation is
// on and nodeIntegration is off; the renderer gets a small typed API and
// nothing else. No filesystem, no shell, no raw Node access.
import { contextBridge, ipcRenderer } from 'electron';
import type { TelemetryApi } from '../shared/types';

async function call<T>(channel: string, args?: unknown): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, args)) as
    | { ok: true; data: T }
    | { ok: false; error: string };
  if (!res.ok) throw new Error(res.error || 'Request failed.');
  return res.data;
}

const api: TelemetryApi = {
  tracking: {
    getStatus: () => call('tracking:getStatus'),
    start: () => call('tracking:start'),
    pause: () => call('tracking:pause'),
    resume: () => call('tracking:resume'),
    stop: () => call('tracking:stop'),
  },
  activity: {
    getSummary: (range) => call('activity:getSummary', range),
    getTimeline: (args) => call('activity:getTimeline', args),
    getSessions: (args) => call('activity:getSessions', args),
    updateSession: (args) => call('activity:updateSession', args),
    deleteSession: (args) => call('activity:deleteSession', args),
    mergeSessions: (args) => call('activity:mergeSessions', args),
    splitSession: (args) => call('activity:splitSession', args),
    createManualSession: (args) => call('activity:createManualSession', args),
    getHourly: (range) => call('activity:getHourly', range),
    getWeekday: (range) => call('activity:getWeekday', range),
    getHeatmap: (range) => call('activity:getHeatmap', range),
  },
  applications: {
    list: (args) => call('applications:list', args),
    get: (args) => call('applications:get', args),
    setCategory: (args) => call('applications:setCategory', args),
    setExcluded: (args) => call('applications:setExcluded', args),
    createRule: (args) => call('applications:createRule', args),
    listRules: () => call('applications:listRules'),
  },
  projects: {
    list: (args) => call('projects:list', args),
    create: (args) => call('projects:create', args),
    update: (args) => call('projects:update', args),
    setArchived: (args) => call('projects:setArchived', args),
    remove: (args) => call('projects:remove', args),
    linkRepo: (args) => call('projects:linkRepo', args),
    unlinkRepo: (args) => call('projects:unlinkRepo', args),
    stats: (args) => call('projects:stats', args),
  },
  repos: {
    list: () => call('repos:list'),
    add: (args) => call('repos:add', args),
    remove: (args) => call('repos:remove', args),
    setEnabled: (args) => call('repos:setEnabled', args),
    scan: (args) => call('repos:scan', args),
    scanAll: () => call('repos:scanAll'),
    discover: (args) => call('repos:discover', args),
    commits: (args) => call('repos:commits', args),
    languages: (args) => call('repos:languages', args),
    pickFolder: () => call('repos:pickFolder'),
  },
  focus: {
    current: () => call('focus:current'),
    start: (args) => call('focus:start', args),
    stop: (args) => call('focus:stop', args),
    history: (args) => call('focus:history', args),
    stats: (args) => call('focus:stats', args),
  },
  goals: {
    list: () => call('goals:list'),
    create: (args) => call('goals:create', args),
    remove: (args) => call('goals:remove', args),
    progress: (args) => call('goals:progress', args),
  },
  insights: {
    generate: (args) => call('insights:generate', args),
    list: () => call('insights:list'),
    dismiss: (args) => call('insights:dismiss', args),
  },
  reports: {
    build: (args) => call('reports:build', args),
    exportCsv: (args) => call('reports:exportCsv', args),
    exportJson: (args) => call('reports:exportJson', args),
    exportHtml: (args) => call('reports:exportHtml', args),
    saveFile: (args) => call('reports:saveFile', args),
    exportPdf: (args) => call('reports:exportPdf', args),
  },
  data: {
    info: () => call('data:info'),
    backup: () => call('data:backup'),
    restore: (args) => call('data:restore', args),
    validateBackup: (args) => call('data:validateBackup', args),
    integrity: () => call('data:integrity'),
    maintenance: () => call('data:maintenance'),
    deleteRange: (args) => call('data:deleteRange', args),
    deleteAll: () => call('data:deleteAll'),
    pickFile: () => call('data:pickFile'),
  },
  settings: {
    get: () => call('settings:get'),
    update: (args) => call('settings:update', args),
    resetDefaults: () => call('settings:resetDefaults'),
  },
  integrations: {
    list: () => call('integrations:list'),
    setLocalApi: (args) => call('integrations:setLocalApi', args),
    getLocalApiToken: () => call('integrations:getLocalApiToken'),
    rotateLocalApiToken: () => call('integrations:rotateLocalApiToken'),
    listPlugins: () => call('integrations:listPlugins'),
    setPlugin: (args) => call('integrations:setPlugin', args),
  },
  system: {
    openDashboard: () => call('system:openDashboard'),
    notifyTest: () => call('system:notifyTest'),
  },
};

contextBridge.exposeInMainWorld('telemetry', api);
