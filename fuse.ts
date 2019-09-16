import { argv } from 'yargs'
import { fusebox, sparky, pluginReplace, pluginAngular, pluginCSS, pluginConsolidate } from 'fuse-box'
import { ngc, ngcWatch } from './tools/scripts/ngc.spawn'
import { IMaybe, maybe } from 'typescript-monads'
import { ServerLauncher } from 'fuse-box/user-handler/ServerLauncher'
import { ChildProcess, spawnSync, spawn } from 'child_process'
import { compressStatic } from './tools/scripts/compress'
import { minify } from 'terser'
import { UserHandler } from 'fuse-box/user-handler/UserHandler'
import { IFuseLoggerProps } from 'fuse-box/config/IFuseLoggerProps'
import { pluginAngularAot } from './tools/plugins/lazy-aot'
import { run } from 'cypress'
import * as packageJson from './package.json'

const argToBool = (arg: string) => argv[arg] ? true : false

class BuildContext {
  minify = argToBool('minify')
  lint = argToBool('lint')
  aot = argToBool('aot')
  prod = argToBool('prod')
  serve = argToBool('serve')
  watch = argToBool('watch')
  pwa = argToBool('pwa')
  e2e = argToBool('e2e')
  electron = argToBool('electron')
  ngcProcess: IMaybe<ChildProcess> = maybe()
  serverRef: IMaybe<ServerLauncher> = maybe()
  setServerRef(val?: ServerLauncher) {
    this.serverRef = maybe(val)
  }
  killNgc = () => this.ngcProcess.tapSome(ref => ref.kill())
  killServer = () => this.serverRef.tapSome(ref => {
    ref.kill()
    this.setServerRef()
  })
  devServerPort = 4200
  ngServerPort = 4201
  shared = {
    watch: this.watch ? { ignored: ['cypress/integration'] } : false,
    turboMode: true,
    logging: { level: 'disabled' } as IFuseLoggerProps,
    cache: { enabled: true, FTL: !this.e2e && this.watch, root: '.fusebox' },
    plugins: [
      ...this.aot ? [] : [
        pluginAngular('*.component.ts'),
        pluginCSS('*.component.css', { asText: true })
      ],
      pluginReplace(/fusing.module.(ts|js)/, {
        "__APP_VERSION__": packageJson.version,
        "__NODE_DEBUG__": `${process.env.NODE_DEBUG}`
      }),
    ]
  }
  fusebox = {
    server: fusebox({
      target: 'server',
      entry: this.aot ? 'ngc/server/server.js' : 'src/server/server.ts',
      devServer: false,
      dependencies: this.prod
        ? { ignorePackages: packageJson.fuse.server, ignoreAllExternal: false }
        : {},
      ...this.shared,
      plugins: this.shared.plugins
    }),
    browser: fusebox({
      target: 'browser',
      output: 'dist/wwwroot/assets/js',
      entry: this.aot
        ? this.prod ? 'ngc/browser/main.aot.prod.js' : 'ngc/browser/main.aot.js'
        : this.prod ? 'src/browser/main.prod.ts' : 'src/browser/main.ts',
      webIndex: { template: 'src/browser/index.pug', distFileName: '../../index.html', publicPath: 'assets/js' },
      dependencies: { ignorePackages: packageJson.fuse.browser },
      hmr: !this.e2e && this.watch,
      devServer: !this.serve ? false : {
        hmrServer: !this.e2e && this.watch ? { port: this.devServerPort } : false,
        httpServer: this.watch ? { port: this.devServerPort } : false,
        proxy: !this.watch ? [] : [
          {
            path: "/",
            options: {
              target: `http://localhost:${this.ngServerPort}`,
              changeOrigin: true,
              followRedirects: true
            }
          }
        ]
      },
      ...this.shared,
      plugins: [pluginConsolidate('pug', { isElectron: false }), ...this.shared.plugins, pluginAngularAot()]
    }),
    electron: {
      renderer: fusebox({
        target: 'browser',
        output: 'dist/desktop/wwwroot/assets/js',
        entry: this.aot
          ? this.prod ? 'ngc/electron/angular/main.aot.prod.js' : 'ngc/electron/angular/main.aot.js'
          : this.prod ? 'src/electron/angular/main.prod.ts' : 'src/electron/angular/main.ts',
        webIndex: { template: 'src/browser/index.pug', distFileName: '../../index.html', publicPath: 'assets/js' },
        dependencies: { ignorePackages: packageJson.fuse.browser },
        devServer: false,
        env: Object
          .keys(process.env)
          .filter(k => k.includes('NG_'))
          .reduce((acc, curr) => ({ ...acc, [curr.replace('NG_', '')]: process.env[curr] }), {
            NG_SERVER_HOST: maybe(process.env.HOSTNAME).valueOr(`http://localhost:${this.ngServerPort}`)
          }),
        ...this.shared,
        plugins: [pluginConsolidate('pug', { isElectron: true }), ...this.shared.plugins]
      }),
      main: fusebox({
        target: 'electron',
        entry: 'src/electron/app.ts',
        output: 'dist/desktop',
        useSingleBundle: true,
        devServer: false,
        sourceMap: false,
        dependencies: {
          ignoreAllExternal: false,
          ignorePackages: packageJson.fuse.electron
        },
        ...this.shared
      })
    },
    serveHandler: (handler: UserHandler) => {
      if (this.serve) {
        this.killServer()
        handler.onComplete(complete => {
          this.setServerRef(complete.server)
          if (!this.prod) {
            const scriptArgs = this.watch ? [`--port=${this.ngServerPort}`] : []
            exec('assets.pwa.ngsw.config').then(() => {
              complete.server.handleEntry({ nodeArgs: [], scriptArgs })
            })
          }
        })
      }
    }
  }
}

