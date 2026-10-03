const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('esbuild');

function load(entry, coc = {}, mocks = {}) {
  const output = buildSync({ entryPoints: [path.join(__dirname, '..', 'src', entry)], bundle: true,
    platform: 'node', format: 'cjs', write: false, external: ['coc.nvim', 'prettier'] }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, process, console, __dirname, Buffer, setTimeout, clearTimeout,
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

test('overlapping resolver disposal preserves the replacement resolver worker and cached instance', async () => {
  const { EventEmitter } = require('node:events');
  const workers = [];
  let releaseCache;
  let cacheStarted;
  const cachePending = new Promise(resolve => { releaseCache = resolve; });
  const cacheClearing = new Promise(resolve => { cacheStarted = resolve; });
  class Worker extends EventEmitter {
    constructor() { super(); this.stops = 0; workers.push(this); }
    postMessage({ type, id, payload }) {
      const reply = result => this.emit('message', { type, id, payload: result });
      if (type === 'import') {
        queueMicrotask(() => reply({ version: '3.1.1' }));
      } else if (payload.methodName === 'clearConfigCache' && this === workers[0]) {
        cacheStarted();
        cachePending.then(() => reply({ result: undefined }));
      } else {
        queueMicrotask(() => reply({ result: payload.methodName === 'format' ? 'formatted\n' : undefined }));
      }
    }
    async terminate() { this.stops++; this.emit('exit', 1); return 1; }
  }
  const modulePath = require.resolve('prettier');
  const fileName = path.join(__dirname, 'fixture.js');
  const coc = {
    Uri: { file: fsPath => ({ fsPath }), parse: uri => ({ fsPath: uri }) },
    workspace: {
      workspaceFolders: [{ uri: __dirname }],
      getWorkspaceFolder: () => ({ uri: __dirname }),
      getConfiguration: () => ({ prettierPath: modulePath }),
    },
  };
  const errors = [];
  const { ModuleResolver } = load('ModuleResolver.ts', coc, {
    worker_threads: { Worker },
    prettier: { clearConfigCache: async () => {} },
  });
  const logger = { logDebug() {}, logInfo() {}, logError: (...args) => errors.push(args) };
  const previous = new ModuleResolver(logger);
  const replacement = new ModuleResolver(logger);
  await previous.getPrettierInstance(fileName);
  const disposing = previous.dispose();
  try {
    await cacheClearing;
    assert.equal(workers[0].stops, 0, 'cache cleanup precedes termination');
    const instance = await replacement.getPrettierInstance(fileName);
    assert.equal(await instance.format('before'), 'formatted\n');
    assert.equal(previous.dispose(), disposing, 'overlapping disposal reuses the pending cleanup');
    releaseCache();
    await disposing;
    assert.equal(workers[0].stops, 1);
    assert.equal(await replacement.getPrettierInstance(fileName), instance, 'the cached instance remains usable');
    assert.equal(await instance.format('after'), 'formatted\n');
    await previous.dispose();
    assert.equal(await instance.format('after repeated old disposal'), 'formatted\n');
    assert.equal(workers.length, 2);
    assert.equal(workers[1].stops, 0);
    assert.equal(errors.length, 0);
  } finally {
    releaseCache();
    await disposing;
    await replacement.dispose();
  }
  assert.equal(workers[1].stops, 1);
});

test('cleanup without an existing worker does not terminate a worker started later', async () => {
  const { EventEmitter } = require('node:events');
  let stops = 0;
  class Worker extends EventEmitter {
    postMessage({ type, id }) {
      queueMicrotask(() => this.emit('message', { type, id, payload: { result: 'formatted\n' } }));
    }
    async terminate() { stops++; this.emit('exit', 1); return 1; }
  }
  const { PrettierWorkerInstance, disposeWorker } = load('PrettierWorkerInstance.ts', {}, { worker_threads: { Worker } });
  let releaseCache;
  const cachePending = new Promise(resolve => { releaseCache = resolve; });
  const disposing = disposeWorker(() => cachePending);
  const instance = new PrettierWorkerInstance('/replacement');
  releaseCache();
  await disposing;
  assert.equal(stops, 0);
  assert.equal(await instance.format('after'), 'formatted\n');
  await disposeWorker();
  assert.equal(stops, 1);
});

function setupModuleResolver({ config = {}, commands = {}, mocks = {} } = {}) {
  const { EventEmitter } = require('node:events');
  const workers = [];
  class Worker extends EventEmitter {
    constructor() { super(); workers.push(this); }
    postMessage({ type, id, payload }) {
      if (payload.methodName === 'format' && payload.methodArgs[0] === 'pending') return;
      queueMicrotask(() => this.emit('message', { type, id, payload: type === 'import'
        ? { version: '3.1.1' } : { result: payload.methodName === 'format' ? 'formatted\n' : undefined } }));
    }
    async terminate() { this.emit('exit', 1); return 1; }
  }
  const coc = {
    commands,
    Uri: { file: fsPath => ({ fsPath }), parse: uri => ({ fsPath: uri }) },
    workspace: {
      workspaceFolders: [{ uri: __dirname }],
      getWorkspaceFolder: () => ({ uri: __dirname }),
      getConfiguration: () => config,
    },
  };
  const { ModuleResolver } = load('ModuleResolver.ts', coc, {
    worker_threads: { Worker }, prettier: { clearConfigCache: async () => {} }, ...mocks,
  });
  const errors = [];
  const resolver = new ModuleResolver({ logDebug() {}, logInfo() {}, logError: (...args) => errors.push(args) });
  const modulePath = require.resolve('prettier');
  const fileName = path.join(__dirname, 'fixture.js');
  resolver.findPkgCache.set(`${fileName}:prettier`, modulePath);
  return { resolver, workers, errors, modulePath, fileName };
}

for (const event of ['exit', 'error']) {
  test(`resolver replaces a stopped cached worker instance after ${event}`, async () => {
    const { resolver, workers, modulePath, fileName } = setupModuleResolver();
    try {
      const stopped = await resolver.getPrettierInstance(fileName);
      assert.equal(await stopped.format('before'), 'formatted\n');
      const rejected = assert.rejects(stopped.format('pending'), /worker (exited|failed)/);
      workers[0].emit(event, event === 'exit' ? 1 : new Error('worker failed'));
      await rejected;
      const replacement = await resolver.getPrettierInstance(fileName);
      assert.notEqual(replacement, stopped);
      assert.equal(resolver.findPkgCache.get(`${fileName}:prettier`), modulePath);
      assert.equal(workers.length, 2);
      assert.equal(await replacement.format('after'), 'formatted\n');
      // An error can be followed by exit after the replacement is already active.
      if (event === 'error') workers[0].emit('exit', 1);
      assert.equal(await resolver.getPrettierInstance(fileName), replacement);
      assert.equal(await replacement.format('cached'), 'formatted\n');
    } finally {
      await resolver.dispose();
    }
  });
}

test('cache cleanup evicts stopped worker instances without recreating them', async () => {
  const { resolver, workers, fileName } = setupModuleResolver();
  await resolver.getPrettierInstance(fileName);
  workers[0].emit('exit', 1);
  await assert.doesNotReject(resolver.clearModuleCache());
  assert.equal(resolver.path2Module.size, 0);
  assert.equal(workers.length, 1);
  await resolver.dispose();
});

test('disposed resolvers do not resurrect stopped workers during or after cleanup', async () => {
  let releaseCache;
  const cachePending = new Promise(resolve => { releaseCache = resolve; });
  const { resolver, workers, fileName } = setupModuleResolver({
    mocks: { prettier: { clearConfigCache: () => cachePending } },
  });
  await resolver.getPrettierInstance(fileName);
  workers[0].emit('exit', 1);
  const disposing = resolver.dispose();
  try {
    assert.equal(await resolver.getPrettierInstance(fileName), undefined);
    assert.equal(workers.length, 1);
  } finally {
    releaseCache();
    await disposing;
  }
  assert.equal(await resolver.getPrettierInstance(fileName), undefined);
  assert.equal(workers.length, 1);
});

test('pending global module resolution cannot create a worker after disposal', async () => {
  let resolvePackageManager;
  const packageManager = new Promise(resolve => { resolvePackageManager = resolve; });
  const { resolver, workers, fileName } = setupModuleResolver({
    config: { resolveGlobalModules: true },
    commands: { executeCommand: () => packageManager },
    mocks: { child_process: { execSync: () => path.join(__dirname, '..', 'node_modules') } },
  });
  resolver.findPkg = () => undefined;
  const resolving = resolver.getPrettierInstance(fileName);
  await resolver.dispose();
  resolvePackageManager('pnpm');
  assert.equal(await resolving, undefined);
  assert.equal(workers.length, 0);
});

test('Prettier 2 instances remain cached and usable across cache clearing', async () => {
  const modulePath = require.resolve('prettier');
  let clears = 0;
  const prettier = { version: '2.8.8', format: () => 'prettier2\n', clearConfigCache: () => { clears++; } };
  const { resolver, workers, fileName } = setupModuleResolver({
    mocks: { [modulePath]: prettier, [require.resolve('prettier/package.json')]: { version: '2.8.8' } },
  });
  const instance = await resolver.getPrettierInstance(fileName);
  await resolver.clearModuleCache();
  assert.equal(await resolver.getPrettierInstance(fileName), instance);
  assert.equal(await instance.format('source'), 'prettier2\n');
  assert.equal(clears, 1);
  assert.equal(workers.length, 0);
  await resolver.dispose();
});

test('disposal terminates a real worker even when its cache cleanup never settles', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const { Worker: RealWorker } = require('node:worker_threads');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prettier-stuck-cache-'));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: '3.1.1', main: 'index.cjs' }));
  fs.writeFileSync(path.join(directory, 'index.cjs'), `
    exports.version = '3.1.1';
    exports.format = source => source === 'pending' ? new Promise(() => {}) : 'formatted\\n';
    exports.clearConfigCache = () => new Promise(() => {});
  `);
  const workers = [];
  let terminations = 0;
  class Worker extends RealWorker {
    constructor(...args) { super(...args); workers.push(this); }
    terminate() { terminations++; return super.terminate(); }
  }
  const { resolver, errors, fileName } = setupModuleResolver({
    config: { prettierPath: directory }, mocks: { worker_threads: { Worker } },
  });
  let deadline;
  try {
    const instance = await resolver.getPrettierInstance(fileName);
    assert.equal(await instance.format('before'), 'formatted\n');
    const rejected = assert.rejects(instance.format('pending'), /Prettier worker exited/);
    const disposed = await Promise.race([
      resolver.dispose().then(() => true),
      new Promise(resolve => { deadline = setTimeout(() => resolve(false), 3000); }),
    ]);
    assert.equal(disposed, true, 'disposal must not wait indefinitely for worker cache cleanup');
    await rejected;
    assert.equal(terminations, 1);
    assert.equal(resolver.path2Module.size, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0][1].message, /Timed out clearing Prettier module cache/);
  } finally {
    clearTimeout(deadline);
    await Promise.all(workers.map(worker => worker.terminate()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('disposal releases cached modules when bundled cleanup stalls and handles its late rejection', async () => {
  let rejectCache;
  const cachePending = new Promise((_, reject) => { rejectCache = reject; });
  const { resolver, fileName, errors } = setupModuleResolver({
    mocks: { prettier: { clearConfigCache: () => cachePending } },
  });
  const instance = await resolver.getPrettierInstance(fileName);
  let deadline;
  try {
    const disposed = await Promise.race([
      resolver.dispose().then(() => true),
      new Promise(resolve => { deadline = setTimeout(() => resolve(false), 3000); }),
    ]);
    assert.equal(disposed, true);
    assert.equal(instance.isStopped, true);
    assert.equal(resolver.path2Module.size, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0][1].message, /Timed out clearing Prettier module cache/);
    rejectCache(new Error('late cache cleanup rejection'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(errors.length, 1);
  } finally {
    clearTimeout(deadline);
  }
});
