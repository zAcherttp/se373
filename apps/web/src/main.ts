/**
 * Web application entry: a bootstrap thin enough to be uninteresting.
 *
 * Module-table seeding, the boot page, and the UI-renderer handoff all live in
 * `@se373/client-web`. This file finds the mount point and gets out of the way,
 * which is what keeps the shell a vendored package rather than a fork.
 *
 * @module @se373/web-frontend/main
 */
import { AppWebEntry } from '@se373/client-web'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
void new AppWebEntry(el).run()