const { task, exec, rm, src } = sparky(BuildContext)

task('assets.copy', ctx => Promise.all([
  src('./src/assets/**/*.*').dest('./dist/wwwroot/assets', 'assets').exec(),
  ctx.electron
    ? Promise.all([
      exec('icns'),
      src('./src/assets/**/*.*').dest('./dist/desktop/wwwroot/assets', 'assets').exec(),
      src('./tools/scripts/bytecode.js').dest('./dist/desktop', 'scripts').exec(),
    ]) as any
    : Promise.resolve<string[]>([])
]))

task('assets.compress', async ctx => {
  return await compressStatic(['dist/wwwroot']).catch(err => {
    console.log(err)
    process.exit(-1)
  })
})

task('assets', ctx => Promise.all([
  exec('assets.copy'),
  !ctx.pwa ? Promise.resolve() : exec('assets.pwa.ngsw')
]))

task('ngc', ctx => {
  return (ctx.watch ? ngcWatch().then(proc => ctx.ngcProcess = maybe(proc)) : ngc())
    .catch(err => {
      console.log(err.toString())
      process.exit(-1)
    })
})

task('build', ctx => (ctx.aot ? exec('ngc') : Promise.resolve())
  .then(() => exec('assets'))
  .then(() => ctx.prod ? exec('build.prod') : exec('build.dev')))

task('build.dev', ctx => exec('build.dev.server').then(() => Promise.all([
  exec('build.dev.browser'),
  ctx.electron ? exec('build.dev.electron') : Promise.resolve()])
  .then(() => exec('assets.pwa.ngsw.config'))

))
task('build.dev.electron', ctx => ctx.fusebox.electron.renderer.runDev().then(() => ctx.fusebox.electron.main.runDev(h => {
  if (ctx.serve) {
    h.onComplete(b => {
      b.electron.handleMainProcess()
    })
  }
})))
task('build.dev.browser', ctx => { return ctx.fusebox.browser.runDev() })
task('build.dev.server', ctx => ctx.fusebox.server.runDev(ctx.fusebox.serveHandler))

task('build.prod', ctx => exec('build.prod.server')
  .then(() => Promise.all([exec('build.prod.browser'), ctx.electron ? exec('build.prod.electron') : Promise.resolve()]))
  .then(() => exec('assets.pwa.ngsw.config'))
  .then(() => exec('assets.compress'))
  .then(() => {
    if (ctx.serve && ctx.prod) {
      // assets.compress Promise is not working!
      ctx.serverRef.tapSome(a => a.handleEntry())
    }
  }))

task('build.prod.browser', ctx => ctx.fusebox.browser.runProd())
task('build.prod.server', ctx => ctx.fusebox.server.runProd({
  handler: ctx.fusebox.serveHandler
}))
task('build.prod.electron', ctx => ctx.fusebox.electron.renderer.runProd({ uglify: true }).then(() => ctx.fusebox.electron.main.runProd({
  handler: handler => {
    if (ctx.serve) {
      handler.onComplete(b => {
        b.electron.handleMainProcess()
      })
    }
  }
})))

task('assets.pwa.ngsw', _ctx => src('./node_modules/@angular/service-worker/ngsw-worker.js')
  .contentsOf(/ngsw-worker.js/, content => minify(content).code || content)
  .dest('./dist/wwwroot', 'node_modules/@angular/service-worker')
  .exec())

task('assets.pwa.ngsw.config', _ctx => {
  // TODO: convert to promise
  spawnSync('node_modules/.bin/ngsw-config', ['dist/wwwroot', 'src/browser/ngsw.json'])
})

task('icns', _ctx => spawn('./tools/scripts/icns.sh', ['dist/desktop/icon', 'src/assets/icons/favicon-1024x1024.png']))

task('default', ctx => {
  rm('dist')
  rm('ngc')

  process.on('exit', () => {
    ctx.killServer()
    ctx.killNgc()
  })

  return exec('build').then(() => {
    if(!ctx.e2e) return Promise.resolve()
    
    return run({
      browser: 'chrome',
      config: {
        baseUrl: 'http://localhost:4200',
        chromeWebSecurity: false,
        video: false,
        integrationFolder: 'cypress/build',
      }
    }).then(res => {
      ctx.killServer()
      if (res.totalFailed > 0) {
        return Promise.reject('E2E failures')
      } else {
        return Promise.resolve()
      }
    }).catch(err => {
      ctx.killServer()
      throw new Error(err)
    })
  })
})
