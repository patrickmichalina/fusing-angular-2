import { FuseBox, QuantumPlugin } from "fuse-box"
import { NgCompilerPlugin } from "./tools/plugins/ng.compiler.plugin"
import { NgPolyfillPlugin } from "./tools/plugins/ng.polyfill.plugin"
import { NgProdPlugin } from "./tools/plugins/ng.prod.plugin"
import { maybe } from 'typescript-monads'

export interface FusingAngularConfig {
  readonly productionBuild: boolean
  readonly supportIE11: boolean
  readonly supportIE11Animations: boolean
  readonly enableAotCompilaton: boolean
  readonly enableAngularAnimations: boolean
  readonly enableAngularForms: boolean
  readonly enableServiceWorker: boolean
  readonly enableAngularBuildOptimizer: boolean
  readonly minify: boolean
  readonly treeshake: boolean
  readonly watch: boolean
  readonly port: number
  readonly homeDir: string
  readonly outputDir: string
  readonly vendorBundleName: string
  readonly appBundleName: string
  readonly serverBundleName: string
  readonly browserEntry: string
  readonly browserAotEntry: string
}

const DEFAULT_CONFIG: FusingAngularConfig = {
  enableAotCompilaton: false,
  productionBuild: false,
  supportIE11: true,
  supportIE11Animations: false,
  enableAngularAnimations: false,
  enableAngularForms: false,
  enableServiceWorker: false,
  enableAngularBuildOptimizer: false,
  minify: false,
  treeshake: false,
  watch: false,
  port: maybe(process.env.PORT).map(v => +v).valueOr(5000),
  homeDir: 'src',
  outputDir: '.dist',
  vendorBundleName: 'vendor',
  appBundleName: 'app',
  serverBundleName: 'server',
  browserEntry: 'main',
  browserAotEntry: 'main.aot'
}

export const fusingAngular = (opts: Partial<FusingAngularConfig>) => {
  const settings = {
    ...DEFAULT_CONFIG,
    ...opts
  }
  const fuseBrowser = FuseBox.init({
    homeDir: "src/browser",
    output: `${settings.outputDir}/public/js/$name.js`,
    target: 'browser@es6',
    plugins: [
      NgPolyfillPlugin(),
      NgCompilerPlugin({ enabled: settings.enableAotCompilaton }),
      NgProdPlugin({ enabled: opts.productionBuild, fileTest: settings.browserEntry }),
      QuantumPlugin({
        warnings: false,
        uglify: settings.minify,
        treeshake: settings.treeshake,
        bakeApiIntoBundle: settings.vendorBundleName,
        processPolyfill: settings.enableAotCompilaton
      })
    ] as any
  })

  const mainAppEntry = opts.enableAotCompilaton
    ? `${settings.browserAotEntry}.ts`
    : `${settings.browserEntry}.ts`

  const fuseServer = FuseBox.init({
    target: 'server@es5',
    homeDir: settings.homeDir,
    output: `${settings.outputDir}/$name.js`,
    plugins: [
      NgProdPlugin({ enabled: opts.productionBuild, fileTest: 'server.angular.module' }),
      NgPolyfillPlugin({ isServer: true, fileTest: 'server.angular.module' })
    ]
  })

  fuseBrowser
    .bundle(settings.vendorBundleName)
    .instructions(` ~ ${mainAppEntry}`)

  fuseBrowser
    .bundle(settings.appBundleName)
    .watch(`${settings.homeDir}/**`, () => settings.watch)
    .instructions(` !> [${mainAppEntry}]`)

  fuseServer
    .bundle(settings.serverBundleName)
    .watch(`${settings.homeDir}/**`, () => settings.watch)
    .instructions(" > [server/server.ts]")
    .completed(proc => proc.start())

  !opts.productionBuild && fuseServer.dev({
    root: settings.outputDir,
    port: settings.port,
    httpServer: false
  })

  fuseBrowser.run()
    .then(() => fuseServer.run())
}

fusingAngular({
  // productionBuild: true,
  // minify: true,
  // enableAotCompilaton: true
})