import { Plugin, File } from 'fuse-box'

const defaults = {}

export interface NgPolyfillPluginOptions {
  isServer?: boolean
}

export const NG_POLY_BASE = [
  'core-js/es7/reflect'
]
export const NG_POLY_SERVER = [
  ...NG_POLY_BASE,
  'zone.js/dist/zone-node',
  'zone.js/dist/long-stack-trace-zone'
]
export const NG_POLY_BROWSER = [
  ...NG_POLY_BASE,
  'zone.js/dist/zone'
]
export const NG_POLY_BROWSER_IE_ANIMATIONS = [
  'web-animations-js'
]
export const NG_POLY_BROWSER_IE = [
  'core-js/es6/symbol',
  'core-js/es6/object',
  'core-js/es6/function',
  'core-js/es6/parse-int',
  'core-js/es6/parse-float',
  'core-js/es6/number',
  'core-js/es6/math',
  'core-js/es6/string',
  'core-js/es6/date',
  'core-js/es6/array',
  'core-js/es6/regexp',
  'core-js/es6/map',
  'core-js/es6/weak-map',
  'core-js/es6/set'
]

const prepForTransform = (deps: string[]) => {
  return deps.map(dep => {
    return `import '${dep}'`
  }).join('\n')
}

export class NgPolyfillPluginClass implements Plugin {
  constructor(private opts: NgPolyfillPluginOptions = defaults) { }
  public test: RegExp = /(main.ts|main.aot.ts)/
  public dependencies: ['zone.js', 'core-js']

  onTypescriptTransform(file: File) {
    // const regex = new RegExp(/\/\/ FusePlugin: NgPolyfillPlugin/, 'g')
    // file.addStringDependency('core-js/es7/reflect')
    // file.addStringDependency('zone.js/dist/zone')
    file.contents = `${prepForTransform(this.buildSet())}\n${file.contents}`
    // file.contents = file.contents.replace(regex, prepForTransform(this.buildSet()))
  }

  buildSet() {
    if (this.opts.isServer) {
      return NG_POLY_SERVER
    } else {
      return NG_POLY_BROWSER
    }
    // return []
  }
}

export const NgPolyfillPlugin = (options?: NgPolyfillPluginOptions) => new NgPolyfillPluginClass(options);
