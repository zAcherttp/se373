import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@se373/client-modules',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
