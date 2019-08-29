import 'zone.js/dist/zone'
import 'core-js/proposals/reflect-metadata'
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic'
import { AppBrowserModule } from './app.browser.module'
import { enableProdMode } from '@angular/core'

enableProdMode()

platformBrowserDynamic()
  .bootstrapModule(AppBrowserModule)
  .catch(console.error)
