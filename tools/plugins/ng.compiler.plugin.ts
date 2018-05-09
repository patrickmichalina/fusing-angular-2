import { main as ngc } from '@angular/compiler-cli/src/main'
import { Plugin } from 'fuse-box'
import { resolve } from 'path';

const defaults: NgcPluginOptions = {
}

export interface NgcPluginOptions { 
  enabled?: boolean
}

export class NgcPluginClass implements Plugin {
  constructor(private opts: NgcPluginOptions = defaults) { }

  bundleStart() {
    this.opts.enabled && ngc(['-p', resolve('tsconfig.aot.json')])
  }
}

export const NgCompilerPlugin = (options?: NgcPluginOptions) => new NgcPluginClass(options);
