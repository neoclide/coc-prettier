const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('esbuild');

function load(entry, coc = {}, mocks = {}) {
  const output = buildSync({ entryPoints: [path.join(__dirname, '..', 'src', entry)], bundle: true,
    platform: 'node', format: 'cjs', write: false, external: ['coc.nvim', 'prettier'] }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, process, console, __dirname, Buffer,
    require: id => id === 'coc.nvim' ? coc : mocks[id] || require(id) });
  return module.exports;
}

function setup() {
  const watchers = [];
  let clears = 0;
  const coc = {
    Range: { create: (start, end) => ({ start, end }) },
    TextEdit: { replace: (range, newText) => ({ range, newText }) },
    Uri: { parse: uri => ({ fsPath: uri }), file: fsPath => ({ fsPath }) },
    workspace: {
      createFileSystemWatcher: pattern => {
        const watcher = { pattern, onDidChange(fn) { this.change = fn; }, onDidCreate(fn) { this.create = fn; },
          onDidDelete(fn) { this.delete = fn; }, dispose() { this.disposed = true; } };
        watchers.push(watcher);
        return watcher;
      },
      onDidChangeConfiguration: () => ({ dispose() {} }),
      getWorkspaceFolder: () => ({ uri: '/workspace' }),
    },
    languages: {
      registerDocumentRangeFormatProvider: () => ({ dispose() {} }),
      registerDocumentFormatProvider: () => ({ dispose() {} }),
    },
    window: { onDidChangeActiveTextEditor: () => ({ dispose() {} }) },
  };
  const Service = load('PrettierEditService.ts', coc).default;
  const service = new Service({ clearModuleCache: async () => { clears++; } },
    { logInfo() {}, logDebug() {}, logError() {} }, { update() {}, hide() {} }, 9);
  return { service, watchers, getClears: () => clears };
}

function document(text) {
  return { getText: () => text, positionAt: offset => ({ line: 0, character: offset }) };
}

test('already formatted LF and CRLF documents return no edits, including forced formatting', async () => {
  const { service } = setup();
  for (const text of ['const x = 1;\n', 'const x = 1;\r\n', '# Heading\n\n']) {
    service.format = async () => text;
    const edits = await service.provideEdits(document(text), { force: true });
    assert.equal(edits.length, 0);
  }
});

test('changed documents still receive a minimal edit', async () => {
  const { service } = setup();
  service.format = async () => 'let x = 1;\n';
  const edits = await service.provideEdits(document('let x=1;\n'), { force: false });
  assert.equal(edits.length, 1);
  const edit = edits[0];
  assert.equal('let x=1;\n'.slice(0, edit.range.start.character) + edit.newText +
    'let x=1;\n'.slice(edit.range.end.character), 'let x = 1;\n');
});

test('ignore and TypeScript config changes clear cache and all watchers are disposable', async () => {
  const { service, watchers, getClears } = setup();
  const disposables = service.registerDisposables();
  const ignore = watchers.find(watcher => watcher.pattern === '**/.prettierignore');
  assert.ok(ignore);
  for (const event of ['change', 'create', 'delete']) await ignore[event]({ fsPath: '/workspace/.prettierignore' });
  assert.equal(getClears(), 3);
  const config = watchers.find(watcher => watcher.pattern.includes('.prettierrc.ts'));
  assert.ok(config.pattern.includes('prettier.config.cts'));
  assert.ok(config.pattern.includes('prettier.config.mts'));
  await config.change({ fsPath: '/workspace/prettier.config.ts' });
  assert.equal(getClears(), 4);
  disposables.forEach(disposable => disposable.dispose());
  assert.ok(watchers.every(watcher => watcher.disposed));
});

test('file URI plugins bypass package resolution while relative and absolute plugins remain unchanged', () => {
  const { resolveConfigPlugins } = load('ModuleLoader.ts');
  const plugins = ['file:///tmp/plugin.mjs', './plugin.cjs', '/tmp/plugin.cjs'];
  assert.deepEqual(resolveConfigPlugins({ plugins }, '/workspace/index.ts').plugins, plugins);
});

test('cache invalidation waits for local modules and clears cached ignore/package resolution', async () => {
  let released;
  const cleared = new Promise(resolve => { released = resolve; });
  const { ModuleResolver } = load('ModuleResolver.ts', {}, {
    worker_threads: { Worker: class { on() {} } },
    prettier: { clearConfigCache: async () => {} },
  });
  const resolver = new ModuleResolver({ logError() {} });
  resolver.ignorePathCache.set('file', 'ignore');
  resolver.findPkgCache.set('file', 'package');
  resolver.path2Module.set('prettier', { clearConfigCache: () => cleared });
  let done = false;
  const pending = resolver.clearModuleCache().then(() => { done = true; });
  await Promise.resolve();
  assert.equal(done, false);
  released();
  await pending;
  assert.equal(resolver.ignorePathCache.size, 0);
  assert.equal(resolver.findPkgCache.size, 0);
  assert.equal(resolver.path2Module.size, 1);
});

