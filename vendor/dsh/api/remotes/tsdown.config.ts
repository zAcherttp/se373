import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@se373/api-remotes',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)