test('dispose logs cache failures and releases module references', async () => {
  const errors = [];
  const { ModuleResolver } = load('ModuleResolver.ts', {}, {
    worker_threads: { Worker: class { on() {} } },
    prettier: { clearConfigCache: async () => {} },
  });
  const resolver = new ModuleResolver({ logError: (...args) => errors.push(args) });
  resolver.path2Module.set('broken', { clearConfigCache: async () => { throw new Error('cache failure'); } });
  await assert.doesNotReject(resolver.dispose());
  assert.equal(resolver.path2Module.size, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1].message, 'cache failure');
});

test('worker starts lazily, terminates on disposal, and can start again', async () => {
  let starts = 0;
  let stops = 0;
  class Worker { constructor() { starts++; } on() {} async terminate() { stops++; } }
  const { PrettierWorkerInstance, disposeWorker } = load('PrettierWorkerInstance.ts', {}, { worker_threads: { Worker } });
  assert.equal(starts, 0);
  new PrettierWorkerInstance('/first');
  new PrettierWorkerInstance('/second');
  assert.equal(starts, 1);
  await disposeWorker();
  assert.equal(stops, 1);
  new PrettierWorkerInstance('/third');
  assert.equal(starts, 2);
  await disposeWorker();
  assert.equal(stops, 2);
});

test('re-registering formatters does not dispose an active module resolver', () => {
  const { service } = setup();
  service.moduleResolver.dispose = () => assert.fail('active resolver disposed');
  service.registerDocumentFormatEditorProviders({ languageSelector: [], rangeLanguageSelector: [] });
  service.registerDocumentFormatEditorProviders({ languageSelector: [], rangeLanguageSelector: [] });
});


test('config cache failures still invalidate formatter registration', async () => {
  const { service, watchers } = setup();
  service.moduleResolver.clearModuleCache = async () => { throw new Error('cache failure'); };
  service.registeredWorkspaces.add('/workspace');
  const errors = [];
  service.loggingService.logError = (...args) => errors.push(args);
  service.registerDisposables();
  const config = watchers.find(watcher => watcher.pattern.includes('.prettierrc.ts'));
  await assert.doesNotReject(config.change({ fsPath: '/workspace/prettier.config.ts' }));
  assert.equal(service.registeredWorkspaces.has('/workspace'), false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1].message, 'cache failure');
});


test('worker termination rejects pending calls and permits a fresh worker', async () => {
  const { EventEmitter } = require('node:events');
  const workers = [];
  class Worker extends EventEmitter {
    constructor() { super(); workers.push(this); }
    postMessage(message) { this.lastMessage = message; }
    async terminate() { this.emit('exit', 1); return 1; }
  }
  const { PrettierWorkerInstance, disposeWorker } = load('PrettierWorkerInstance.ts', {}, { worker_threads: { Worker } });
  const first = new PrettierWorkerInstance('/first');
  const second = new PrettierWorkerInstance('/second');
  const pending = [first.import(), first.format('source'), second.resolveConfig('/file')];
  const rejected = pending.map(promise => assert.rejects(promise, /Prettier worker exited/));
  await disposeWorker();
  await Promise.all(rejected);
  assert.equal(first.messageResolvers.size, 0);
  assert.equal(second.messageResolvers.size, 0);
  await assert.rejects(first.format('later'), /Prettier worker exited/);
  await assert.rejects(first.import(), /Prettier worker exited/);
  const third = new PrettierWorkerInstance('/third');
  assert.equal(workers.length, 2);
  const formatted = third.format('new');
  workers[1].emit('message', { type: 'callMethod', id: workers[1].lastMessage.id, payload: { result: 'new\n' } });
  assert.equal(await formatted, 'new\n');
  await disposeWorker();
});

test('worker errors reject pending calls and unexpected exit permits restart', async () => {
  const { EventEmitter } = require('node:events');
  const workers = [];
  class Worker extends EventEmitter {
    constructor() { super(); workers.push(this); }
    postMessage() {}
    async terminate() { this.emit('exit', 1); }
  }
  const { PrettierWorkerInstance, disposeWorker } = load('PrettierWorkerInstance.ts', {}, { worker_threads: { Worker } });
  const instance = new PrettierWorkerInstance('/first');
  const rejected = assert.rejects(instance.clearConfigCache(), /worker failed/);
  workers[0].emit('error', new Error('worker failed'));
  await rejected;
  assert.equal(instance.messageResolvers.size, 0);
  workers[0].emit('exit', 1);
  new PrettierWorkerInstance('/second');
  assert.equal(workers.length, 2);
  await disposeWorker();
});
